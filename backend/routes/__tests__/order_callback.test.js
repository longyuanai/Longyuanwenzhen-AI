// routes/__tests__/order_callback.test.js - /order/callback 微信回调端到端
//
// 覆盖:合法回调 → ackOk 200 SUCCESS + 订单转 paid + 写权益
//       伪造签名 → 400 FAIL
//       重复回调(订单已 paid)→ 幂等 ackOk 200
//       订单不存在 / out_trade_no 非法 → ackFail
//       无 apiKey 配置 → 503
//
// 注:out_trade_no 在生产中就是 order._id,即 24 位 hex 的 ObjectId,
// 故夹具一律用合法 ObjectId 字符串。路由会先校验格式再查库
// （非法值直接判「订单不存在」,避免 CastError 冒成 500 让微信反复重推）。

jest.mock('../../models/Order')
jest.mock('../../models/User')

const mongoose = require('mongoose')
const Order = require('../../models/Order')
const User = require('../../models/User')

jest.mock('../../config', () => ({
  wxpay: { apiKey: 'test-api-key-for-sign' },
  // 用户侧订单接口经 authRequired，需要 jwt.secret 才能验签放行
  jwt: { secret: 'test-secret-must-be-long-enough-for-jwt-validation' }
}))

const { md5Sign } = require('../../utils/wxpay')
const router = require('../order')

function signedParams(overrides = {}) {
  const params = {
    return_code: 'SUCCESS',
    result_code: 'SUCCESS',
    out_trade_no: '000000000000000000000001',
    transaction_id: 'wx-tx-123',
    total_fee: '9900', // 99 元 = 9900 分
    ...overrides
  }
  params.sign = md5Sign(params, 'test-api-key-for-sign')
  return params
}

async function invokeCallback(body) {
  const ctx = {
    method: 'POST',
    url: '/callback',
    headers: {},
    request: { body },
    state: {},
    status: 200,
    body: null,
    set: function () {},
    type: null
  }
  const layer = router.stack.find(l => l.methods.includes('POST') && l.path === '/callback')
  if (!layer) throw new Error('路由未注册: /callback')
  const mws = layer.stack
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
  // 模型层已被 mock，但路由入口会先判连接状态才继续 —— 声明「库是通的」，
  // 否则所有用例都会被 Mongo 未就绪的快速失败分支拦下。
  mongoose.connection.readyState = 1
  Order.findById.mockReset()
  User.findById.mockReset()
})

describe('POST /api/v1/order/callback', () => {
  test('合法回调 → 200 SUCCESS,订单转 paid,VIP 订单写用户权益', async () => {
    const orderDoc = {
      _id: '000000000000000000000002',
      userId: 'u-vip',
      productType: 'vip_month',
      amount: 99,
      status: 'pending',
      save: jest.fn(async function () { return this })
    }
    Order.findById.mockResolvedValue(orderDoc)
    const userDoc = { _id: 'u-vip', vipLevel: 0, vipExpireAt: null, save: jest.fn(async function () { return this }) }
    User.findById.mockResolvedValue(userDoc)

    const ctx = await invokeCallback(signedParams({ out_trade_no: '000000000000000000000002' }))
    expect(ctx.status).toBe(200)
    expect(ctx.body).toContain('SUCCESS')
    expect(orderDoc.status).toBe('paid')
    expect(orderDoc.transactionId).toBe('wx-tx-123')
    expect(orderDoc.save).toHaveBeenCalled()
    expect(userDoc.vipLevel).toBe(1)
    expect(userDoc.vipExpireAt).toBeInstanceOf(Date)
    expect(userDoc.save).toHaveBeenCalled()
  })

  test('deep_report 订单回调 → paid,但不写 VIP', async () => {
    const orderDoc = {
      _id: '000000000000000000000003',
      userId: 'u-1',
      productType: 'deep_report',
      amount: 29.9,
      status: 'pending',
      save: jest.fn(async function () { return this })
    }
    Order.findById.mockResolvedValue(orderDoc)

    const ctx = await invokeCallback(signedParams({ out_trade_no: '000000000000000000000003', total_fee: '2990' }))
    expect(ctx.status).toBe(200)
    expect(orderDoc.status).toBe('paid')
    expect(User.findById).not.toHaveBeenCalled() // vip_month 才写 user
  })

  test('伪造签名 → 400 FAIL', async () => {
    const params = signedParams({ out_trade_no: '000000000000000000000001' })
    params.sign = 'DEADBEEF' // 覆盖伪造
    const ctx = await invokeCallback(params)
    expect(ctx.status).toBe(400)
    expect(ctx.body).toContain('FAIL')
    expect(ctx.body).toContain('验签失败')
    expect(Order.findById).not.toHaveBeenCalled()
  })

  test('重复回调(订单已 paid)→ 幂等 ackOk 200,不重复 save', async () => {
    const orderDoc = {
      _id: '000000000000000000000004',
      userId: 'u-2',
      productType: 'deep_report',
      amount: 29.9,
      status: 'paid', // 已 paid
      save: jest.fn()
    }
    Order.findById.mockResolvedValue(orderDoc)

    const ctx = await invokeCallback(signedParams({ out_trade_no: '000000000000000000000004', total_fee: '2990' }))
    expect(ctx.status).toBe(200)
    expect(ctx.body).toContain('SUCCESS')
    expect(orderDoc.save).not.toHaveBeenCalled()
  })

  test('订单不存在 → 200 FAIL', async () => {
    Order.findById.mockResolvedValue(null)
    const ctx = await invokeCallback(signedParams({ out_trade_no: '0000000000000000000000ff' }))
    expect(ctx.body).toContain('FAIL')
    expect(ctx.body).toContain('订单不存在')
  })

  // 回归：非法 out_trade_no 曾让 findById 抛 CastError 冒成 500，
  // 而微信对 5xx 会持续重推同一条回调。必须判成「订单不存在」并且不查库。
  test('out_trade_no 非 ObjectId → 200 FAIL 且不查库', async () => {
    const ctx = await invokeCallback(signedParams({ out_trade_no: 'not-an-object-id' }))
    expect(ctx.status).toBe(200)
    expect(ctx.body).toContain('FAIL')
    expect(ctx.body).toContain('订单不存在')
    expect(Order.findById).not.toHaveBeenCalled()
  })

  test('金额不匹配 → 200 FAIL', async () => {
    const orderDoc = {
      _id: '000000000000000000000005',
      userId: 'u-3',
      productType: 'deep_report',
      amount: 29.9,
      status: 'pending',
      save: jest.fn()
    }
    Order.findById.mockResolvedValue(orderDoc)
    // total_fee 写错 1000 分(应付 2990 分)
    const ctx = await invokeCallback(signedParams({ out_trade_no: '000000000000000000000005', total_fee: '1000' }))
    expect(ctx.body).toContain('FAIL')
    expect(ctx.body).toContain('金额不匹配')
    expect(orderDoc.status).toBe('pending')
    expect(orderDoc.save).not.toHaveBeenCalled()
  })

  test('支付未成功(result_code != SUCCESS)→ 200 FAIL 不写 paid', async () => {
    const orderDoc = {
      _id: '000000000000000000000006',
      userId: 'u-4',
      productType: 'deep_report',
      amount: 29.9,
      status: 'pending',
      save: jest.fn()
    }
    Order.findById.mockResolvedValue(orderDoc)
    const params = signedParams({ out_trade_no: '000000000000000000000006', total_fee: '2990', result_code: 'FAIL' })
    params.sign = md5Sign(params, 'test-api-key-for-sign')
    const ctx = await invokeCallback(params)
    expect(ctx.body).toContain('FAIL')
    expect(orderDoc.status).toBe('pending')
  })
})

