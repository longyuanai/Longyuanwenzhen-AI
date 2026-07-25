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
- **AI**:OpenAI(`OPENAI_API_KEY`),端点/模型可用 `OPENAI_BASE_URL` / `OPENAI_MODEL` 覆盖;AI 网关挂了走本地降级模板(`utils/localFallback.js`,五条路径各自不同)
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

# 跑测试(30 套件 / 265 用例 / 约 8s)
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
| 排盘 | `POST /api/v1/bazi/paipan` | 免费(`authOptional`),服务端权威排盘;登录则落库 |
| 排盘 | `GET /api/v1/bazi/history` | 鉴权,返回本人排盘记录(`?limit=` 1-100,默认 20) |
| 解读 | `POST /api/v1/analysis/basic` | 免费 |
| 解读 | `POST /api/v1/analysis/deep` | 鉴权 + 付费(deep_report / VIP) |
| 解读 | `POST /api/v1/analysis/four-school` | 鉴权 + 付费(four_school / VIP),四家投票法 |
| 解读 | `POST /api/v1/analysis/dayun-segment` | 鉴权 + 付费(dayun_segment 19.9 / VIP),单段深度 |
| 解读 | `POST /api/v1/analysis/dayun-full` | 鉴权 + 付费(dayun_full 49.9 / VIP),8 段全卷 |
| 解读 | `POST /api/v1/analysis/checkup` | 免费五行体检,7ms,响应含 currentDaYun |
| 订单 | `POST /api/v1/order/create` | 鉴权,服务端定价 |
| 订单 | `POST /api/v1/order/callback` | **微信回调,公开**,唯一合法 paid 入口 |
| 订单 | `GET /api/v1/order/list` | 鉴权 |
| 订单 | `GET /api/v1/order/:orderId` | 鉴权,带归属校验 |
| 订单 | `POST /api/v1/order/:orderId/pay` | 鉴权,占位 paySign |
| 订单 | `POST /api/v1/order/:orderId/confirm` | 鉴权,只读轮询 |
| 健康 | `GET /health` | **顶级**,聚合 backend + LightRAG,LightRAG down 仍返 200 |

## 算法层约定

- **排盘权威在后端**:`backend/utils/bazi.js`,基于 `lunar-javascript`,边界 `MIN_YEAR=1900` `MAX_YEAR=2100`,超界抛 `INVALID_INPUT` 返 400
- **小程序排盘走服务端**:`pages/paipan/paipan.js` 调 `/bazi/paipan`,网络不可达才降级本地 `utils/bazi.js`(结果打 `isLocalFallback`,结果页出提示条)。后端明确返 400(如超界)时**不兜底**,直接报错——本地算法只会算出一个同样无效的盘。
- **两端排盘一致性由节气表保证**:`miniprogram/utils/solarTerms.js`(1899-2101,22KB)由 `backend/scripts/gen-solar-terms.js` 从 lunar-javascript 预生成,本地的立春分年/节气分月/起运年龄都基于它,与后端**按构造对齐**。表范围比支持范围两端各多一年(年初年末算起运要查相邻年的节)。
  改任一侧排盘逻辑或重新生成表后,必须跑 `utils/__tests__/paipan-parity.test.js`(含 6 个年份逐日扫描)。重新生成:`npm run gen:solar-terms`。
- **身强弱 / 喜忌 / 格局由 `mingju.js` 确定性算**,作为"已知结论"注入 prompt;**绝不信任客户端**传入的论断
- **AI 只翻译**:`utils/promptBuilder.js` 给基础/深度,`utils/fourSchoolPrompt.js` 给四家并列
- **农历输入**:`birth.calendar === 'lunar'` 走 `normalizeBirthToSolar`,闰月传负月份
- **RAG**:`utils/knowledgeRetriever.js` 的 `retrieve(mingju, { query })`,**四家投票时给各家传不同 query**,否则 refs 全相同

## 付费档

`deep_report` `four_school` `dayun_segment` `dayun_full` 四种付费产品 + `vip_month` 月卡通行证。服务端定价在 `backend/config/products.js`,**忽略客户端传入的 amount**。`vip_month` 在微信回调 `grantEntitlement()` 里写用户 VIP 等级 + 到期时间;`deep_report` `four_school` `dayun_segment` `dayun_full` 的权益判定走 `utils/entitlementRegistry.js`(有 Mongo 查 Mongo,无 Mongo 走 in-memory 兜底 → 演示永远 200/403,**不会 21 秒假死**);持有有效 VIP 也算已付费。

