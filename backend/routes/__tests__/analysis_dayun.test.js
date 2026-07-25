// routes/__tests__/analysis_dayun.test.js - 大运付费解读路由测试
//
// 测试目标：
//   1. 无 token → 401
//   2. 已登录但未付费 → 403
//   3. 已付费用户 → 200,seg/fullList 结构正确,降级路径(AI 失败)返本地模板
//   4. VIP 通行
//   5. segmentIndex 越界 → 400
//   6. invalid birth(year < MIN_YEAR)→ 400

jest.mock('axios')
jest.mock('../../models/Order')
jest.mock('../../models/User')

const axios = require('axios')
const Order = require('../../models/Order')
const User = require('../../models/User')
const mongoose = require('mongoose')

jest.mock('../../config', () => ({
  ai: {
    openai: {
      apiKey: 'test-key',
      baseUrl: 'http://test-openai',
      model: 'gpt-test'
    }
  },
  jwt: { secret: 'test-secret-must-be-long-enough-for-jwt-validation' }
}))

const router = require('../analysis')

async function invokePost(path, body = {}, authHeader = null) {
  const ctx = {
    method: 'POST',
    url: path,
    headers: authHeader ? { authorization: authHeader } : {},
    request: { body },
    state: {},
    status: 200,
    body: null,
    set: function () {}
  }
  const layer = router.stack.find(l => l.methods.includes('POST') && l.path === path)
  if (!layer) throw new Error(`路由未注册: ${path}`)
  const mws = layer.stack
  let i = 0
  async function next() {
    if (i >= mws.length) return
    const mw = mws[i++]
    await mw(ctx, next)
  }
  await mws[0](ctx, next)
  return ctx
}

function authFor(userId) {
  const jwt = require('jsonwebtoken')
  const config = require('../../config')
  return `Bearer ${jwt.sign({ userId, openid: 'o' + userId }, config.jwt.secret, { expiresIn: '1h' })}`
}

const VALID_BIRTH = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

beforeEach(() => {
  jest.clearAllMocks()
  axios.post.mockResolvedValue({
    data: { choices: [{ message: { content: 'AI 解读占位' } }] }
  })
  Order.exists.mockResolvedValue(null)
  User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) })
  mongoose.connection.readyState = 1
})

describe('POST /dayun-segment - 大运单段付费解读', () => {
  test('无 token → 401', async () => {
    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: VALID_BIRTH, segmentIndex: 0 },
      null
    )
    expect(ctx.status).toBe(401)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('登录但无 dayun_segment 订单 + 无 VIP → 403', async () => {
    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: VALID_BIRTH, segmentIndex: 0 },
      authFor('u1')
    )
    expect(ctx.status).toBe(403)
    expect(ctx.body.data.paid).toBe(false)
    expect(ctx.body.data.type).toBe('dayun_segment')
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('已付费 → 200,seg 字段齐全,prompt 调 RAG 1 次 + AI 1 次', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_segment' ? { _id: 'o1' } : null
    )
    axios.post.mockImplementation((url) => {
      if (url.includes('/query')) {
        return Promise.resolve({
          status: 200,
          data: {
            references: [{ content: '古籍片段', file_path: '《子平真诠》', score: 0.9 }]
          }
        })
      }
      return Promise.resolve({
        data: { choices: [{ message: { content: '【整体基调】大运分析...' } }] }
      })
    })

    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: VALID_BIRTH, segmentIndex: 1 },
      authFor('u2')
    )
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.type).toBe('dayun_segment')
    expect(ctx.body.data.segmentIndex).toBe(1)
    expect(ctx.body.data.seg).toBeDefined()
    expect(ctx.body.data.seg.ganZhi).toBeDefined()
    expect(ctx.body.data.seg.leanText).toBeDefined()
    expect(ctx.body.data.sources.total).toBe(1)

    // RAG 1 次 + AI 1 次 = 2 次 axios.post
    const ragCalls = axios.post.mock.calls.filter(c => c[0].includes('/query'))
    expect(ragCalls.length).toBe(1)
  })

  test('VIP 通行(vipLevel > 0 且未过期)→ 200', async () => {
    Order.exists.mockResolvedValue(null)
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ vipLevel: 1, vipExpireAt: future })
    })
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] } })

    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: VALID_BIRTH, segmentIndex: 0 },
      authFor('u3')
    )
    expect(ctx.status).toBe(200)
  })

  test('AI 失败 → 降级到本地模板,仍 200', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_segment' ? { _id: 'o1' } : null
    )
    axios.post.mockImplementation((url) => {
      if (url.includes('/query')) return Promise.resolve({ status: 200, data: { references: [] } })
      // AI 调用抛 500
      return Promise.reject(new Error('OpenAI 502'))
    })

    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: VALID_BIRTH, segmentIndex: 0 },
      authFor('u4')
    )
    expect(ctx.status).toBe(200)
    // 降级模板以「本地解读模板」开头
    expect(ctx.body.data.content).toMatch(/本地解读模板/)
  })

  test('segmentIndex 越界(8) → 400', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_segment' ? { _id: 'o1' } : null
    )
    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: VALID_BIRTH, segmentIndex: 8 },
      authFor('u5')
    )
    expect(ctx.status).toBe(400)
    expect(ctx.body.message).toMatch(/segmentIndex/)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('segmentIndex 非整数 → 400', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_segment' ? { _id: 'o1' } : null
    )
    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: VALID_BIRTH, segmentIndex: 1.5 },
      authFor('u5')
    )
    expect(ctx.status).toBe(400)
  })

  test('birth.year 越界(1800) → 400 INVALID_INPUT', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_segment' ? { _id: 'o1' } : null
    )
    const ctx = await invokePost('/dayun-segment',
      { baziId: 'b1', birth: { ...VALID_BIRTH, year: 1800 }, segmentIndex: 0 },
      authFor('u6')
    )
    expect(ctx.status).toBe(400)
  })
})

