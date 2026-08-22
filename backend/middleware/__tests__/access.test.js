// middleware/__tests__/access.test.js - 角色/配额/防刷中间件

jest.mock('redis', () => {
  const clients = []
  return {
    createClient: () => {
      const store = {}
      const client = {
        connect: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        // 必须有：utils/redisClient.js 在发命令前会查 isReady，
        // 未就绪就直接降级返 null（防止命令被 node-redis 排队后永不 settle）。
        // mock 里漏掉这个属性会让所有用例静默走降级分支，永远测不到限流。
        isReady: true,
        options: { disableOfflineQueue: true },
        get: jest.fn(async (k) => store[k] || null),
        set: jest.fn(async (k, v, opts) => { store[k] = v; if (opts && opts.EX) client.ttls[k] = opts.EX; return 'OK' }),
        incr: jest.fn(async (k) => { const n = (store[k] || 0) + 1; store[k] = n; return n }),
        expire: jest.fn(async (k, t) => { client.ttls[k] = t; return 1 }),
        store,
        ttls: {}
      }
      clients.push(client)
      return client
    }
  }
})

const { roleRequired, quotaGuard, antiBrush } = require('../access')
const { envelope } = require('../envelope')

function ctxWith(user, ip = '127.0.0.1') {
  return {
    state: user ? { user } : {},
    request: { ip },
    ip,
    status: 200,
    body: null,
    set: function () {}
  }
}

describe('roleRequired', () => {
  test('无 ctx.state.user → 401', async () => {
    const mw = roleRequired('vip')
    const ctx = ctxWith(null)
    let nextCalled = false
    await mw(ctx, async () => { nextCalled = true })
    expect(ctx.status).toBe(401)
    expect(nextCalled).toBe(false)
  })

  test('user 角色 → vip 门槛 → 403', async () => {
    const mw = roleRequired('vip')
    const ctx = ctxWith({ userId: 'u1', role: 'user' })
    let nextCalled = false
    await mw(ctx, async () => { nextCalled = true })
    expect(ctx.status).toBe(403)
    expect(ctx.body.message).toContain('vip')
    expect(nextCalled).toBe(false)
  })

  test('vip 角色 → vip 门槛 → 通过', async () => {
    const mw = roleRequired('vip')
    const ctx = ctxWith({ userId: 'u1', role: 'vip' })
    let nextCalled = false
    await mw(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(true)
  })

  test('admin 角色 → 任何门槛 → 通过', async () => {
    const mw = roleRequired('admin')
    const ctx = ctxWith({ userId: 'u1', role: 'admin' })
    let nextCalled = false
    await mw(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(true)
  })

  test('缺省 role 字段 → 当作 user', async () => {
    const mw = roleRequired('user')
    const ctx = ctxWith({ userId: 'u1' }) // 无 role 字段
    let nextCalled = false
    await mw(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(true)
  })

  test('未知角色门槛 → 构造时抛错', () => {
    expect(() => roleRequired('super-admin')).toThrow(/未知角色/)
  })
})

describe('quotaGuard', () => {
  beforeAll(() => {
    process.env.REDIS_URL = 'redis://test'
  })
  afterAll(() => {
    delete process.env.REDIS_URL
  })
  beforeEach(() => {
    jest.resetModules()
  })

  test('参数不全 → 构造时抛错', () => {
    expect(() => quotaGuard({})).toThrow(/dim \+ max/)
    expect(() => quotaGuard({ dim: 'x' })).toThrow(/dim \+ max/)
    expect(() => quotaGuard({ dim: 'x', max: 0 })).toThrow(/dim \+ max/)
  })

  test('admin 角色 → 绕过配额', async () => {
    const mw = quotaGuard({ dim: 'test', max: 1 })
    const ctx = ctxWith({ userId: 'u1', role: 'admin' })
    let nextCalled = false
    await mw(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(true)
  })

  test('未超限 → 通过,已超限 → 429', async () => {
    let q
    jest.isolateModules(() => { ({ quotaGuard: q } = require('../access')) })
    const mw = q({ dim: 'test-q', max: 2, windowMs: 60000 })

    const c1 = ctxWith({ userId: 'u-q', role: 'user' })
    let passed = false
    await mw(c1, async () => { passed = true })
    expect(passed).toBe(true)

    const c2 = ctxWith({ userId: 'u-q', role: 'user' })
    passed = false
    await mw(c2, async () => { passed = true })
    expect(passed).toBe(true)

    // 第 3 次超限
    const c3 = ctxWith({ userId: 'u-q', role: 'user' })
    await mw(c3, async () => {})
    expect(c3.status).toBe(429)
  })

  test('无 ctx.state.user → 401', async () => {
    let q
    jest.isolateModules(() => { ({ quotaGuard: q } = require('../access')) })
    const mw = q({ dim: 'test-noauth', max: 1 })
    const ctx = ctxWith(null)
    await mw(ctx, async () => {})
    expect(ctx.status).toBe(401)
  })
})

describe('antiBrush', () => {
  beforeAll(() => {
    process.env.REDIS_URL = 'redis://test'
  })
  afterAll(() => {
    delete process.env.REDIS_URL
  })

  test('参数不全 → 构造时抛错', () => {
    expect(() => antiBrush({})).toThrow(/dim \+ max/)
  })

  test('超限 → 429', async () => {
    let a
    jest.isolateModules(() => { ({ antiBrush: a } = require('../access')) })
    const mw = a({ dim: 'test-brush', max: 1, windowMs: 60000 })

    const c1 = ctxWith(null, '1.2.3.4')
    let passed = false
    await mw(c1, async () => { passed = true })
    expect(passed).toBe(true)

    const c2 = ctxWith(null, '1.2.3.4')
    await mw(c2, async () => {})
    expect(c2.status).toBe(429)
    expect(c2.body.message).toMatch(/过于频繁/)
  })

  test('不同 IP 互不干扰', async () => {
    let a
    jest.isolateModules(() => { ({ antiBrush: a } = require('../access')) })
    const mw = a({ dim: 'test-ip', max: 1, windowMs: 60000 })

    const c1 = ctxWith(null, '1.2.3.4')
    const c2 = ctxWith(null, '5.6.7.8')
    let p1 = false
    let p2 = false
    await mw(c1, async () => { p1 = true })
    await mw(c2, async () => { p2 = true })
    expect(p1 && p2).toBe(true)
  })

  // Redis 不可用时 quotaGuard / antiBrush 是**放行**而非拦截
  // （access.js 里明确的「降级放行，不阻断业务」）。
  // 这与 security.js 的 analysisRateLimit 不同——那条有进程内 Map 兜底。
  // 把这个差异钉下来，免得日后有人以为防刷在无 Redis 时也生效。
  test('Redis 不可用 → 放行而非 429（刻意的降级语义）', async () => {
    jest.resetModules()
    jest.doMock('../../utils/redisClient', () => ({
      incrInWindow: async () => null,
      getRedis: () => null,
      _reset: () => {}
    }))
    const { antiBrush: a } = require('../access')
    const mw = a({ dim: 'test-degraded', max: 1, windowMs: 60000 })

    for (let i = 0; i < 5; i++) {
      const ctx = ctxWith(null, '9.9.9.9')
      let passed = false
      await mw(ctx, async () => { passed = true })
      expect(passed).toBe(true)
      expect(ctx.status).toBe(200)
    }
    jest.dontMock('../../utils/redisClient')
  })
})