## 测试

- jest,34 套件 / 303 用例 / ~9s 全绿(2026-07-25)
- 黄金基准:机主本人盘 2002-11-20 巳时男 + `bazi-skill-dist/cases/` 张学良 / 邵逸夫(均在 1900-2100 范围内)
- 跑命令:`cd backend && npm test`
- 测试目录:`utils/__tests__/`(20) + `routes/__tests__/`(8) + `middleware/__tests__/`(3) + `config/__tests__/`(2) + `scripts/__tests__/`(1)
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

- **✅ P0 #30 — AI fallback 21 秒假死 → 已修**:`generateAnalysis()` 已加 `timeout: 5000`,catch 走 `utils/localFallback.js` 的本地降级模板(basic/deep/four-school/dayun-segment/dayun-full 五条路径各自不同,不共用)。
- **🟡 P1 #31 — 无 Mongo 时权益检查永远 403**:`utils/entitlementRegistry.js` 已实现 in-memory 兜底(走 `mongoose.connection.readyState === 1` 判 Mongo 连接),Mongo 写失败不抛错。无 Mongo 演示不再永远 403。Mongo 命中结果缓存 60s(`ENTITLEMENT_CACHE_TTL_MS` 可调),退款/撤销后自动回源。
- **CORS `*` → 已修**:`middleware/security.js` 的 `corsAllow` 读 `ALLOWED_ORIGINS`,prod fail-closed;`analysisRateLimit` 60 req/min per IP(可 `RATE_LIMIT_DISABLED=1` 关)。**✅ 已从 `app.use` 全局改为只挂 `/api/v1/analysis` 路由段**——此前把 `/health`、`/bazi/paipan` 一起限了,健康检查会被自己的限流打成 429。范围由 `routes/__tests__/ratelimit-scope.test.js` 锁死。
- **限流计数优先走 Redis**:配了 `REDIS_URL` 则多实例共享计数,否则回落进程内 Map(单实例等价,多实例不精确)。Redis 客户端统一在 `utils/redisClient.js`,别再各处复制 `getRedis()`。
- **✅ 小程序 API 双前缀 → 已修**:`request.js` 的 `BASE_URL` 已含 `/api/v1`,页面里 url 只写 `/analysis/basic`。曾有页面写全路径拼成 `/api/v1/api/v1/...` 全部 404,且被上层 catch 静默降级掩盖。`normalizePath()` 现会剥掉重复前缀并 warn。
- **✅ 解读接口只收 birth → 已修**:`/analysis/*` 收 `birth:{year,month,day,hour,minute,gender}`,后端自行排盘。客户端算的四柱/五行不是入参(服务端权威)。小程序侧用 `utils/bazi.js` 的 `buildBirthPayload(result)` 统一构造。
- **`.env` 变量名**:以 `.env.example` 为准(`WX_SECRET` / `WXPAY_API_KEY` / `WXPAY_MCHID`)。`config/index.js` 兼容旧名 `WX_APPSECRET` / `WX_PAY_KEY`,新代码别用。`config/__tests__/env-wiring.test.js` 锁死这层接线。
- **微信 tabBar 图标只认 png/jpg**:`assets/images/*.svg` 是设计源,`*.png` 才是小程序实际引用的。改图标要同步产出 png。
- **`tasks.md` 与代码栈脱节**:`.codeartsdoer/specs/bazi_app/` 写 React Native + FastAPI + PostgreSQL,实际是原生小程序 + Koa + MongoDB。**以代码为准,不要被 spec 带偏**。
- **AI 网关超时**:axios 没显式 timeout 默认 0,等 TCP/AI 网关返回 → 21 秒假死。
- **RAG refs 全相同**:四家投票时 `retrieve(mingju)` 用同一 query,会导致徐乐吾/梁湘润/袁树珊/韦千里引用完全一样的 refs,差异化卖点消失。要 `retrieve(mingju, { query: queries.xu })` 给各家分别传 query。

## 路径 & 调试锚点

- **算法层链路文档**:`docs/algorithm-pipeline.md`(2026-07-25 新增,14 个 utils 文件分工表 + 数据流图 + 防坑清单)

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