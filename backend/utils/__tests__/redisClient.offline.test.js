// utils/__tests__/redisClient.offline.test.js
//
// 这组测试守的是一个把整条 /analysis 链路挂死的坑，实测踩到过：
//
//   配了 REDIS_URL 但 Redis 连不上时，node-redis 默认会把命令**排队**
//   （enableOfflineQueue），等连上再发。于是 `await redis.incr(key)` 的
//   promise 永不 settle —— 外层 try/catch 一辈子等不到 reject，
//   限流不是降级成进程内计数，而是让每个请求无限挂起。
//   /checkup 从 7ms 变成永不返回。
//
// 修法是 disableOfflineQueue + isReady 前置判断 + 单条命令超时。
// 三层都要在：光靠超时会让每个请求白等 200ms；光靠 isReady 挡不住
// 「连接中途断开」这一瞬间发出的命令。

const { _reset } = require('../redisClient')

describe('Redis 不可用时的降级', () => {
  const OLD_URL = process.env.REDIS_URL

  afterEach(() => {
    if (OLD_URL === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = OLD_URL
    _reset()
    jest.resetModules()
  })

  test('未配 REDIS_URL：incrInWindow 立即返回 null', async () => {
    delete process.env.REDIS_URL
    _reset()
    const { incrInWindow } = require('../redisClient')
    await expect(incrInWindow('k', 60000)).resolves.toBeNull()
  })

  test('配了但连不上：必须快速返回 null，绝不挂起', async () => {
    // 指向一个几乎必然连不上的端口
    process.env.REDIS_URL = 'redis://127.0.0.1:6390'
    _reset()
    jest.resetModules()
    const { incrInWindow, getRedis } = require('../redisClient')

    const t0 = Date.now()
    const result = await incrInWindow('ratelimit:test', 60000)
    const elapsed = Date.now() - t0

    expect(result).toBeNull()
    // 挂起的那版这里会直接超时失败。给 2s 余量，实测是个位数毫秒。
    expect(elapsed).toBeLessThan(2000)

    const client = getRedis()
    if (client) await client.quit().catch(() => {})
  })

  test('连不上时连续多次调用都不累积延迟', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6390'
    _reset()
    jest.resetModules()
    const { incrInWindow, getRedis } = require('../redisClient')

    const t0 = Date.now()
    for (let i = 0; i < 20; i++) {
      await expect(incrInWindow(`k${i}`, 60000)).resolves.toBeNull()
    }
    // 每次都白等一个命令超时的话，20 次会到 4s
    expect(Date.now() - t0).toBeLessThan(2000)

    const client = getRedis()
    if (client) await client.quit().catch(() => {})
  })

  test('客户端配置上关掉了离线队列（根因防回归）', () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6390'
    _reset()
    jest.resetModules()
    const { getRedis } = require('../redisClient')
    const client = getRedis()
    expect(client).not.toBeNull()
    // node-redis 把配置挂在 options 上；这一项一旦被人改回去，
    // 挂死的老毛病就会原样复发，而且只在 Redis 挂掉时才暴露。
    expect(client.options.disableOfflineQueue).toBe(true)
    return client.quit().catch(() => {})
  })
})
