// routes/__tests__/bazi_history.test.js - /bazi/paipan 落库与 /bazi/history 回读
//
// 覆盖三条关键语义：
//   1. 匿名也能排盘（免费主功能，绝不因为没登录就拦）
//   2. 登录才落库，且同一个盘重复排不堆叠记录
//   3. /history 需鉴权，只返回自己的记录
//
// 走无 Mongo 的内存兜底路径（readyState=0），这也是「没数据库也能演示」
// 这条约定路径的回归保护。

const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')

jest.mock('../../config', () => ({
  jwt: { secret: 'test-secret-must-be-long-enough-for-jwt-validation' }
}))

const config = require('../../config')
const router = require('../bazi')
const store = require('../../utils/baziRecordStore')

function authFor(userId) {
  return `Bearer ${jwt.sign({ userId, openid: 'o' + userId }, config.jwt.secret, { expiresIn: '1h' })}`
}

async function invoke(method, path, { body = {}, query = {}, auth = null } = {}) {
  const ctx = {
    method,
    url: path,
    path,
    query,
    params: {},
    headers: auth ? { authorization: auth } : {},
    request: { body },
    state: {},
    status: 200,
    body: null,
    set: function () {}
  }
  const layer = router.stack.find((l) => l.methods.includes(method) && l.path === path)
  if (!layer) throw new Error(`路由未注册: ${method} ${path}`)
  const mws = layer.stack
  let i = 0
  async function next() {
    if (i >= mws.length) return
    await mws[i++](ctx, next)
  }
  await next()
  return ctx
}

const PAIPAN_BODY = { birthDate: '2002-11-20', birthTime: '10:00', gender: 'male' }

beforeEach(() => {
  // 无 Mongo：走内存兜底
  mongoose.connection.readyState = 0
  store._reset()
})

describe('POST /api/v1/bazi/paipan - 落库', () => {
  test('匿名请求照常排盘，但不落库', async () => {
    const ctx = await invoke('POST', '/paipan', { body: PAIPAN_BODY })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.dayPillar.gan + ctx.body.data.dayPillar.zhi).toBe('壬辰')
    expect(ctx.body.data.persisted).toBe(false)
    expect(await store.list('u1')).toHaveLength(0)
  })

  test('登录请求落库，baziId 为真实记录 id', async () => {
    const ctx = await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.persisted).toBe(true)
    expect(ctx.body.data.baziId).not.toMatch(/^bazi_\d+$/)

    const records = await store.list('u1')
    expect(records).toHaveLength(1)
    expect(records[0].baziStr).toBe('壬午 辛亥 壬辰 乙巳')
    expect(records[0].birth).toEqual({
      year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male'
    })
  })

  test('同一个盘重复排不堆叠记录', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    expect(await store.list('u1')).toHaveLength(1)
  })

  test('无效 token 当作匿名，不拦免费排盘', async () => {
    const ctx = await invoke('POST', '/paipan', {
      body: PAIPAN_BODY,
      auth: 'Bearer total.garbage.token'
    })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.persisted).toBe(false)
  })

  test('非法输入仍是 400，且不产生记录', async () => {
    const ctx = await invoke('POST', '/paipan', {
      body: { birthDate: '1800-01-01', birthTime: '10:00', gender: 'male' },
      auth: authFor('u1')
    })
    expect(ctx.status).toBe(400)
    expect(await store.list('u1')).toHaveLength(0)
  })
})

describe('GET /api/v1/bazi/history', () => {
  test('无 token → 401', async () => {
    const ctx = await invoke('GET', '/history')
    expect(ctx.status).toBe(401)
  })

  test('返回本人排过的盘', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    await invoke('POST', '/paipan', {
      body: { birthDate: '1985-03-15', birthTime: '14:00', gender: 'female' },
      auth: authFor('u1')
    })

    const ctx = await invoke('GET', '/history', { auth: authFor('u1') })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data).toHaveLength(2)
    expect(ctx.body.data[0]).toHaveProperty('birth')
    expect(ctx.body.data[0]).toHaveProperty('baziStr')
  })

  test('看不到别人的记录', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })

    const ctx = await invoke('GET', '/history', { auth: authFor('u2') })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data).toHaveLength(0)
  })

  test('limit 参数被夹在 1-100，非法值走默认', async () => {
    for (let h = 0; h < 5; h++) {
      await invoke('POST', '/paipan', {
        body: { birthDate: '2002-11-20', birthTime: `0${h}:00`, gender: 'male' },
        auth: authFor('u1')
      })
    }
    const limited = await invoke('GET', '/history', { auth: authFor('u1'), query: { limit: '2' } })
    expect(limited.body.data).toHaveLength(2)

    const bogus = await invoke('GET', '/history', { auth: authFor('u1'), query: { limit: 'abc' } })
    expect(bogus.body.data).toHaveLength(5)

    const negative = await invoke('GET', '/history', { auth: authFor('u1'), query: { limit: '-5' } })
    expect(negative.body.data.length).toBeGreaterThan(0)
  })

  test('历史里的 birth 能直接喂回 /paipan 得到同一个盘', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    const history = await invoke('GET', '/history', { auth: authFor('u1') })
    const b = history.body.data[0].birth

    const replay = await invoke('POST', '/paipan', {
      body: {
        birthDate: `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`,
        birthTime: `${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}`,
        gender: b.gender
      },
      auth: authFor('u1')
    })
    const pillars = (d) => ['year', 'month', 'day', 'hour'].map((k) => d[k + 'Pillar'].gan + d[k + 'Pillar'].zhi).join(' ')
    expect(pillars(replay.body.data)).toBe(history.body.data[0].baziStr)
  })
})
