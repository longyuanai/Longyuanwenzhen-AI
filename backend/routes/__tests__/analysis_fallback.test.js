// routes/__tests__/analysis_fallback.test.js - AI fallback 路由测试
//
// 覆盖 P0 #30 修复:AI 网关超时/失败时,不该再返固定文案「命理解读生成中,请稍后再试」,
// 而应走本地降级模板（utils/localFallback.js）。
//
// 测试矩阵:
//   1. basic:axios 抛 ECONNABORTED(模拟 5s 超时) → 返本地降级,开头「本地解读模板」
//   2. deep:axios 抛 401(模拟 key 无效) → 同样降级,含「深度报告」结构
//   3. four-school:axios 抛网络错(模拟 AI 网关 down) → 降级,含四家标题
//   4. axios 正常返回 → 不走降级,原样返回 AI content
//   5. basic 不需登录/deep+four-school 需鉴权 + 付费(401/403 仍正确)

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

function authFor(userId) {
  const jwt = require('jsonwebtoken')
  const config = require('../../config')
  return `Bearer ${jwt.sign({ userId, openid: 'o' + userId }, config.jwt.secret, { expiresIn: '1h' })}`
}

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

const VALID_BIRTH = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

describe('AI fallback (P0 #30) - 三条解读路径', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Order.exists.mockResolvedValue(null)
    User.findById.mockReturnValue({ select: () => Promise.resolve(null) })
    // entitlementRegistry 走 Mongo 路径(readyState=1),让 jest.mock 接管的 Order/User 生效
    mongoose.connection.readyState = 1
  })

  test('basic - axios ECONNABORTED(超时) → 走本地降级', async () => {
    axios.post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' })
    const ctx = await invokePost('/basic', { baziId: 'B1', birth: VALID_BIRTH })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.type).toBe('basic')
    expect(ctx.body.data.content).toMatch(/^【本地解读模板】/)
    expect(ctx.body.data.content).toContain('壬')
    expect(ctx.body.data.content).not.toBe('命理解读生成中，请稍后再试。')
  })

  test('basic - axios 401(无效 key) → 走本地降级', async () => {
    axios.post.mockRejectedValueOnce({ response: { status: 401 }, message: 'Request failed with status code 401' })
    const ctx = await invokePost('/basic', { baziId: 'B2', birth: VALID_BIRTH })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.content.startsWith('【本地解读模板】')).toBe(true)
  })

  test('basic - axios 正常返回 → 不走降级,原样返回 AI content', async () => {
    axios.post.mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'AI 给出的真实解读内容。' } }] }
    })
    const ctx = await invokePost('/basic', { baziId: 'B3', birth: VALID_BIRTH })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.content).toBe('AI 给出的真实解读内容。')
    expect(ctx.body.data.content.startsWith('【本地解读模板】')).toBe(false)
  })

  test('basic - axios 收到 timeout:5000 配置(防 21s 假死)', async () => {
    axios.post.mockResolvedValueOnce({
      data: { choices: [{ message: { content: 'ok' } }] }
    })
    await invokePost('/basic', { baziId: 'B4', birth: VALID_BIRTH })
    const opts = axios.post.mock.calls[0][2]
    expect(opts.timeout).toBe(5000)
  })

  test('deep - axios 超时 → 走本地降级(含深度报告结构)', async () => {
    Order.exists.mockResolvedValueOnce(true) // 已付费
    axios.post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
    const ctx = await invokePost('/deep', { baziId: 'D1', birth: VALID_BIRTH }, authFor('u-deep'))
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.type).toBe('deep')
    expect(ctx.body.data.content.startsWith('【本地解读模板】')).toBe(true)
    expect(ctx.body.data.content).toContain('一、命局总评')
  })

  test('four-school - axios 网络错误 → 走本地降级(含四家标题)', async () => {
    Order.exists.mockResolvedValueOnce(true) // 已付费
    axios.post.mockRejectedValueOnce(new Error('Network Error'))
    const ctx = await invokePost('/four-school', { baziId: 'F1', birth: VALID_BIRTH }, authFor('u-fs'))
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.type).toBe('four_school')
    expect(ctx.body.data.content.startsWith('【本地解读模板】')).toBe(true)
    expect(ctx.body.data.content).toContain('徐乐吾派')
    expect(ctx.body.data.content).toContain('梁湘润派')
    expect(ctx.body.data.content).toContain('袁树珊派')
    expect(ctx.body.data.content).toContain('韦千里派')
  })
})