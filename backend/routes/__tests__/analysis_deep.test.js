// routes/__tests__/analysis_deep.test.js - /deep 端到端
//
// 覆盖:合法盘 + AI 正常返 / 付费校验 / 无 token / 过期盘 / AI 网关失败走 fallback

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
  await next()
  return ctx
}

beforeEach(() => {
  mongoose.connection.readyState = 1
  axios.post.mockReset()
  Order.exists.mockReset()
  User.findById.mockReset()
})

describe('POST /api/v1/analysis/deep', () => {
  const validBirth = {
    year: 2002, month: 11, day: 20, hour: 10, gender: 'male'
  }

  test('无 token → 401', async () => {
    const ctx = await invokePost('/deep', { birth: validBirth })
    expect(ctx.status).toBe(401)
    expect(ctx.body.code).toBe(401)
  })

  test('未付费 → 403(无 paid deep_report 订单,无 VIP)', async () => {
    Order.exists.mockResolvedValue(null)
    User.findById.mockResolvedValue(null)
    const ctx = await invokePost('/deep', { birth: validBirth }, authFor('u-deep-unpaid'))
    expect(ctx.status).toBe(403)
    expect(ctx.body.code).toBe(403)
    expect(ctx.body.data.paid).toBe(false)
  })

  test('已付费(paid deep_report)→ 200,AI 正常时返 content', async () => {
    Order.exists.mockImplementation(async ({ productType }) => {
      return productType === 'deep_report' ? { _id: 'paid-1' } : null
    })
    User.findById.mockResolvedValue(null)
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '日主甲木,深度报告内容...' } }] }
    })
    const ctx = await invokePost('/deep', { baziId: 'D1', birth: validBirth }, authFor('u-deep-paid'))
    expect(ctx.status).toBe(200)
    expect(ctx.body.code).toBe(200)
    expect(ctx.body.data.type).toBe('deep')
    expect(ctx.body.data.content).toContain('日主甲木')
    expect(ctx.body.data.mingju).toBeDefined()
    expect(ctx.body.data.mingju.dayMaster.gan).toBe('壬')
  })

  test('AI 网关 down(axios 抛错)→ 走本地 fallback,200 + 开头「本地解读模板」', async () => {
    Order.exists.mockImplementation(async ({ productType }) => {
      return productType === 'deep_report' ? { _id: 'paid-1' } : null
    })
    axios.post.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:443'))
    const ctx = await invokePost('/deep', { baziId: 'D1', birth: validBirth }, authFor('u-deep-paid'))
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.type).toBe('deep')
    expect(ctx.body.data.content).toMatch(/【本地解读模板】/)
    expect(ctx.body.data.content).toContain('命局总评')
  })

  test('过期盘(1900 年以前)→ 400 INVALID_INPUT', async () => {
    Order.exists.mockImplementation(async ({ productType }) => {
      return productType === 'deep_report' ? { _id: 'paid-1' } : null
    })
    const ctx = await invokePost(
      '/deep',
      { birth: { year: 1800, month: 1, day: 1, hour: 0, gender: 'male' } },
      authFor('u-deep-paid')
    )
    expect(ctx.status).toBe(400)
    expect(ctx.body.code).toBe(400)
  })

  test('VIP 用户(无 deep_report 订单)→ 200,走 VIP 通道', async () => {
    Order.exists.mockResolvedValue(null)
    // entitlementRegistry 调 User.findById(id).select('vipLevel vipExpireAt') 然后 await
    // jest 自动 mock 的 .select() 返 undefined,所以要构造 thenable 链
    User.findById.mockReturnValue({
      select: () => Promise.resolve({
        _id: 'u-vip',
        vipLevel: 'vip',
        vipExpireAt: new Date(Date.now() + 7 * 86400 * 1000)
      })
    })
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'VIP 深度解读' } }] }
    })
    const ctx = await invokePost('/deep', { birth: validBirth }, authFor('u-vip'))
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.type).toBe('deep')
  })
})