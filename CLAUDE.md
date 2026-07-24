# CLAUDE.md

智能八字 APP — AI/开发者入场合同。读完这份 + 末尾的 memory 索引即可开工。

## 项目定位

三端 + 一引擎 + 算法层。命理八字排盘 + AI 解读 + 付费深度报告 + 命理师一对一预约。

## 目录地图

- `miniprogram/` — 微信原生小程序(6 页:index / paipan / result / analysis / profile / four-school)
- `frontend/checkup.html` — 独立 H5 体检入口(加时辰未知引导 + 微信联系收口)
- `backend/` — Koa + MongoDB + Redis 后端
- `bazi-skill-dist/` — **命理知识引擎,产品护城河**:14 本古籍、四家投票法、紫微、公众人物案例、LightRAG 索引构建脚本
- `docs/` — 集成文档(integration/lightrag.md)与命理素材(命理知识库/)
- `.codeartsdoer/specs/` — SDD 规格(注意:栈描述与代码脱节,以代码为准)

## 技术栈

- **小程序**:微信原生 JS,无第三方 UI
- **后端**:Node + Koa + Mongoose + Redis + JWT + axios + `lunar-javascript` + log4js
- **AI**:OpenAI(`OPENAI_API_KEY`),AI 网关挂了要走本地降级模板(目前未实现,见陷阱)
- **RAG**:LightRAG,索引源是 `bazi-skill-dist/books/` `cases/` `core/`,端点 `LIGHTRAG_URL`

## 常用命令

```bash
# 装依赖
cd backend && npm install

# 起环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env:填 OPENAI_API_KEY / WX_APPID / WX_SECRET / LIGHTRAG_URL / JWT_SECRET

# 起 MongoDB(任选一种)
docker run -d --name bazi-mongo -p 27017:27017 mongo:7
# 或:本地装 Mongo 7 监听 27017

# 启动后端(8080)
cd backend && npm start
# 开发模式:npm run dev

# 跑测试(16 套件 / 130 用例 / 约 3.3s)
cd backend && npm test

# 联调:自签 JWT + 插 user + paid four_school 订单(幂等)
node backend/scripts/dev-seed-test-user.js
# 输出:token + userId + orderId,演示四家解读免登录用
```

## 关键路由速查

| 模块 | 路径 | 说明 |
|---|---|---|
| 用户 | `POST /api/v1/user/wx-login` | 微信登录,返回 JWT |
| 用户 | `GET /api/v1/user/profile` | 鉴权 |
| 排盘 | `POST /api/v1/bazi/paipan` | 免费,服务端权威排盘 |
| 排盘 | `GET /api/v1/bazi/history` | 鉴权 |
| 解读 | `POST /api/v1/analysis/basic` | 免费 |
| 解读 | `POST /api/v1/analysis/deep` | 鉴权 + 付费(deep_report / VIP) |
| 解读 | `POST /api/v1/analysis/four-school` | 鉴权 + 付费(four_school / VIP),四家投票法 |
| 解读 | `POST /api/v1/analysis/checkup` | 免费五行体检,7ms |
| 订单 | `POST /api/v1/order/create` | 鉴权,服务端定价 |
| 订单 | `POST /api/v1/order/callback` | **微信回调,公开**,唯一合法 paid 入口 |
| 订单 | `GET /api/v1/order/list` | 鉴权 |
| 订单 | `GET /api/v1/order/:orderId` | 鉴权,带归属校验 |
| 订单 | `POST /api/v1/order/:orderId/pay` | 鉴权,占位 paySign |
| 订单 | `POST /api/v1/order/:orderId/confirm` | 鉴权,只读轮询 |
| 健康 | `GET /health` | **顶级**,聚合 backend + LightRAG,LightRAG down 仍返 200 |

## 算法层约定

- **排盘权威在后端**:`backend/utils/bazi.js`,基于 `lunar-javascript`,边界 `MIN_YEAR=1900` `MAX_YEAR=2100`,超界抛 `INVALID_INPUT` 返 400
- **身强弱 / 喜忌 / 格局由 `mingju.js` 确定性算**,作为"已知结论"注入 prompt;**绝不信任客户端**传入的论断
- **AI 只翻译**:`utils/promptBuilder.js` 给基础/深度,`utils/fourSchoolPrompt.js` 给四家并列
- **农历输入**:`birth.calendar === 'lunar'` 走 `normalizeBirthToSolar`,闰月传负月份
- **RAG**:`utils/knowledgeRetriever.js` 的 `retrieve(mingju, { query })`,**四家投票时给各家传不同 query**,否则 refs 全相同