describe('POST /api/v1/order/callback - MongoDB 不可用', () => {
  // 回归：库连不上时若放任 mongoose 缓冲，要挂满 bufferTimeoutMS(默认 10s)
  // 才失败，微信侧可能已判超时。必须立刻返回 FAIL 让它按重推机制稍后再送。
  test('库未连接 → 立刻 503 FAIL，且不查库', async () => {
    mongoose.connection.readyState = 0
    const ctx = await invokeCallback(signedParams())

    expect(ctx.status).toBe(503)
    expect(ctx.body).toContain('FAIL')
    expect(Order.findById).not.toHaveBeenCalled()
  })

  test('库未连接时绝不把订单判成已支付', async () => {
    mongoose.connection.readyState = 0
    const ctx = await invokeCallback(signedParams())
    expect(ctx.body).not.toContain('SUCCESS')
  })
})

describe('用户侧订单接口 - MongoDB 不可用', () => {
  // 回归：此前 /order/create 会靠 mongoose 缓冲挂满 10s 才 500，
  // 用户点一下支付要干等十秒才看到失败。现在入口即判，立刻 503。
  function authFor(userId) {
    const jwt = require('jsonwebtoken')
    const config = require('../../config')
    return `Bearer ${jwt.sign({ userId, openid: 'o' + userId }, config.jwt.secret, { expiresIn: '1h' })}`
  }

  async function invokeUser(method, path, auth) {
    const ctx = {
      method,
      url: path,
      params: {},
      query: {},
      headers: auth ? { authorization: auth } : {},
      request: { body: { productType: 'deep_report' } },
      state: {},
      status: 200,
      body: null,
      set: function () {}
    }
    const layer = router.stack.find((l) => l.methods.includes(method) && l.path === path)
    if (!layer) throw new Error(`路由未注册: ${method} ${path}`)
    let i = 0
    async function next() {
      if (i >= layer.stack.length) return
      await layer.stack[i++](ctx, next)
    }
    await next()
    return ctx
  }

  test('库未连接 → /order/create 立刻 503，且完全不碰 Mongo', async () => {
    mongoose.connection.readyState = 0
    const ctx = await invokeUser('POST', '/create', authFor('507f1f77bcf86cd799439011'))

    expect(ctx.status).toBe(503)
    expect(ctx.body.code).toBe(503)
    // 关键：没有把查询丢给 mongoose 缓冲，所以不会挂满 10s
    expect(Order.findOne).not.toHaveBeenCalled()
  })

  test('库未连接 → /order/list 立刻 503', async () => {
    mongoose.connection.readyState = 0
    const ctx = await invokeUser('GET', '/list', authFor('507f1f77bcf86cd799439011'))
    expect(ctx.status).toBe(503)
    expect(Order.find).not.toHaveBeenCalled()
  })

  test('库连接正常时不被 503 拦掉', async () => {
    mongoose.connection.readyState = 1
    Order.find.mockReturnValue({
      sort: () => ({ limit: async () => [] })
    })
    const ctx = await invokeUser('GET', '/list', authFor('507f1f77bcf86cd799439011'))
    expect(ctx.status).toBe(200)
  })
})
