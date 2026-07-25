// middleware/__tests__/security.test.js - CORS 白名单 + 限流中间件测试
const { corsAllow, rateLimit } = require('../security')

function makeCtx({ method = 'GET', origin, url = '/', ip } = {}) {
  const ctx = {
    method,
    url,
    ip: ip || '127.0.0.1',
    request: { ip: ip || '127.0.0.1' },
    headers: origin ? { origin } : {},
    status: 200,
    body: null,
    set(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    get(name) {
      return this.headers[name.toLowerCase()]
    }
  }
  return ctx
}

describe('corsAllow', () => {
  test('origins="*" 时回写 Access-Control-Allow-Origin=*', async () => {
    const mw = corsAllow({ origins: '*' })
    const ctx = makeCtx({ origin: 'https://evil.com' })
    const next = jest.fn(async () => {})
    await mw(ctx, next)
    expect(ctx.headers['access-control-allow-origin']).toBe('*')
    expect(next).toHaveBeenCalled()
  })

  test('白名单命中 → 回显 origin + Vary:Origin + Credentials', async () => {
    const mw = corsAllow({ origins: 'https://a.com,https://b.com' })
    const ctx = makeCtx({ origin: 'https://a.com' })
    const next = jest.fn(async () => {})
    await mw(ctx, next)
    expect(ctx.headers['access-control-allow-origin']).toBe('https://a.com')
    expect(ctx.headers['vary']).toBe('Origin')
    expect(ctx.headers['access-control-allow-credentials']).toBe('true')
    expect(next).toHaveBeenCalled()
  })

  // 回归：prod + ALLOWED_ORIGINS 未配（fail-closed 默认部署姿势）会走 logger.warn 分支。
  // 曾因 `const { logger } = require('../utils/logger')` 解构出 undefined，
  // 这条路径对任意跨域请求抛 TypeError → 500。此前用例都传了非空 origins，绕开了它。
  test('prod + 白名单为空 + 跨域 → 不抛错，不写 ACAO 头，next 仍放行', async () => {
    const mw = corsAllow({ origins: '', isProd: true })
    const ctx = makeCtx({ origin: 'https://evil.com' })
    const next = jest.fn(async () => {})
    await expect(mw(ctx, next)).resolves.not.toThrow()
    expect(ctx.headers['access-control-allow-origin']).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  test('白名单未命中 + prod → 不写 ACAO 头（浏览器拦）但 next 仍放行', async () => {
    const mw = corsAllow({ origins: 'https://a.com', isProd: true })
    const ctx = makeCtx({ origin: 'https://evil.com' })
    const next = jest.fn(async () => {})
    await mw(ctx, next)
    expect(ctx.headers['access-control-allow-origin']).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  test('白名单未命中 + dev → 放行（兜底）', async () => {
    const mw = corsAllow({ origins: 'https://a.com', isProd: false })
    const ctx = makeCtx({ origin: 'https://random.com' })
    const next = jest.fn(async () => {})
    await mw(ctx, next)
    expect(ctx.headers['access-control-allow-origin']).toBe('https://random.com')
    expect(next).toHaveBeenCalled()
  })

  test('OPTIONS 预检 → 204 且不调 next', async () => {
    const mw = corsAllow({ origins: '*' })
    const ctx = makeCtx({ method: 'OPTIONS', origin: 'https://x.com' })
    const next = jest.fn(async () => {})
    await mw(ctx, next)
    expect(ctx.status).toBe(204)
    expect(next).not.toHaveBeenCalled()
  })

  test('无 origin 的同源请求也能放行', async () => {
    const mw = corsAllow({ origins: 'https://a.com', isProd: true })
    const ctx = makeCtx() // 无 origin
    const next = jest.fn(async () => {})
    await mw(ctx, next)
    expect(ctx.headers['access-control-allow-origin']).toBeUndefined()
    expect(next).toHaveBeenCalled()
  })
})

describe('rateLimit', () => {
  // 用 jest 假时钟避免真实 setInterval 拖测试
  test('窗口内 max 次放行，第 max+1 次 429', async () => {
    const mw = rateLimit({ windowMs: 60_000, max: 3 })
    const ctxs = Array.from({ length: 4 }, () => makeCtx({ ip: '1.1.1.1' }))
    const next = jest.fn(async () => {})

    for (let i = 0; i < 3; i++) {
      await mw(ctxs[i], next)
      expect(ctxs[i].status).toBe(200)
      expect(next).toHaveBeenCalledTimes(i + 1)
    }
    await mw(ctxs[3], next)
    expect(ctxs[3].status).toBe(429)
    expect(ctxs[3].headers['retry-after']).toMatch(/^\d+$/)
    expect(ctxs[3].body.code).toBe(429)
    // 超限后 next 不应被调用
    expect(next).toHaveBeenCalledTimes(3)
  })

  test('窗口重置后再次放行', async () => {
    const mw = rateLimit({ windowMs: 100, max: 1 })
    const ctx1 = makeCtx({ ip: '2.2.2.2' })
    const ctx2 = makeCtx({ ip: '2.2.2.2' })
    const next = jest.fn(async () => {})

    await mw(ctx1, next)
    expect(ctx1.status).toBe(200)

    // 立即第 2 次：应被限
    await mw(ctx2, next)
    expect(ctx2.status).toBe(429)

    // 等窗口过期
    await new Promise((r) => setTimeout(r, 150))
    const ctx3 = makeCtx({ ip: '2.2.2.2' })
    await mw(ctx3, next)
    expect(ctx3.status).toBe(200)
  })

  test('不同 IP 独立计数', async () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1 })
    const next = jest.fn(async () => {})
    const a1 = makeCtx({ ip: '3.3.3.3' })
    const b1 = makeCtx({ ip: '4.4.4.4' })
    await mw(a1, next)
    await mw(b1, next)
    expect(a1.status).toBe(200)
    expect(b1.status).toBe(200)
  })

  test('自定义 keyFn 可改计数维度', async () => {
    const mw = rateLimit({
      windowMs: 60_000,
      max: 2,
      keyFn: (ctx) => ctx.headers['x-tenant'] || 'none'
    })
    const next = jest.fn(async () => {})
    const a1 = makeCtx({ ip: '5.5.5.5' })
    a1.headers['x-tenant'] = 't1'
    const a2 = makeCtx({ ip: '6.6.6.6' })
    a2.headers['x-tenant'] = 't1'
    const a3 = makeCtx({ ip: '7.7.7.7' })
    a3.headers['x-tenant'] = 't1'
    const b1 = makeCtx({ ip: '8.8.8.8' })
    b1.headers['x-tenant'] = 't2'

    await mw(a1, next)
    await mw(a2, next)
    expect(a1.status).toBe(200)
    expect(a2.status).toBe(200)
    await mw(a3, next)
    expect(a3.status).toBe(429) // t1 超限
    await mw(b1, next)
    expect(b1.status).toBe(200) // t2 独立
  })

  test('429 响应体格式统一（信封）', async () => {
    const mw = rateLimit({ windowMs: 60_000, max: 1 })
    const next = jest.fn(async () => {})
    const c1 = makeCtx({ ip: '9.9.9.9' })
    const c2 = makeCtx({ ip: '9.9.9.9' })
    await mw(c1, next)
    await mw(c2, next)
    expect(c2.body).toMatchObject({
      code: 429,
      data: null,
      timestamp: expect.any(Number)
    })
    expect(c2.body.message).toMatch(/请求过于频繁/)
  })
})
