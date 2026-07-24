# CHANGELOG

> 智能八字 APP 业务变更日志。从 2026-07-25 开始维护,补足 commit 信息之外的"为什么 / 影响 / 业务意图"。

## 维护约定

- 每完成一个 commit(尤其跨模块),在 `## 未发布` 段加一行,简要写**业务意图 / 影响面 / 关联模块**。
- 发布 / 合 master 之前,把那段挪到带日期的版本号下。
- 形式:**先说人话(用户感知),再补技术细节(接手者关心的)**。

---

## 未发布(2026-07-25 累计)

### feat(backend): P1 #31 修权益检查 in-memory 兜底

- **用户感知**:无 Mongo 演示场景,从"调用付费接口永远 403"变为"按已注册判定放行"。
- **技术**:`backend/utils/entitlementRegistry.js`(新)集中付费订单 + VIP 校验;`mongoose.connection.readyState === 1` 判 Mongo 连接,无连接时走 in-memory Map;Mongo 写失败不抛错(降级优先)。
- **接入面**:`routes/analysis.js` 的 `hasDeepEntitlement` / `hasFourSchoolEntitlement` 改走注册表。
- **测试**:`utils/__tests__/entitlementRegistry.test.js`(+8 用例);测试套件 22/183,~4.5s 全绿。

### refactor(backend): middleware/auth.js 分层 + config/db.js 抽连接配置

- **用户感知**:无变化(纯结构整理)。
- **技术**:`middleware/auth.js` 拆出 `envelope.js`(统一响应信封)+ `extractToken.js`(Authorization 头解析);`config/db.js`(新)封装 `connectMongo` + URI 密码遮蔽,`app.js` 不再硬编码 `mongodb://localhost:27017/bazi`。
- **改动面**:`auth.js` 现在只负责"强制鉴权主流程",envelope/extract 抽到独立文件;`app.js` 调用 `require('./config/db').connectMongo`。

### chore: 卸 koa-cors + 补 mingju 边界鲁棒测试

- **用户感知**:无变化(纯减负 + 提升测试覆盖率)。
- **技术**:删 `koa-cors` 依赖(CORS 已用 `middleware/security.js` 自实现白名单);`utils/__tests__/mingju.boundary.test.js`(新,+11 用例)覆盖最弱/最强盘、立春跨年、空藏干、1900/2100 边界、partyOf 一致性。

### feat(backend): Sentry 监控骨架(DSN 缺则降级 console)

- **用户感知**:配 `SENTRY_DSN` 后自动上报异常到远端;未配时只走本地 console.error,不假装在监控。
- **技术**:`utils/sentry.js`(`installProcessHandlers` + `captureException`);`app.js` Koa 错误中间件 + `process.on('unhandledRejection' / 'uncaughtException')` 3 钩子点。
- **生产必修**:在 `.env` 配 `SENTRY_DSN`。

### refactor(frontend): H5 checkup.html 拆 CSS/JS + 消除 innerHTML XSS

- **用户感知**:无变化。
- **技术**:H5 从单文件拆 `frontend/checkup.html` + `checkup.css` + `checkup.js`;render() 改 `createElement` + `textContent`,不再用 `innerHTML` 拼字符串。
- **影响面**:命理体检页 H5 入口(导流到微信的合规收口)。

### feat(backend): CORS 白名单 + AI 类接口 IP 限流

- **用户感知**:无变化(只在 prod fail-closed + 加限流)。
- **技术**:`middleware/security.js` 的 `corsAllow` 读 `ALLOWED_ORIGINS`;`analysisRateLimit` 60 req/min per IP(可 `RATE_LIMIT_DISABLED=1` 关)。
- **配置**:`.env` 加 `ALLOWED_ORIGINS` / `RATE_LIMIT_DISABLED`。

### fix: AI 网关超时/失败走本地降级模板(P0 #30)

- **用户感知**:AI 网关假死(原 21s)不再让用户卡死,直接显示本地解读模板,开头明确标注「本地解读模板」让用户知情。
- **技术**:`utils/localFallback.js`(新)三路径各自不同模板:`buildBasicFallback` / `buildDeepFallback` / `buildFourSchoolFallback`;四家并列给徐乐吾/梁湘润/袁树珊/韦千里各家拼不同方法论摘要,不能共用一段换 4 个名字。`routes/analysis.js` 的 `generateAnalysis` 加 `axios timeout: 5000`,catch 走降级。

### docs: 新增 CLAUDE.md + 校准 README

- **用户感知**:接手者 5 秒内能找到启动命令 / 路由 / 陷阱。
- **技术**:项目根 `CLAUDE.md`(AI 入场合同,含命令 / 路由 / 算法层约定 / 已知陷阱 / memory 索引);`README.md` 与代码对齐(栈 / 项目结构 / 接口 / 配置说明)。

### feat: 健康检查端点 + 联调脚本

- **用户感知**:`/health` 可观察 backend + LightRAG 健康度。
- **技术**:`routes/health.js`(新)顶级 `/health`,聚合 backend + LightRAG,LightRAG down 仍 200。`scripts/dev-seed-test-user.js`(新)自签 JWT + 插 user + paid four_school 订单,联调零成本鉴权绕过。

### feat: four_school 商品档 + 小程序四家解读页

- **用户感知**:小程序新增"四家并列解读"付费档。
- **技术**:`config/products.js` 加 `four_school`;`routes/order.js` 走同一 paid 流程;`miniprogram/pages/four-school/` 新页;`baseURL` 修正。

### feat: 四家并列解读 + LightRAG RAG 集成

- **用户感知**:同一盘由徐乐吾/梁湘润/袁树珊/韦千里四派方法论并行解读,最后 AI 综合。
- **技术**:`utils/fourSchoolPrompt.js`(buildFourSchoolPrompt + buildFourSchoolQueries);`utils/knowledgeRetriever.js`(retrieve by query);4 家 RAG 并发(总延迟 ≈ max(单家超时))。

### feat: H5 体检页 + 时辰未知引导 + 微信联系收口

- **用户感知**:用户从外部链接进入体检页,时辰未知可一键加微信兜底(命理行业常见合规收口)。
- **技术**:`frontend/checkup.html` 独立 H5 入口,直连 `/api/v1/analysis/checkup`(免费 7ms)。

---

## 历史里程碑(2026-07 之前)

无(`chore: 初始化项目仓库` 为仓库起点)。