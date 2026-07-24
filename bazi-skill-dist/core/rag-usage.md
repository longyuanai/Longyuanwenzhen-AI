# LightRAG RAG 详细使用指南

预构建的命理学知识图谱位于 `lightrag/merged.json`（44MB），从 36 部典籍中通过多轮 LLM 抽取得到：

- **45895 实体**：人物、概念、格局、神煞、星曜、典籍、方法
- **108184 关系**：生克、合化、师承、作者-典籍、概念-引文
- **来源标注**：每个实体/关系都关联到原始典籍片段

## 一、安装 LightRAG（一次性，约 5 分钟）

```bash
# 1. 安装 uv（如未安装）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. 安装 knowledge-mcp（LightRAG 的 MCP 包装）
uv tool install knowledge-mcp

# 3. 配置 LLM API key
mkdir -p ~/knowledge-bases
cat > ~/knowledge-bases/.env <<'EOF'
LLM_API_KEY=sk-your-openai-key-here
EOF

# 4. 配置 knowledge-mcp（参考其 GitHub 文档创建 config.yaml）
#    - LLM 模型（推荐 gpt-4o 或 claude-3-5-sonnet）
#    - embedding 模型（推荐 text-embedding-3-large）

# 5. 注入命理知识图谱
cd scripts
python3 inject_kg.py
# 完成后显示：Done: 45895 entities, 108184 relationships injected
```

或一键安装：`./setup.sh`，选 Level 2。

## 二、接入 AI Agent（MCP 配置）

注入后，在 AI Agent（Claude Code / Codex / OpenCode 等）的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "knowledge-mcp": {
      "command": "knowledge-mcp",
      "args": ["serve"]
    }
  }
}
```

重启 Agent 后，会出现以下 MCP 工具：

- `mcp__knowledge_mcp__list_kbs` — 列出所有知识库
- `mcp__knowledge_mcp__retrieve` — 在指定知识库中检索
- `mcp__knowledge_mcp__describe_kb` — 查看知识库元信息

知识库名 = `bazi-mingli`

## 三、四种查询模式

LightRAG 支持四种检索策略：

| 模式 | 适用场景 | 工作机制 |
|------|---------|---------|
| `naive` | 简单关键词查询 | 纯向量相似度，最快 |
| `local` | 具体实体/概念查询 | 实体邻域 + 局部上下文 |
| `global` | 抽象主题/全局规律 | 关系层面的子图聚合 |
| `hybrid` | 复杂综合问题（**默认推荐**） | local + global 结合 |

**选择规则：**

- 查具体词义（"什么叫食神"）→ `naive`
- 查实体邻域（"梁湘润提过哪些格局"）→ `local`
- 查抽象规律（"古代命学和现代命学的差异"）→ `global`
- 跨书综合（"武曲化忌怎么解，各家怎么说"）→ `hybrid`

## 四、Claude 调用 RAG 的标准流程

### Step 1 — 判断该不该用 RAG

**应该用 RAG：**
- 通读笔记 + books/ Grep 都查不到的问题
- 需要跨书对比的问题
- 需要图谱推理的问题（"X 和 Y 之间有什么关系"）
- 模糊查询（不知道精确关键词，只有大致主题）

**不该用 RAG：**
- 简单的排盘步骤问题（按 methodology.md 走就行）
- 已知精确典籍位置（直接 Read/Grep 即可，更快）
- 纯计算问题（如算空亡、算大运）

### Step 2 — 调用 retrieve 工具

```
mcp__knowledge_mcp__retrieve(
    kb_name="bazi-mingli",
    query="武曲化忌在财帛宫的化解方法，各家说法对比",
    mode="hybrid",
    top_k=10
)
```

参数说明：
- `kb_name`：必须是 `"bazi-mingli"`
- `query`：用**自然语言完整描述问题**，问题越具体结果越好
- `mode`：按"四种查询模式"选
- `top_k`：返回片段数，默认 10，复杂问题可上 20

### Step 3 — 解读返回结果

返回内容包括：
- **实体列表**：相关命理学概念，附描述和来源典籍
- **关系列表**：实体间的连接，附文字说明
- **原文片段**：典籍中支撑这些实体/关系的具体段落

**重要**：不要只读 RAG 概括，**必须看原文片段**。RAG 提供的是"地图"，原文才是"地形"。

### Step 4 — 与 books/ 直查交叉验证

最佳实践：

1. RAG 找到相关概念和大致位置 → 给出书名和段落标识
2. 用 Read 工具读完整上下文 → 验证 RAG 概括是否准确
3. 必要时用 Grep 在原书内进一步搜寻周边段落

**禁止**：直接复述 RAG 返回的概括而不查原文。这违反"非稽其已往"铁律。

## 五、实战示例

**问题**："丙辛合的具体作用是什么？各家说法？"

```
[1] 先 Grep books/ 查 "丙辛合"
    → 散落在多本书中，没有结构化总结

[2] 用 RAG 综合
    mcp__knowledge_mcp__retrieve(
        kb_name="bazi-mingli",
        query="丙辛合的作用与判断条件，徐乐吾/梁湘润/袁树珊/韦千里/沈孝瞻各家观点",
        mode="hybrid",
        top_k=15
    )

[3] 解读返回
    实体：丙辛合、合化水、合而不化、贪合忘官 ...
    关系：
      丙辛合 → 合化水（条件：地支水根透干）
      丙辛合 → 主威制之合（性质）
      丙辛合 → 主婚姻不正（引自三命通会）
    原文：从 滴天髓阐微 / 子平真诠评注 / 命理探原 等

[4] 用 Read 工具验证
    Read books/八字/滴天髓阐微.md 相关段落
    Read books/袁树珊/命理探原-袁树珊.txt 相关段落

[5] 综合输出
    分别列出各家观点，注明出处，标注共识与分歧
```

## 六、RAG 不可用时的回退

如果 knowledge-mcp 没装、注入失败、或 MCP 服务未启动：

- Claude 发现 `mcp__knowledge_mcp__*` 工具不存在
- **不要尝试启动**任何后台服务，直接回退到 books/ 直查模式
- 在回答末尾说明："本次未使用 LightRAG，仅基于典籍直接检索"

## 七、何时重建 KG

`lightrag/merged.json` 已经是预构建的，拿到包后只需注入即可使用。

若要更新或重建（例如加了新书）：

```bash
cd scripts
python3 build_kg.py prepare       # 切片
python3 build_kg.py extract --round 1 --parallel 10
python3 build_kg.py extract --round 2 --parallel 10
python3 build_kg.py cross-chunk --parallel 10
python3 build_kg.py merge
python3 inject_kg.py
```

整个流程会调用大量 LLM API，费用约 $20-50 USD（取决于模型选择）。

## 八、KG 中间数据（lightrag/intermediate/）

发布包含 4 个 KG 构建过程的中间产物：

| 文件 | 大小 | 内容 |
|------|------|------|
| `chunks.jsonl` | 13M | 典籍切片 + 每片的实体/关系预抽取 |
| `round1_results.jsonl` | 24M | 第一轮抽取（gpt-4o）原始输出 |
| `round2_results.jsonl` | 15M | 第二轮 gleaning（补抽）输出 |
| `cross_chunk_results.jsonl` | 14M | 跨片段实体对齐结果 |
| `adjacency.json` | 80K | 实体邻接图 |

这些是研究 KG 构建过程的素材，**正常使用时不需要**。
