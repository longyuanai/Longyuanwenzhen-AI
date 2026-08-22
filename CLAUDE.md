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
- **AI**:OpenAI 协议(`OPENAI_API_KEY`),端点/模型用 `OPENAI_BASE_URL` / `OPENAI_MODEL` 覆盖。换 DeepSeek 等兼容厂商只改 .env,零代码改动。AI 网关挂了走本地降级模板(`utils/localFallback.js` / `.en.js`,五条路径各自不同)
- **RAG**:LightRAG,索引源是 `bazi-skill-dist/books/` `cases/` `core/`,端点 `LIGHTRAG_URL`

## 常用命令

```bash
# 装依赖
cd backend && npm install

# 起环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env:填 OPENAI_API_KEY / WX_APPID / WX_SECRET / LIGHTRAG_URL / JWT_SECRET

# 一条命令起全套(Mongo + Redis + 后端)
docker compose up -d
docker compose exec backend npm run preflight   # 配置自检,有阻断项退出码 1

# 或:只用容器起依赖,后端本机跑(改代码热重载)
docker compose up -d mongo redis
cd backend && npm run dev

# 跑测试(48 套件 / 529 用例 / 约 12s)
cd backend && npm test

# 排盘差分校验(与 tyme4ts 对比,改排盘逻辑后必跑)
cd backend && npm run diff:paipan            # 5000 随机盘
cd backend && npm run diff:paipan -- --scan=1984   # 逐日扫描某年

# 真太阳时模块同步到小程序(改了 backend/utils/trueSolarTime.js 后必跑)
cd backend && npm run gen:true-solar-time

# 神煞模块同步到小程序(改了 backend/utils/shensha.js 或 geju.js 后必跑)
cd backend && npm run gen:shensha

# 联调:自签 JWT + 插 user + paid four_school 订单(幂等)
node backend/scripts/dev-seed-test-user.js
# 输出:token + userId + orderId,演示四家解读免登录用
```

## 关键路由速查

