// routes/__tests__/analysis_four_school.test.js - 四家并列解读路由测试
//
// 测试目标：
//   1. 401(无 JWT)
//   2. 403(已登录但未付费)
//   3. 200 已付费用户 → 四家并发 RAG + AI 综合
//   4. 单家 RAG 降级(返回 [])不影响整体响应
//   5. 拼出的 prompt 包含 4 家标题 + 古籍依据 + AI 综合
//   6. invalid birth → 400
//
// 设计原则：mock 所有外部依赖 (axios/LightRAG/MongoDB),不连真实服务。

// ---------- mock 依赖 ----------
jest.mock('axios')
jest.mock('../../models/Order')
jest.mock('../../models/User')

const axios = require('axios')
const Order = require('../../models/Order')
const User = require('../../models/User')

// ai.openai 配置必须存在,否则 generateAnalysis 路径上 axios.post 会因 config 缺失炸
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

// 跑通一个 POST 请求到路由。koa-router 把中间件放在 layer.stack 嵌套数组里。
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
  // layer.stack 是中间件数组(顺序:authRequired → handler)
  const mws = layer.stack
  if (mws.length === 0) throw new Error(`路由 ${path} 无中间件`)
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
  // 与 auth.test.js 一致:走 jwt.sign,签发与 verify 用同密钥
  const jwt = require('jsonwebtoken')
  const config = require('../../config')
  return `Bearer ${jwt.sign({ userId, openid: 'o' + userId }, config.jwt.secret, { expiresIn: '1h' })}`
}

beforeEach(() => {
  jest.clearAllMocks()
  // 默认 OpenAI 调用直接回一句假 AI 输出,测试不关心 AI 实际内容
  axios.post.mockResolvedValue({
    data: { choices: [{ message: { content: '【AI 综合】四家解读(测试占位)' } }] }
  })
  // 默认 Order/User 没有任何付费记录
  Order.exists.mockResolvedValue(null)
  User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) })
})

describe('POST /four-school - 四家并列解读', () => {
  test('无 token → 401(由 authRequired 直接拒)', async () => {
    const ctx = await invokePost('/four-school',
      { baziId: 'b1', birth: { year: 2002, month: 11, day: 20, hour: 10, gender: 'male' } },
      null
    )
    expect(ctx.status).toBe(401)
    expect(ctx.body.code).toBe(401)
    expect(axios.post).not.toHaveBeenCalled()  // AI/RAG 都不应被调
  })

  test('登录但无 four_school 付费订单 + 无 VIP → 403', async () => {
    const ctx = await invokePost('/four-school',
      { baziId: 'b1', birth: { year: 2002, month: 11, day: 20, hour: 10, gender: 'male' } },
      authFor('u1')
    )
    expect(ctx.status).toBe(403)
    expect(ctx.body.data.paid).toBe(false)
    expect(ctx.body.data.type).toBe('four_school')
    // 关键：付费校验直接拒,RAG/AI 都不该被调用
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('已付费用户(paid four_school 订单) → 200,四家 RAG 并发,prompt 注入 4 家标题', async () => {
    Order.exists.mockResolvedValue({ _id: 'o1' })  // 模拟已付订单
    // LightRAG /query 的响应
    axios.post.mockImplementation((url) => {
      if (url.includes('/query')) {
        return Promise.resolve({
          status: 200,
          data: {
            response: 'summary',
            references: [
              { content: '测试徐家古籍片段', file_path: '《子平真诠》', score: 0.9 }
            ]
          }
        })
      }
      // OpenAI
      return Promise.resolve({
        data: { choices: [{ message: { content: '四家解读综合' } }] }
      })
    })

    const ctx = await invokePost('/four-school',
      { baziId: 'b1', birth: { year: 2002, month: 11, day: 20, hour: 10, gender: 'male' } },
      authFor('u1')
    )
    expect(ctx.status).toBe(200)
    expect(ctx.body.code).toBe(200)
    expect(ctx.body.data.type).toBe('four_school')
    expect(ctx.body.data.schools).toEqual(['徐乐吾', '梁湘润', '袁树珊', '韦千里'])
    expect(ctx.body.data.content).toContain('四家解读综合')

    // 验证 RAG 调了 4 次(query)+ 1 次 OpenAI = 5 次 axios.post
    const ragCalls = axios.post.mock.calls.filter(c => c[0].includes('/query'))
    expect(ragCalls.length).toBe(4)
    // 4 家 query 必须不同(否则并列视角价值消失)
    const queries = ragCalls.map(c => c[1].query)
    expect(new Set(queries).size).toBe(4)
    expect(queries[0]).toContain('徐乐吾')
    expect(queries[1]).toContain('梁湘润')
    expect(queries[2]).toContain('袁树珊')
    expect(queries[3]).toContain('韦千里')
  })

  test('VIP 通行 → 有 vipLevel > 0 且未过期,也能调用', async () => {
    Order.exists.mockResolvedValue(null)  // 没付费订单
    const future = new Date(Date.now() + 7 * 24 * 3600 * 1000)
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ vipLevel: 1, vipExpireAt: future })
    })
    axios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] } })

    const ctx = await invokePost('/four-school',
      { baziId: 'b1', birth: { year: 2002, month: 11, day: 20, hour: 10, gender: 'male' } },
      authFor('u2')
    )
    expect(ctx.status).toBe(200)
  })

  test('某家 RAG 降级(ECONNREFUSED) → 该家空数组,其他家正常,整体仍 200', async () => {
    Order.exists.mockResolvedValue({ _id: 'o1' })
    // 第 2 次(VB 的 /query,即 liang 家)抛 ECONNREFUSED
    let queryCount = 0
    axios.post.mockImplementation((url) => {
      if (url.includes('/query')) {
        queryCount++
        if (queryCount === 2) {
          return Promise.reject(new Error('ECONNREFUSED 127.0.0.1:9621'))
        }
        return Promise.resolve({
          status: 200,
          data: {
            references: [
              { content: `片段${queryCount}`, file_path: `《书${queryCount}》`, score: 0.8 }
            ]
          }
        })
      }
      return Promise.resolve({ data: { choices: [{ message: { content: 'ok' } }] } })
    })

    const ctx = await invokePost('/four-school',
      { baziId: 'b1', birth: { year: 2002, month: 11, day: 20, hour: 10, gender: 'male' } },
      authFor('u3')
    )
    expect(ctx.status).toBe(200)
    // 4 家:1 有命中、2 降级、3 有命中、4 有命中 = total 3
    expect(ctx.body.data.sources).toEqual({ xu: 1, liang: 0, yuan: 1, wei: 1, total: 3 })
    expect(ctx.body.data.sources.liang).toBe(0)  // 这家降级
  })

  test('缺 birth → 400 INVALID_INPUT', async () => {
    Order.exists.mockResolvedValue({ _id: 'o1' })
    const ctx = await invokePost('/four-school',
      { baziId: 'b1' },  // 无 birth
      authFor('u4')
    )
    expect(ctx.status).toBe(400)
    expect(ctx.body.message).toMatch(/缺少出生信息/)
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('birth.year 越界(MIN_YEAR) → 400 INVALID_INPUT(沿用 paipan 边界校验)', async () => {
    Order.exists.mockResolvedValue({ _id: 'o1' })
    const ctx = await invokePost('/four-school',
      { baziId: 'b1', birth: { year: 1500, month: 1, day: 1, hour: 0, gender: 'male' } },
      authFor('u5')
    )
    expect(ctx.status).toBe(400)
  })
})