## 付费档

`deep_report` `four_school` 两种付费产品 + `vip_month` 月卡通行证。服务端定价在 `backend/config/products.js`,**忽略客户端传入的 amount**。`vip_month` 在微信回调 `grantEntitlement()` 里写用户 VIP 等级 + 到期时间;`deep_report` `four_school` 的权益判定逻辑见 `routes/analysis.js` 的 `hasDeepEntitlement` / `hasFourSchoolEntitlement`(持有有效 VIP 也算已付费)。

## 测试

- jest,16 套件 / 130 用例 / 3.288s 全绿(2026-07-24)
- 黄金基准:机主本人盘 2002-11-20 巳时男 + `bazi-skill-dist/cases/` 张学良 / 邵逸夫(均在 1900-2100 范围内)
- 跑命令:`cd backend && npm test`
- 测试目录:`backend/utils/__tests__/`(12 个) + `backend/routes/__tests__/`(2 个) + `backend/middleware/__tests__/`(1 个) + `backend/config/__tests__/`(1 个)
- 端到端 RAG 测试 mock HTTP,**不依赖 LightRAG 实际运行**

## 联调锚点(2026-07-24 实战)

详见 memory `project-bazi-end-to-end-debug`。简版矩阵:

| 用例 | 结果 | 耗时 |
|---|---|---|
| `/four-school` 合法盘 | 200 + mingju + sources.xu/liang/yuan/wei | 21.3s(被占位 OpenAI key 拖累) |
| `/checkup` | 200 + oneLiner | 7ms |
| `/four-school` 1800 错误盘 | 400 INVALID_INPUT | <10ms |
| `/four-school` 无 token | 401 | <10ms |
| `/health` LightRAG down | 200,lightrag=down | <10ms |

`scripts/dev-seed-test-user.js` 是给演示用的"零成本鉴权绕过":用 `.env` 同 `JWT_SECRET` 自签 7 天 token + 插 user(openid `dev-openid-four-school`)+ 插 1 条 paid four_school 订单。**幂等,重跑只更新同一条**。

## 已知陷阱(踩过的坑)

- **🔴 P0 #30 — AI fallback 21 秒假死**:`backend/routes/analysis.js` 的 `generateAnalysis()` 没 axios timeout,catch 返固定文案"命理解读生成中,请稍后再试。"。**演示前必修**。修法:axios 加 `timeout: 5000` + 在 catch 走本地降级模板(basic/deep/four-school 三条路径都要,四家不能共用一段换 4 个名字)。
- **🟡 P1 #31 — 无 Mongo 时权益检查永远 403**:`app.js` 日志写"运行模式:内存存储(无需数据库)",但权益检查用真 `Order.exists()` / `User.findById()`。当前解:装 Mongo 容器。根本解(可选):权益检查加 in-memory 注册表。
- **CORS `*`**:`backend/app.js` 的 `origin: '*'`,无 rate-limit 中间件。生产前必修。
- **`tasks.md` 与代码栈脱节**:`.codeartsdoer/specs/bazi_app/` 写 React Native + FastAPI + PostgreSQL,实际是原生小程序 + Koa + MongoDB。**以代码为准,不要被 spec 带偏**。
- **AI 网关超时**:axios 没显式 timeout 默认 0,等 TCP/AI 网关返回 → 21 秒假死。
- **RAG refs 全相同**:四家投票时 `retrieve(mingju)` 用同一 query,会导致徐乐吾/梁湘润/袁树珊/韦千里引用完全一样的 refs,差异化卖点消失。要 `retrieve(mingju, { query: queries.xu })` 给各家分别传 query。

## 路径 & 调试锚点

- 后端日志:`backend/logs/`
- 配置:`backend/.env`(`backend/.env.example` 是模板)
- 小程序 baseURL:`miniprogram/utils/request.js` 的 `BASE_URL`
- 命理知识源:`bazi-skill-dist/books/` `cases/` `core/`
- 健康检查:`http://localhost:8080/health`
- 公开排盘测试:`POST http://localhost:8080/api/v1/bazi/paipan` body `{ birthDate:'2002-11-20', birthTime:'10:00', gender:'male' }`

## memory 索引

更深的上下文(为什么 / 历史 / 决策)在 memory:

- `project-bazi-app-overview` — 项目结构、栈、阶段
- `project-bazi-pain-points` — 已知缺口清单
- `project-bazi-end-to-end-debug` — 端到联调实测问题清单
- `project-bazi-skill-integration` — bazi-skill-dist 与后端对接策略
- `project-bazi-improvements-2026-07-24` — 改进方向(按 ROI 排序)