| 模块 | 路径 | 说明 |
|---|---|---|
| 用户 | `POST /api/v1/user/wx-login` | 微信登录,返回 JWT |
| 用户 | `GET /api/v1/user/profile` | 鉴权 |
| 排盘 | `POST /api/v1/bazi/paipan` | 免费(`authOptional`),服务端权威排盘;登录则落库。可选 `birthPlace`/`longitude` 启用真太阳时 |
| 排盘 | `GET /api/v1/bazi/history` | 鉴权,返回本人排盘记录(`?limit=` 1-100,默认 20) |
| 排盘 | `POST /api/v1/bazi/history/sync` | 鉴权,批量同步本机记录(登录后合并) |
| 排盘 | `PUT /api/v1/bazi/history/:id` | 鉴权,改备注名(用 PUT 因 wx.request 不支持 PATCH) |
| 排盘 | `DELETE /api/v1/bazi/history` | 鉴权,清空本人记录 |
| 解读 | `POST /api/v1/analysis/basic` | 免费。**所有 /analysis/* 都收 `lang`(zh/en,默认 zh)** |
| 解读 | `POST /api/v1/analysis/deep` | 鉴权 + 付费(deep_report / VIP) |
| 解读 | `POST /api/v1/analysis/four-school` | 鉴权 + 付费(four_school / VIP),四家投票法 |
| 解读 | `POST /api/v1/analysis/dayun-segment` | 鉴权 + 付费(dayun_segment 19.9 / VIP),单段深度 |
| 解读 | `POST /api/v1/analysis/dayun-full` | 鉴权 + 付费(dayun_full 49.9 / VIP),8 段全卷 |
| 解读 | `POST /api/v1/analysis/checkup` | 免费五行体检,含 currentDaYun + `shenSha`(神煞/命宫身宫);`lang=en` 时附 `labels` 英文术语块 |
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
- **排盘正确性由第三方差分校验**:`npm run diff:paipan` 拿 `tyme4ts`(cantian-ai/bazi-mcp 的底层,与我们用的 lunar-javascript 同作者但为完整重写)当第二意见,逐柱 + 大运比对。`--scan=YYYY` 逐日扫描,`--seed=` 可复现。**改任何排盘逻辑后必跑** —— parity 测试只证明「两端算得一样」,差分才证明「算得对」。首轮就抓出了晚子时流派问题(见下条)。
- **晚子时(23 点)默认走流派 1**:日柱进次日,`BAZI_LATE_ZI_SECT=2` 可切回流派 2。流派 2 是 lunar-javascript 的默认值,但它会排出**矛盾盘** —— 1965-12-23 23:45 得 日柱`辛亥`+时柱`庚子`,而辛日的子时按五鼠遁应是`戊子`(庚子是从次日日干壬推来的)。于是时干十神拿错误的日主去算,`偏印`变`劫财`,再级联到身强弱/喜忌/格局。影响所有 23 点出生者(约 4%)。**改这个开关必须同步改 `miniprogram/utils/bazi.js` 的 `LATE_ZI_SECT`**,否则服务端排盘与本地兜底会对同一个盘给出不同结论。
- **起运年龄是「lunar 流派1」,不是算错**:tyme4ts 有 4 种起运 provider,实测 3000 盘只有 `LunarSect1ChildLimitProvider` 与我们 100% 一致(Default/China95/LunarSect2 各差 ~1%)。差分脚本已钉死该 provider,别删 —— 否则每次跑都冒出 1% 已知流派噪音,真 bug 就被淹了。
- **真太阳时默认关闭,传了出生地才校正**:`utils/trueSolarTime.js`。入参 `birthPlace`(122 城离线经度表)或 `longitude`,两者都不给就完全不校正 —— 历史记录里没有出生地,静默启用会改掉用户已看过的盘。**经度校正只是一半,另一半是均时差**(±16 分钟,足以跨时辰边界),用 NOAA/Meeus 算法,实测与天文年历偏差 <0.2 分钟。校正**会跨日**(喀什 00:30 退到前一天 21:34),跨日就换日柱换日主换全部十神,所以返回的是完整年月日而非只调时分。`input` 里存的始终是**钟表时间**,不是校正后的时刻 —— 否则拿 input 二次排盘会把校正叠加两次。小程序侧 `miniprogram/utils/trueSolarTime.js` 是**后端同一文件的生成物**(`npm run gen:true-solar-time`),`trueSolarTime.gen.test.js` 守住不同步就变红。
- **神煞只做展示型，凶煞刻意不实现**:`utils/shensha.js` 依据 `bazi-skill-dist/core/梁湘润神煞探原通读笔记.md`,算 13 个通行神煞(天乙/天德/月德/文昌/禄神/将星/华盖/驿马/桃花/羊刃/孤辰/寡宿/空亡)+ 命宫身宫。**自缢杀、冲天杀、戳肢杀、天屠杀这类凶煞不算也不显** —— 对 C 端用户有实际伤害,且命理类目审核最先盯恐吓性内容;梁本人也写明"神煞不能作为主要断法"。`shensha.test.js` 有一条用例专门拦「日后有人顺手把凶煞加回来」。禄神/羊刃表**复用 `geju.js`**,不另抄一份(否则「羊刃格」与「羊刃神煞」会各说各话)。
- **命宫身宫的公式是反推来的,靠差分守住**:`命宫支=(5−月支序−时支序) mod 12`(逆行),`身宫支=(月支序+时支序+1) mod 12`(顺行),两宫天干均由**年干**按五虎遁起(立春分年,不是公历年)。规律从 tyme4ts 的 `getOwnSign()/getBodySign()` 反推,已并入 `npm run diff:paipan` 逐盘验回去。小程序侧 `miniprogram/utils/shensha.js` 是生成物(`npm run gen:shensha`),生成时把 geju 的两张表**内联**进去(小程序没有 geju.js)。
- **地支十神必须按藏干本气算**:`getShiShenOfZhi(dayGan, zhi)` 取 `CANG_GAN[zhi][0]` 再论十神。小程序侧曾把**地支直接喂给只吃天干的 `getShiShen()`** —— `WUXING` 表恰好也收了地支,五行查得到掩盖了错误,但 `TIANGAN.indexOf('亥')` 返回 -1,`-1 % 2 === -1` 永不等于日干的 0/1,于是四个地支十神一律落到「异性」那一档。黄金基准盘上 3/4 地支十神是错的而四柱全对,旧 parity 测试只比四柱所以一路绿灯。`getShiShen()` 现在收到地支会抛错。
- **两端排盘一致性由节气表保证**:`miniprogram/utils/solarTerms.js`(1899-2101,22KB)由 `backend/scripts/gen-solar-terms.js` 从 lunar-javascript 预生成,本地的立春分年/节气分月/起运年龄都基于它,与后端**按构造对齐**。表范围比支持范围两端各多一年(年初年末算起运要查相邻年的节)。
  改任一侧排盘逻辑或重新生成表后,必须跑 `utils/__tests__/paipan-parity.test.js`(含 6 个年份逐日扫描)。重新生成:`npm run gen:solar-terms`。
- **身强弱 / 喜忌 / 格局由 `mingju.js` 确定性算**,作为"已知结论"注入 prompt;**绝不信任客户端**传入的论断
- **AI 只翻译**:`utils/promptBuilder.js` 给基础/深度,`utils/fourSchoolPrompt.js` 给四家并列,`utils/dayunPrompt.js` 给大运;各自有 `.en.js` 英文版
- **农历输入**:`birth.calendar === 'lunar'` 走 `normalizeBirthToSolar`,闰月传负月份
- **RAG**:`utils/knowledgeRetriever.js` 的 `retrieve(mingju, { query })`,**四家投票时给各家传不同 query**,否则 refs 全相同

- **订单接口强依赖 Mongo,且入口即判**:订单是财务记录,不做内存兜底(进程重启就没的「订单」比报错更危险)。但也不放任 mongoose 缓冲——连不上库时 `requireMongo()` 立刻返 503(实测 10.09s → 0.012s),回调侧返 XML `FAIL` 让微信按重推机制稍后再送。

## 付费档

`deep_report` `four_school` `dayun_segment` `dayun_full` 四种付费产品 + `vip_month` 月卡通行证。服务端定价在 `backend/config/products.js`,**忽略客户端传入的 amount**。`vip_month` 在微信回调 `grantEntitlement()` 里写用户 VIP 等级 + 到期时间;`deep_report` `four_school` `dayun_segment` `dayun_full` 的权益判定走 `utils/entitlementRegistry.js`(有 Mongo 查 Mongo,无 Mongo 走 in-memory 兜底 → 演示永远 200/403,**不会 21 秒假死**);持有有效 VIP 也算已付费。

## 测试

- jest,48 套件 / 529 用例 / ~12s 全绿(2026-08-22)
- 黄金基准:机主本人盘 2002-11-20 巳时男 + `bazi-skill-dist/cases/` 张学良 / 邵逸夫(均在 1900-2100 范围内)
- 跑命令:`cd backend && npm test`
- 测试目录:`utils/__tests__/`(32) + `routes/__tests__/`(11) + `middleware/__tests__/`(3) + `config/__tests__/`(2) + `scripts/__tests__/`(1)
- **测试之外还有一层**:`npm run diff:paipan` 与第三方实现差分。它不在 `npm test` 里(要跑几千个盘,慢),但改排盘逻辑后必须手动跑一次。
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
- **✅ P0 — Redis 连不上时 `/analysis/*` 无限挂起 → 已修**:node-redis 默认把客户端未就绪时发出的命令**排队**(offline queue),于是 `await redis.incr()` 的 promise 永不 settle,外层 try/catch 一辈子等不到 reject —— 限流不是降级成进程内计数,而是把每个请求挂死(`/checkup` 从 7ms 变成永不返回)。**任何配了 `REDIS_URL` 而 Redis 短暂不可用的部署都会中招**。修法三层缺一不可:`disableOfflineQueue: true`(命令立即抛错而非排队)+ 发命令前查 `isReady` + 单条命令 200ms 超时(`REDIS_COMMAND_TIMEOUT_MS` 可调);重连用有界退避,Redis 恢复后自动接回。回归测试在 `utils/__tests__/redisClient.offline.test.js`。**给 redis 写 mock 时必须带 `isReady: true`**,否则用例会静默走降级分支,永远测不到限流。
- **`quotaGuard` / `antiBrush` 在 Redis 不可用时是「放行」不是「拦截」**:`middleware/access.js` 刻意的降级语义(不阻断业务)。这与 `security.js` 的 `analysisRateLimit` 不同 —— 后者有进程内 Map 兜底。别把两者的行为记混。
- **✅ 小程序 API 双前缀 → 已修**:`request.js` 的 `BASE_URL` 已含 `/api/v1`,页面里 url 只写 `/analysis/basic`。曾有页面写全路径拼成 `/api/v1/api/v1/...` 全部 404,且被上层 catch 静默降级掩盖。`normalizePath()` 现会剥掉重复前缀并 warn。
- **✅ 解读接口只收 birth → 已修**:`/analysis/*` 收 `birth:{year,month,day,hour,minute,gender}`,后端自行排盘。客户端算的四柱/五行不是入参(服务端权威)。小程序侧用 `utils/bazi.js` 的 `buildBirthPayload(result)` 统一构造。
- **`.env` 变量名**:以 `.env.example` 为准(`WX_SECRET` / `WXPAY_API_KEY` / `WXPAY_MCHID`)。`config/index.js` 兼容旧名 `WX_APPSECRET` / `WX_PAY_KEY`,新代码别用。`config/__tests__/env-wiring.test.js` 锁死这层接线。
- **小程序配置集中在 `miniprogram/config.js`**:API 地址、客服微信号、版本号只写这一处,页面/工具层一律 require。`app.js` 启动跑 `checkConfig()` 告警占位值(localhost / 未替换的客服微信号)。文件末尾有开测与上线检查清单。
- **上线/开测前先跑 `npm run preflight`**:一次性查密钥强度、CORS、微信 appid、支付密钥、小程序侧配置、以及 Mongo/Redis/LightRAG 连通性。`NODE_ENV=production` 下会把更多项升级为阻断。有阻断项退出码 1,可串进启动脚本。
- **AI 成本可实测,不用估**:`utils/aiUsage.js` 记录每次调用的真实 token(取 API 的 usage 字段)+ 降级率,写结构化日志行 `[ai-usage] type=.. total_tokens=..`。`npm run usage:report -- --price-in=X --price-out=Y`(元/百万 token)直接出单次成本与毛利率表。埋点任何异常都吞掉——绝不能因为记账把解读请求带崩。
- **英文链路已全线打通**:5 条解读路径各有 `*.en.js` 提示词与降级模板,路由按 `lang` 分发(`routes/analysis.js` 的 `BUILDERS` 表);`/checkup` 额外返回 `labels` 英文术语块(**新增字段而非替换原字段**——`wuxingScore` 的键是中文五行字符,改键名会直接打断小程序)。`frontend/checkup.html` 是双语单文件(`?lang=en` 切换),术语一律取后端 `labels`,前端不自建术语表。四家解读的英文标题用**方法论领衔、人名作出处**——徐乐吾等四位对英文读者没有认知度,音译过去卖点即失效。
- **英文链路的术语表必须穷尽算法取值**:`utils/i18n/baziTerms.js` 的 STRENGTH(5 档,对齐 `wangShuai.js`)与 GEJU(13 种,对齐 `geju.js`)漏一个,该盘的英文正文就会混进中文。改这两个算法要同步补表,`utils/__tests__/promptBuilder.en.test.js` 直接对着取值清单校验。
- **微信 tabBar 图标只认 png/jpg**:`assets/images/*.svg` 是设计源,`*.png` 才是小程序实际引用的。改图标要同步产出 png。
- **`tasks.md` 与代码栈脱节**:`.codeartsdoer/specs/bazi_app/` 写 React Native + FastAPI + PostgreSQL,实际是原生小程序 + Koa + MongoDB。**以代码为准,不要被 spec 带偏**。
- **AI 网关超时**:axios 没显式 timeout 默认 0,等 TCP/AI 网关返回 → 21 秒假死。
- **RAG refs 全相同**:四家投票时 `retrieve(mingju)` 用同一 query,会导致徐乐吾/梁湘润/袁树珊/韦千里引用完全一样的 refs,差异化卖点消失。要 `retrieve(mingju, { query: queries.xu })` 给各家分别传 query。

## 路径 & 调试锚点

- **算法层链路文档**:`docs/algorithm-pipeline.md`(14 个 utils 文件分工表 + 数据流图 + 防坑清单)
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