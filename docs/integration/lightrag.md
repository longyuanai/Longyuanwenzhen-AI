# LightRAG 集成说明

> 本文档面向**后端工程师 / 运维**，讲清楚「命理古籍 RAG 检索」如何从 `bazi-skill-dist/lightrag/merged.json` 一路串到产品接口。

---

## 一、为什么要接 RAG

`backend/utils/promptBuilder.js` 构造 AI 解读提示词时，原本只注入**确定性结论**(日主、身强弱、喜忌、格局)。AI 拿到这些后只能凭通用知识展开,缺乏古籍依据。

`bazi-skill-dist/lightrag/merged.json` 是个**预构建的命理知识图谱**:

- **45895 个实体**(格局、神煞、典籍、概念、人物)
- **108184 条关系**(生克、合化、师承、概念-引文)
- 全部带**原始典籍片段**和**来源标注**

接入后,AI 解读时可附带 **【古籍依据】** 区块(≤ 5 条),LLM 据此组织语言,产品专业感、可信度都上一个台阶。

---

## 二、架构

```
┌────────────────┐    HTTP POST /query     ┌─────────────────────┐
│  Node.js 后端  │ ───────────────────────▶│  LightRAG Server    │
│                │                         │  (Python 进程)      │
│ knowledgeRetriever.js                     │                     │
│  ↓                                        │  工作目录:          │
│ promptBuilder.js                          │  ~/knowledge-bases/ │
│  ↓                                        │    kbs/bazi-mingli/ │
│ 路由 /analysis /order                     │                     │
└────────────────┘                         │  知识源:            │
                                           │  bazi-skill-dist/   │
                                           │    lightrag/        │
                                           │    merged.json      │
                                           └─────────────────────┘

失败兜底:LightRAG 挂掉 / 启不来 / 网络断
  → knowledgeRetriever.js 返回 []
  → promptBuilder.js 不注入【古籍依据】区块
  → AI 解读功能正常出结果(只是不带古籍引证)
```

**关键约束**:

- LightRAG 是**独立 Python 进程**,跟 Node.js 后端解耦
- 后端**任何时候都不能**因为 RAG 不可用而报错或拒绝响应
- 检索超时硬限 **3 秒**(默认),拖不起 AI 解读的整体延迟

---

## 三、LightRAG 服务部署(运维一次性操作)

### 3.1 准备 Python 环境

```bash
# 1. 装 uv(包管理器,一次)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. 装 LightRAG
pip install lightrag

# 或用 uv tool:
uv tool install lightrag
```

