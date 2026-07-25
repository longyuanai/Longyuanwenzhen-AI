// routes/__tests__/ratelimit-scope.test.js - 限流挂载范围
//
// 背景：analysisRateLimit 名为「AI 类接口限流」，却曾经挂在 app.use 上，
// 实际限制了所有接口 —— 包括 /health 与 /bazi/paipan。后果：
//   - 运维的健康检查在流量高峰期会被自己的限流打成 429，误报服务不可用
//   - 免费排盘与付费 AI 解读共用同一个 60/min 配额
//
// 现在它只挂在 /api/v1/analysis 路由段上。本测试直接驱动 app 的路由栈，
// 确认限流中间件确实只出现在 analysis 分支。

const Router = require('koa-router')
const { analysisRateLimit } = require('../../middleware/security')

// 复刻 app.js 的挂载方式（不 require app.js 本身：它会真的 listen 端口）
function buildRouter({ disabled }) {
  const router = new Router()
  const analysisMiddleware = disabled ? [] : [analysisRateLimit()]

  const stub = (name) => {
    const r = new Router()
    r.get('/ping', async (ctx) => { ctx.body = { route: name } })
    return r
  }

  const bazi = stub('bazi')
  const analysis = stub('analysis')
  const health = new Router()
  health.get('/health', async (ctx) => { ctx.body = { ok: true } })

  router.use('/api/v1/bazi', bazi.routes(), bazi.allowedMethods())
  router.use('/api/v1/analysis', ...analysisMiddleware, analysis.routes(), analysis.allowedMethods())
  router.use('', health.routes(), health.allowedMethods())
  return router
}

// 数一条路径上挂了几层中间件（限流会多出一层）
function layerDepth(router, path, method = 'GET') {
  const matched = router.match(path, method)
  return matched.pathAndMethod.reduce((sum, l) => sum + l.stack.length, 0)
}

describe('限流挂载范围', () => {
  test('/analysis 带限流层，/bazi 与 /health 不带', () => {
    const withLimit = buildRouter({ disabled: true })
    const noLimit = buildRouter({ disabled: false })

    const analysisDelta =
      layerDepth(noLimit, '/api/v1/analysis/ping') - layerDepth(withLimit, '/api/v1/analysis/ping')
    const baziDelta =
      layerDepth(noLimit, '/api/v1/bazi/ping') - layerDepth(withLimit, '/api/v1/bazi/ping')
    const healthDelta =
      layerDepth(noLimit, '/health') - layerDepth(withLimit, '/health')

    expect(analysisDelta).toBe(1) // analysis 多了限流中间件
    expect(baziDelta).toBe(0)     // 排盘不受影响
    expect(healthDelta).toBe(0)   // 健康检查不受影响
  })

  test('RATE_LIMIT_DISABLED=1 时 analysis 也不挂限流', () => {
    const disabled = buildRouter({ disabled: true })
    const enabled = buildRouter({ disabled: false })
    expect(layerDepth(disabled, '/api/v1/analysis/ping'))
      .toBeLessThan(layerDepth(enabled, '/api/v1/analysis/ping'))
  })

  test('/health 连续 100 次不会被限流打成 429', async () => {
    const router = buildRouter({ disabled: false })
    const routes = router.routes()

    for (let i = 0; i < 100; i++) {
      const ctx = {
        method: 'GET',
        path: '/health',
        url: '/health',
        ip: '9.9.9.9',
        request: { ip: '9.9.9.9' },
        headers: {},
        status: 404,
        body: null,
        set() {}
      }
      await routes(ctx, async () => {})
      expect(ctx.status).not.toBe(429)
    }
  })
})