describe('POST /dayun-full - 大运全卷付费解读', () => {
  test('无 token → 401', async () => {
    const ctx = await invokePost('/dayun-full',
      { baziId: 'b1', birth: VALID_BIRTH },
      null
    )
    expect(ctx.status).toBe(401)
  })

  test('登录但未付费 → 403', async () => {
    const ctx = await invokePost('/dayun-full',
      { baziId: 'b1', birth: VALID_BIRTH },
      authFor('u1')
    )
    expect(ctx.status).toBe(403)
    expect(ctx.body.data.type).toBe('dayun_full')
  })

  test('已付费 → 200,segments 数组含 8 段', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_full' ? { _id: 'o1' } : null
    )
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '全卷解读...' } }] }
    })

    const ctx = await invokePost('/dayun-full',
      { baziId: 'b1', birth: VALID_BIRTH },
      authFor('u2')
    )
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.type).toBe('dayun_full')
    expect(Array.isArray(ctx.body.data.segments)).toBe(true)
    expect(ctx.body.data.segments.length).toBe(8)
    // 每段都有 lean + ganZhi
    ctx.body.data.segments.forEach(s => {
      expect(s.ganZhi).toBeDefined()
      expect(s.lean).toBeDefined()
    })
  })

  test('VIP 通行 → 200', async () => {
    Order.exists.mockResolvedValue(null)
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000)
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ vipLevel: 1, vipExpireAt: future })
    })
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] } })

    const ctx = await invokePost('/dayun-full',
      { baziId: 'b1', birth: VALID_BIRTH },
      authFor('u3')
    )
    expect(ctx.status).toBe(200)
  })

  test('AI 失败 → 降级到本地模板,仍 200', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_full' ? { _id: 'o1' } : null
    )
    axios.post.mockImplementation((url) => {
      if (url.includes('/query')) return Promise.resolve({ status: 200, data: { references: [] } })
      return Promise.reject(new Error('timeout'))
    })

    const ctx = await invokePost('/dayun-full',
      { baziId: 'b1', birth: VALID_BIRTH },
      authFor('u4')
    )
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.content).toMatch(/本地解读模板/)
  })

  test('birth 越界 → 400', async () => {
    Order.exists.mockImplementation(async ({ productType }) =>
      productType === 'dayun_full' ? { _id: 'o1' } : null
    )
    const ctx = await invokePost('/dayun-full',
      { baziId: 'b1', birth: { ...VALID_BIRTH, year: 1500 } },
      authFor('u5')
    )
    expect(ctx.status).toBe(400)
  })
})