> ⚠️ **部署踩坑记录(2026-07-24 开发机实测)**
>
> - Windows 默认 Python 安装**不会绑 pip**,`pip`、`pip install lightrag` 直接报 `command not found`
> - Fallback: `python -m ensurepip` 装内置 pip,或 `python -m pip install lightrag`
> - 仍失败:用 [uv](https://astral.sh/uv/install.sh) 全自动装 Python+pip+包
> - Linux/macOS 一般没这问题,但 Docker 基础镜像如果是 `python:slim` 也要手动 `ensurepip`
>
> 部署这台机器一定要**事先** `python -c "import lightrag; print(lightrag.__version__)"` 能输出版本号,再进 inject 步骤。

### 3.2 启动 LightRAG HTTP Server

```bash
# LightRAG 自带 HTTP 服务,默认监听 9621,提供 /query 和 /health
lightrag-server \
  --working-dir ~/knowledge-bases/kbs/bazi-mingli \
  --port 9621
```

启动后验证:

```bash
curl http://127.0.0.1:9621/health
# 期望: 200 OK

curl -X POST http://127.0.0.1:9621/query \
  -H "Content-Type: application/json" \
  -d '{"query":"建禄格","mode":"mix","top_k":3}'
# 期望: { response, references: [...] }
```

### 3.3 灌入命理知识图谱

`bazi-skill-dist/scripts/inject_kg.py` 是知识注入脚本(用 `knowledge-mcp` 封装层,需要单独装)。**生产环境推荐路径**:

**方案 A — 用 inject_kg.py(开发环境推荐)**

```bash
# 1. 装 knowledge-mcp(给 inject 脚本用)
uv tool install knowledge-mcp

# 2. 配 LLM API key
mkdir -p ~/knowledge-bases
cat > ~/knowledge-bases/.env <<'EOF'
LLM_API_KEY=sk-your-openai-key-here
EOF

# 3. 跑注入
cd bazi-skill-dist/scripts
python3 inject_kg.py
# 完成后: Done: 45895 entities, 108184 relationships injected
```

**方案 B — 直接用 LightRAG 的 ainsert_custom_kg(生产推荐,脚本可控)**

```python
from lightrag import LightRAG
import json

rag = LightRAG(working_dir="~/knowledge-bases/kbs/bazi-mingli")
await rag.initialize_storages()

with open("bazi-skill-dist/lightrag/merged.json") as f:
    merged = json.load(f)

await rag.ainsert_custom_kg({
    "chunks": [],
    "entities": merged["entities"],
    "relationships": merged["relationships"]
})
```

### 3.4 作为后台服务(生产)

```bash
# systemd 单元示例 /etc/systemd/system/lightrag-bazi.service
[Unit]
Description=LightRAG bazi-mingli server
After=network.target

[Service]
ExecStart=/usr/local/bin/lightrag-server --working-dir /var/lib/knowledge-bases/kbs/bazi-mingli --port 9621
Restart=always
User=lightrag

[Install]
WantedBy=multi-user.target
```

---

## 四、后端配置

### 4.1 环境变量(`backend/.env`)

```bash
# LightRAG 服务地址(默认 http://127.0.0.1:9621)
LIGHTRAG_URL=http://127.0.0.1:9621

# 检索超时毫秒(默认 3000,3 秒)
LIGHTRAG_TIMEOUT=3000

# 检索返回条数(默认 5,注入到 prompt 的古籍片段数)
LIGHTRAG_TOPK=5
```

### 4.2 接入调用

```js
const { retrieve } = require('./utils/knowledgeRetriever')
const { analyzeMingju } = require('./utils/mingju')
const { paipan } = require('./utils/bazi')
const { buildDeepPrompt } = require('./utils/promptBuilder')

// 1. 排盘 + 命局分析(确定性)
const bazi = paipan({ year, month, day, hour, gender })
const mingju = analyzeMingju(bazi)

// 2. RAG 检索(网络,可能降级为 [])
const knowledgeContext = await retrieve(mingju)

// 3. 构造 prompt(无论 RAG 成功失败,prompt 都正常生成)
const prompt = buildDeepPrompt(baziStr, dayunStr, mingju, knowledgeContext)
```

`retrieve()` 永远不抛错:任何失败(ECONNREFUSED / timeout / 500 / 非法 mingju)都返回 `[]`,由调用方决定是否注入。

---

## 五、降级行为矩阵

| 场景 | retrieve() 返回 | promptBuilder 表现 | 用户感知 |
|------|----------------|-------------------|---------|
| LightRAG 正常 | `[ {content, source, score}, ... ]` | 注入【古籍依据】区块 | AI 解读带古籍引证 |
| 服务挂(ECONNREFUSED) | `[]` | 不注入区块 | AI 解读正常,不带古籍引证 |
| 超时(>3s) | `[]` | 不注入区块 | 同上 |
| LightRAG 返回 500 | `[]` | 不注入区块 | 同上 |
| mingju 参数非法 | `[]` | 不注入区块 | 同上 |
| response 只有字符串,无 references | `[{content, source:'LightRAG'}]` | 注入但 source 模糊 | 弱降级,仍能引证 |

**运维信号**:如果发现 `lastError` 频繁非空,说明 LightRAG 在挂或网络断,需排查。

---

## 六、测试

### 6.1 单元测试(mock HTTP,无需 LightRAG)

```bash
cd backend
npx jest utils/__tests__/knowledgeRetriever.test.js
npx jest utils/__tests__/promptBuilder.test.js
```

- `knowledgeRetriever.test.js` — 14 个用例:query 构造、200/references 解析、200/response 字符串、500 降级、超时降级、ECONNREFUSED 降级、参数容错、healthCheck
- `promptBuilder.test.js` — 7 个 RAG 用例:有 knowledgeContext 注入、空数组降级、缺省降级、优先级声明、formatKnowledgeContext 单元

全部**不需要** LightRAG 在跑(用 `jest.mock('axios')` 隔离)。

### 6.2 集成测试(需 LightRAG 在跑)

```bash
# 1. 启 LightRAG(参考第三节)
lightrag-server --port 9621 &

# 2. Node 端手动验证
node -e "
const { retrieve, healthCheck } = require('./utils/knowledgeRetriever');
(async () => {
  console.log('health:', await healthCheck());
  const { analyzeMingju } = require('./utils/mingju');
  const { paipan } = require('./utils/bazi');
  const mj = analyzeMingju(paipan({year:2002,month:11,day:20,hour:10,gender:'male'}));
  console.log('hits:', await retrieve(mj));
})();
"
```

### 6.2b 集成等价测试(无需 LightRAG,mock 真实结构)

`backend/utils/__tests__/integration.test.js` 用 mock axios 模拟**真实 LightRAG 响应**(字段来自 `bazi-skill-dist/books/` 实际典籍片段),覆盖:

- 满血 references → 多部典籍注入
- response 字符串 fallback
- `source`/`file_path` 字段名兼容(真实 LightRAG 不同版本字段不一致)
- `score` 是字符串而非数字时,retrieve 已做类型守卫不输出
- 用户视角端到端:RAG 命中/挂掉两种场景 prompt 对比

跑:`npx jest utils/__tests__/integration.test.js`

### 6.3 端到端冒烟

在小程序里走一次「基础解读」,观察后端日志:

- 有 RAG 日志:`[knowledge] retrieved 3 chunks in 412ms`
- 降级日志:`[knowledge] degraded: connect ECONNREFUSED 127.0.0.1:9621`

---

## 七、当前状态(2026-07-24)

| 组件 | 状态 | 文件 |
|------|------|------|
| Node 端检索器 | ✅ 已实现 | `backend/utils/knowledgeRetriever.js` |
| Prompt 注入 | ✅ 已实现 | `backend/utils/promptBuilder.js` (formatKnowledgeContext) |
| 单元测试 | ✅ 14 + 7 全过 | `backend/utils/__tests__/knowledgeRetriever.test.js`, `promptBuilder.test.js` |
| **集成等价测试(mock 真实响应)** | ✅ **6 个用例全过** | `backend/utils/__tests__/integration.test.js` |
| 集成测试(实环境) | ⏳ 实测发现:Windows 默认 Python 不绑 pip,需 `python -m ensurepip` 或 uv | — |
| LightRAG 服务部署 | ⏳ 开发机 Python 环境未就绪 | — |
| 健康检查接入 /api/health | ⏳ 未接 | `backend/routes/health.js` 待加 |

---

## 八、常见问题

**Q1. LightRAG 启动失败?**
检查 LLM API key 是否写入 `~/knowledge-bases/.env`,以及 `lightrag-server` 命令是否在 PATH。

**Q2. 后端拿到 `ECONNREFUSED` 一直降级?**
- 进程在不在:`ps aux | grep lightrag-server`
- 端口在不在:`netstat -ln | grep 9621`
- 防火墙挡没挡:`curl http://127.0.0.1:9621/health` 本机能否通

**Q3. AI 解读里出现古籍名但内容对不上?**
LightRAG 的 `references[].file_path` 字段,文档里默认是相对路径,知识图谱里被我们映射成 `source` 字段。如果对不上,检查 `buildQuery()` 构造的查询是否包含足够的命理关键词(日主、身强、喜忌、格局、调候)。

**Q4. 检索延迟高?**
- 减小 `LIGHTRAG_TOPK`(从 5 → 3)
- 减小 `LIGHTRAG_TIMEOUT`(从 3000 → 1500,会牺牲部分长尾)
- 检查 LightRAG 进程 CPU/内存占用,考虑换 SSD

---

## 九、相关文件清单

| 路径 | 作用 |
|------|------|
| `backend/utils/knowledgeRetriever.js` | Node 端检索器(HTTP 客户端 + 降级) |
| `backend/utils/promptBuilder.js` | AI 提示词构造(含【古籍依据】注入) |
| `backend/utils/__tests__/knowledgeRetriever.test.js` | 14 个单元测试 |
| `backend/utils/__tests__/promptBuilder.test.js` | 7 个 RAG 集成单元测试 |
| `bazi-skill-dist/lightrag/merged.json` | 预构建知识图谱(46MB) |
| `bazi-skill-dist/scripts/inject_kg.py` | 知识图谱注入脚本 |
| `bazi-skill-dist/scripts/build_kg.py` | 知识图谱重建脚本(更新典籍时用) |
| `bazi-skill-dist/core/rag-usage.md` | RAG 高级使用指南(给 AI Agent 看) |