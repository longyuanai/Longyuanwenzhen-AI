# 关于 `.codeartsdoer/specs/` 的说明

> 接手者注意:本仓库根目录的 `.codeartsdoer/` 目录在 `.gitignore` 中被整体排除(`*`),其中的 `specs/`(含 `bazi_app/`、`bazi_miniprogram/`)是**本地历史档案**,不入版本库。

## 为什么在 `.gitignore`

- 该目录是规划/规格产物(SDD 风格),由工具生成
- 与代码栈已严重脱节,留作历史参考即可,不污染主仓库

## 已知脱节点(2026-07-25 核对)

| 维度 | `.codeartsdoer/specs/` 描述 | **实际代码(以 CLAUDE.md 为准)** |
|---|---|---|
| 前端栈 | React Native + Expo | **微信小程序原生 JS**,无第三方 UI |
| 后端栈 | Python + FastAPI | **Node + Koa + Mongoose** |
| 数据库 | PostgreSQL | **MongoDB** + Redis 缓存 |
| 认证 | OAuth2 + Passport | **JWT**(jsonwebtoken) |
| AI 集成 | Claude / 本地 LLM | **OpenAI** + LightRAG |
| 命理引擎 | (无具体描述) | **lunar-javascript** + 自研 mingju 编排器 |

## 如何处理

- **不要**根据 `.codeartsdoer/specs/` 的栈描述修改代码
- **不要**尝试将其加入版本库(已 gitignore)
- **以代码为准**:看 `CLAUDE.md` → `docs/algorithm-pipeline.md` → `backend/utils/` 实际源码
- 如果需要历史规划文档,在本地翻 `.codeartsdoer/specs/bazi_app/`,确认它**仅作参考**,不影响工程决策

## 相关 memory

- [[project-bazi-pain-points]] 的"代码是真相源"教训条目