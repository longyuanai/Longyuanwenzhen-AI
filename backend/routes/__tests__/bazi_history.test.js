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
  // 用 layer.match 而非精确比较：PATCH /history/:id 这类参数路由
  // 按字面路径是匹配不上的，还要把 :id 解出来填进 ctx.params
  const layer = router.stack.find((l) => l.methods.includes(method) && l.match(path))
  if (!layer) throw new Error(`路由未注册: ${method} ${path}`)
  const captures = layer.captures(path)
  ctx.params = layer.params(path, captures, {})
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

describe('DELETE /api/v1/bazi/history', () => {
  test('无 token → 401', async () => {
    const ctx = await invoke('DELETE', '/history')
    expect(ctx.status).toBe(401)
  })

  test('清空本人记录并返回条数', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    await invoke('POST', '/paipan', {
      body: { birthDate: '1985-03-15', birthTime: '14:00', gender: 'female' },
      auth: authFor('u1')
    })

    const ctx = await invoke('DELETE', '/history', { auth: authFor('u1') })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.deleted).toBe(2)

    const after = await invoke('GET', '/history', { auth: authFor('u1') })
    expect(after.body.data).toHaveLength(0)
  })

  test('清除不影响其他用户的记录', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u2') })

    await invoke('DELETE', '/history', { auth: authFor('u1') })

    const other = await invoke('GET', '/history', { auth: authFor('u2') })
    expect(other.body.data).toHaveLength(1)
  })

  test('清除后再排同一个盘能重新落库（幂等键不残留）', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    await invoke('DELETE', '/history', { auth: authFor('u1') })
    expect((await invoke('GET', '/history', { auth: authFor('u1') })).body.data).toHaveLength(0)

    const again = await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    expect(again.body.data.persisted).toBe(true)
    expect((await invoke('GET', '/history', { auth: authFor('u1') })).body.data).toHaveLength(1)
  })

  test('清空历史返回 0 条而非报错', async () => {
    const ctx = await invoke('DELETE', '/history', { auth: authFor('u-empty') })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.deleted).toBe(0)
  })
})

describe('POST /api/v1/bazi/history/sync - 批量同步本机记录', () => {
  const ITEM = {
    birth: { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' },
    baziStr: '壬午 辛亥 壬辰 乙巳'
  }

  test('无 token → 401', async () => {
    const ctx = await invoke('POST', '/history/sync', { body: { items: [ITEM] } })
    expect(ctx.status).toBe(401)
  })

  test('批量入库，之后 history 能读到', async () => {
    const ctx = await invoke('POST', '/history/sync', {
      body: {
        items: [
          ITEM,
          { birth: { year: 1985, month: 3, day: 15, hour: 14, gender: 'female' }, baziStr: 'x', label: '老王' }
        ]
      },
      auth: authFor('u1')
    })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.saved).toBe(2)
    expect(ctx.body.data.invalid).toBe(0)

    const list = await invoke('GET', '/history', { auth: authFor('u1') })
    expect(list.body.data).toHaveLength(2)
    expect(list.body.data.find((r) => r.label === '老王')).toBeDefined()
  })

  test('与已有记录幂等：同一个盘不重复', async () => {
    await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor('u1') })
    await invoke('POST', '/history/sync', { body: { items: [ITEM] }, auth: authFor('u1') })

    const list = await invoke('GET', '/history', { auth: authFor('u1') })
    expect(list.body.data).toHaveLength(1)
  })

  test('脏数据被跳过，不拖垮整批', async () => {
    const ctx = await invoke('POST', '/history/sync', {
      body: {
        items: [
          ITEM,
          { birth: { year: 1800, month: 1, day: 1, hour: 0, gender: 'male' } }, // 超界
          { birth: { year: 2000, month: 1, day: 1, hour: 0, gender: 'x' } },    // 性别非法
          { birth: null },                                                       // 缺 birth
          {}                                                                     // 空对象
        ]
      },
      auth: authFor('u1')
    })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.saved).toBe(1)
    expect(ctx.body.data.invalid).toBe(4)
  })

  test('items 非数组 → 400', async () => {
    const ctx = await invoke('POST', '/history/sync', { body: { items: 'nope' }, auth: authFor('u1') })
    expect(ctx.status).toBe(400)
  })

  test('超过单次上限 → 400', async () => {
    const store = require('../../utils/baziRecordStore')
    const items = Array.from({ length: store.SYNC_MAX_ITEMS + 1 }, () => ITEM)
    const ctx = await invoke('POST', '/history/sync', { body: { items }, auth: authFor('u1') })
    expect(ctx.status).toBe(400)
  })
})

describe('PUT /api/v1/bazi/history/:id - 备注名', () => {
  async function seedOne(user) {
    const ctx = await invoke('POST', '/paipan', { body: PAIPAN_BODY, auth: authFor(user) })
    return ctx.body.data.baziId
  }

  test('无 token → 401', async () => {
    const ctx = await invoke('PUT', '/history/whatever', { body: { label: 'x' } })
    expect(ctx.status).toBe(401)
  })

  test('改名成功并在 history 里生效', async () => {
    const id = await seedOne('u1')
    const ctx = await invoke('PUT', `/history/${id}`, { body: { label: '我自己' }, auth: authFor('u1') })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.label).toBe('我自己')

    const list = await invoke('GET', '/history', { auth: authFor('u1') })
    expect(list.body.data[0].label).toBe('我自己')
  })

  test('改不了别人的记录 → 404', async () => {
    const id = await seedOne('u1')
    const ctx = await invoke('PUT', `/history/${id}`, { body: { label: '篡改' }, auth: authFor('u2') })
    expect(ctx.status).toBe(404)

    const list = await invoke('GET', '/history', { auth: authFor('u1') })
    expect(list.body.data[0].label).toBe('')
  })

  test('不存在的 id → 404', async () => {
    const ctx = await invoke('PUT', '/history/no-such-id', { body: { label: 'x' }, auth: authFor('u1') })
    expect(ctx.status).toBe(404)
  })

  test('label 非字符串 → 400', async () => {
    const id = await seedOne('u1')
    const ctx = await invoke('PUT', `/history/${id}`, { body: { label: 123 }, auth: authFor('u1') })
    expect(ctx.status).toBe(400)
  })

  test('超长 label 被截断，空串可清除备注', async () => {
    const store = require('../../utils/baziRecordStore')
    const id = await seedOne('u1')

    const long = await invoke('PUT', `/history/${id}`, {
      body: { label: '很'.repeat(100) },
      auth: authFor('u1')
    })
    expect(long.body.data.label).toHaveLength(store.LABEL_MAX_LEN)

    const cleared = await invoke('PUT', `/history/${id}`, { body: { label: '  ' }, auth: authFor('u1') })
    expect(cleared.body.data.label).toBe('')
  })
})
