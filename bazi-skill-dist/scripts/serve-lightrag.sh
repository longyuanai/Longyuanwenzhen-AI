#!/bin/bash
# serve-lightrag.sh - 一键起 LightRAG server + 灌预构建 merged.json 索引
#
# 用途:为熟人内测提供真实 RAG 引证,让 /four-school 和 /dayun-full 命中古籍。
#       不重跑 build_kg.py(那要 4-8h OpenAI 调用),直接灌 bazi-skill-dist/lightrag/merged.json。
#
# 用法:
#   cd bazi-skill-dist
#   OPENAI_API_KEY=sk-xxx bash scripts/serve-lightrag.sh
#
# 依赖:
#   - docker (LightRAG 镜像 ghcr.io/hkuds/lightrag:latest,端口 9621)
#   - uv (装 knowledge-mcp:uv tool install knowledge-mcp)
#   - python3 (inject_kg.py 用 asyncio)
#
# 副作用:
#   - 在 $KG_DATA_DIR 创建 LightRAG 工作目录(默认 ./lightrag-data/)
#   - 写 45895 entities + 108184 relations 到 $KG_DATA_DIR
#   - 启动名为 "lightrag-bazi" 的 docker 容器,占用 9621 端口
#
# 重跑幂等:LightRAG 工作目录可重用;想全清用 --reset。

set -e

# ---------- 参数 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BAZI_DIST_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KG_DATA_DIR="${KG_DATA_DIR:-$BAZI_DIST_DIR/lightrag-data}"
MERGED_PATH="${MERGED_PATH:-$BAZI_DIST_DIR/lightrag/merged.json}"
CONTAINER_NAME="${CONTAINER_NAME:-lightrag-bazi}"
PORT="${PORT:-9621}"
RESET=0
INJECT_ONLY=0

for a in "$@"; do
  case "$a" in
    --reset) RESET=1 ;;
    --inject-only) INJECT_ONLY=1 ;;
    --help|-h)
      echo "用法: OPENAI_API_KEY=sk-xxx bash $0 [--reset] [--inject-only]"
      echo "  --reset         清空 $KG_DATA_DIR 后重建"
      echo "  --inject-only   不起 docker,只灌索引(假设 server 已在 9621 跑)"
      exit 0
      ;;
  esac
done

# ---------- 前置检查 ----------
if [ "$INJECT_ONLY" = "0" ] && ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker 未安装。装 docker 后再跑,或用 --inject-only 让现有 server 灌索引。"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1 && ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: 需要 python3 或 uv 之一(用于跑 inject_kg.py)。"
  exit 1
fi

if [ ! -f "$MERGED_PATH" ]; then
  echo "ERROR: 找不到 $MERGED_PATH"
  echo "  应在 $BAZI_DIST_DIR/lightrag/merged.json"
  exit 1
fi

# ---------- 起 docker ----------
if [ "$INJECT_ONLY" = "0" ]; then
  if [ "$RESET" = "1" ] && [ -d "$KG_DATA_DIR" ]; then
    echo "[reset] 删除 $KG_DATA_DIR"
    rm -rf "$KG_DATA_DIR"
  fi
  mkdir -p "$KG_DATA_DIR"

  # 复用旧容器
  if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}\$"; then
    echo "[docker] 容器 $CONTAINER_NAME 已存在,启动它"
    docker start "$CONTAINER_NAME" >/dev/null
  else
    echo "[docker] 拉镜像 + 起容器 $CONTAINER_NAME"
    docker run -d \
      --name "$CONTAINER_NAME" \
      -p "$PORT:9621" \
      -e OPENAI_API_KEY="${OPENAI_API_KEY:?ERROR: 请先 export OPENAI_API_KEY=sk-... 或设到 .env}" \
      -e WORKING_DIR=/app/data/bazi_kg \
      -v "$KG_DATA_DIR:/app/data/bazi_kg" \
      ghcr.io/hkuds/lightrag:latest
  fi

  # 等 health
  echo "[docker] 等 /health ..."
  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
      echo "[docker] LightRAG ready at http://127.0.0.1:$PORT"
      break
    fi
    if [ "$i" = "30" ]; then
      echo "ERROR: LightRAG 30s 内未就绪,查 docker logs $CONTAINER_NAME"
      exit 1
    fi
    sleep 1
  done
fi

# ---------- 灌 merged.json ----------
# inject_kg.py 默认用 BAZI_KB_DIR 环境变量;这里把数据目录指到 docker 挂载目录。
# 因为 LightRAG server 重启会重新读取 working_dir 的 kv_store + vdb + graphml,
# 所以 inject_kg.py 写完后 server 自动拥有新数据,无需重启。

echo "[inject] 灌 $MERGED_PATH → $KG_DATA_DIR"
cd "$BAZI_DIST_DIR"
export BAZI_KB_DIR="$KG_DATA_DIR"
export BAZI_MERGED_PATH="$MERGED_PATH"

if command -v uv >/dev/null 2>&1; then
  uv run python scripts/inject_kg.py
else
  python3 scripts/inject_kg.py
fi

echo ""
echo "=== LightRAG 已就绪 ==="
echo "  HTTP:    http://127.0.0.1:$PORT"
echo "  数据目录: $KG_DATA_DIR"
echo "  测试:    curl -X POST http://127.0.0.1:$PORT/query -H 'Content-Type: application/json' -d '{\"query\":\"子平真诠 甲木\",\"mode\":\"mix\",\"top_k\":3}'"
echo ""
echo "后端 .env 需设: LIGHTRAG_URL=http://127.0.0.1:$PORT"