// routes/health.js - 后端健康检查（聚合 backend + LightRAG）
//
// 设计动机：运维想知道 LightRAG 是不是活的,但产品解读本身有优雅降级
// （RAG 挂掉也能正常出 AI 解读,只是不带古籍引证）。所以 health 端点
// 即使 LightRAG down 也返回 200 —— 这是产品健康 ≠ 全部组件健康 的语义。
const Router = require('koa-router')
const { healthCheck } = require('../utils/knowledgeRetriever')
const sentry = require('../utils/sentry')

const router = new Router()

router.get('/health', async (ctx) => {
  const lightragUp = await healthCheck()
  if (!lightragUp) {
    sentry.captureMessage('lightrag health check down', 'warning')
  }
  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      backend: 'ok',
      lightrag: lightragUp ? 'up' : 'down',
      timestamp: Date.now()
    },
    timestamp: Date.now()
  }
})

module.exports = router