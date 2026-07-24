#!/bin/bash
# 八字 + 紫微斗数 命理 Skill 安装脚本（macOS / Linux）
# 自动检测并安装到多个 AI Agent 工具（Claude Code / Codex CLI / OpenCode 等）
# Windows 用户请用 setup.bat

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="bazi-ziwei-mingli"

# 检测平台
OS="$(uname -s)"
case "$OS" in
    Darwin)  PLATFORM="macOS" ;;
    Linux)   PLATFORM="Linux" ;;
    MINGW*|MSYS*|CYGWIN*)
        echo "提示：检测到 Git Bash / MSYS / Cygwin。"
        echo "如遇问题，Windows 原生用户可改用 setup.bat。"
        PLATFORM="Windows-Bash"
        ;;
    *) PLATFORM="Unknown" ;;
esac

echo "=========================================="
echo " 八字 + 紫微斗数 命理 Skill 安装"
echo "=========================================="
echo "平台: $PLATFORM"
echo ""

# ====== 检测已安装的 AI Agent 工具 ======
TARGETS=()
TARGET_LABELS=()

# Claude Code
CLAUDE_DIR="${HOME}/.claude/skills"
if [ -d "${HOME}/.claude" ] || command -v claude &> /dev/null; then
    TARGETS+=("$CLAUDE_DIR")
    TARGET_LABELS+=("Claude Code (~/.claude/skills/)")
fi

# Codex CLI（OpenAI Codex CLI 用 ~/.agents/skills/）
CODEX_DIR="${HOME}/.agents/skills"
if [ -d "${HOME}/.agents" ] || command -v codex &> /dev/null; then
    TARGETS+=("$CODEX_DIR")
    TARGET_LABELS+=("Codex CLI (~/.agents/skills/)")
fi

# OpenCode（兼容 Claude Code 路径，部分版本用 ~/.config/opencode/skills/）
OPENCODE_DIR="${HOME}/.config/opencode/skills"
if [ -d "${HOME}/.config/opencode" ] || command -v opencode &> /dev/null; then
    TARGETS+=("$OPENCODE_DIR")
    TARGET_LABELS+=("OpenCode (~/.config/opencode/skills/)")
fi

# 如果没检测到任何，默认装到 Claude Code 路径（最通用）
if [ ${#TARGETS[@]} -eq 0 ]; then
    echo "未检测到已安装的 AI Agent 工具。"
    echo "默认安装到 Claude Code 路径（~/.claude/skills/）。"
    echo ""
    TARGETS+=("$CLAUDE_DIR")
    TARGET_LABELS+=("Claude Code (~/.claude/skills/) [默认]")
fi

# ====== 选模式 ======
echo "检测到以下 AI Agent 工具："
for i in "${!TARGET_LABELS[@]}"; do
    echo "  $((i+1)). ${TARGET_LABELS[$i]}"
done
echo ""
echo "选择安装模式："
echo "  1) Level 1: 轻量模式（推荐，零依赖）"
echo "     Agent 直接读取 books/ 和 core/ 笔记"
echo "  2) Level 2: 高级模式（含 LightRAG 知识图谱）"
echo "     需要 Python 3.12.x + uv + knowledge-mcp"
echo ""
read -p "选择 [1/2]: " mode

# ====== Level 1：装到所有检测到的工具 ======
echo ""
echo "[1/3] 安装 skill 到所有检测到的工具"

for target_dir in "${TARGETS[@]}"; do
    target_path="$target_dir/$SKILL_NAME"
    mkdir -p "$target_dir"
    if [ -e "$target_path" ] || [ -L "$target_path" ]; then
        echo "   $target_path 已存在 → 备份为 .bak"
        rm -rf "${target_path}.bak"
        mv "$target_path" "${target_path}.bak"
    fi
    ln -s "$SCRIPT_DIR" "$target_path"
    echo "   已链接: $target_path"
done

echo ""
echo "[2/3] 验证安装"
ALL_OK=1
for target_dir in "${TARGETS[@]}"; do
    target_path="$target_dir/$SKILL_NAME"
    if [ -f "$target_path/SKILL.md" ]; then
        echo "   ✓ $target_path/SKILL.md 可访问"
    else
        echo "   ✗ $target_path/SKILL.md 不可访问"
        ALL_OK=0
    fi
done
[ $ALL_OK -ne 1 ] && exit 1

if [ "$mode" = "1" ]; then
    echo ""
    echo "[3/3] Level 1 安装完成 ✓"
    echo ""
    echo "重启你的 AI Agent 后，在对话中说："
    echo "  > 帮我排八字 阳历 1990年5月15日 上午10点 男 北京"
    echo "  > 帮我看 2026 年的流年流月"
    echo ""
    echo "卸载方法："
    for target_dir in "${TARGETS[@]}"; do
        echo "  rm $target_dir/$SKILL_NAME"
    done
    echo ""
    exit 0
fi

# ====== Level 2: LightRAG 模式 ======
echo ""
echo "[3/5] 检查 LightRAG 依赖"

if ! command -v uv &> /dev/null; then
    echo "   ✗ uv 未安装"
    echo "   请先安装:"
    echo "     curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
echo "   ✓ uv 已安装"

# 检查 Python 3.12（knowledge-mcp 仅支持 3.12.x）
PY312_FOUND=""
for cmd in python3.12 python3 python; do
    if command -v "$cmd" &> /dev/null; then
        VERSION=$("$cmd" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
        if [ "$VERSION" = "3.12" ]; then
            PY312_FOUND="$cmd"
            break
        fi
    fi
done

if [ -z "$PY312_FOUND" ]; then
    echo "   ⚠ 未找到 Python 3.12.x（knowledge-mcp 要求 >=3.12 <3.13）"
    echo "   推荐安装方式："
    echo "     uv python install 3.12"
    echo "   或访问 https://www.python.org/downloads/release/python-3120/"
    read -p "   继续安装？[y/N]: " continue_anyway
    if [ "$continue_anyway" != "y" ] && [ "$continue_anyway" != "Y" ]; then
        exit 1
    fi
else
    echo "   ✓ Python 3.12 已安装 ($PY312_FOUND)"
fi

echo ""
echo "[4/5] 安装 knowledge-mcp"
if ! uv tool list 2>/dev/null | grep -q "knowledge-mcp"; then
    if ! uv tool install knowledge-mcp; then
        echo "   ✗ knowledge-mcp 安装失败"
        echo "   手动安装: uv tool install knowledge-mcp --python 3.12"
        exit 1
    fi
    echo "   ✓ knowledge-mcp 已安装"
else
    echo "   ✓ knowledge-mcp 已存在"
fi

echo ""
echo "[5/5] 注入知识图谱"
echo ""
echo "请先确认配置已就绪："
echo "  ~/knowledge-bases/.env 包含 LLM_API_KEY=sk-xxx"
echo "  ~/knowledge-bases/config.yaml 已配置好"
echo "  详见 core/rag-usage.md"
echo ""
read -p "配置已就绪，开始注入？[y/N]: " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    cd "$SCRIPT_DIR/scripts"
    python3 inject_kg.py
    echo ""
    echo "Level 2 安装完成 ✓"
    echo "知识库位置: ~/knowledge-bases/kbs/bazi-mingli"
    echo ""
    echo "在 Agent 的 MCP 配置中加 knowledge-mcp 后即可使用："
    echo "  > 在命理知识库里查 '武曲化忌怎么解'"
else
    echo ""
    echo "稍后手动注入: cd scripts && python3 inject_kg.py"
fi
