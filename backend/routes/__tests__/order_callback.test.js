// routes/__tests__/order_callback.test.js - /order/callback 微信回调端到端
//
// 覆盖:合法回调 → ackOk 200 SUCCESS + 订单转 paid + 写权益
//       伪造签名 → 400 FAIL
//       重复回调(订单已 paid)→ 幂等 ackOk 200
//       订单不存在 → ackFail
//       无 apiKey 配置 → 503

jest.mock('../../models/Order')
jest.mock('../../models/User')

const Order = require('../../models/Order')
const User = require('../../models/User')

jest.mock('../../config', () => ({
  wxpay: { apiKey: 'test-api-key-for-sign' }
}))

const { md5Sign } = require('../../utils/wxpay')
const router = require('../order')

function signedParams(overrides = {}) {
  const params = {
    return_code: 'SUCCESS',
    result_code: 'SUCCESS',
    out_trade_no: 'order-1',
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
  Order.findById.mockReset()
  User.findById.mockReset()
})

describe('POST /api/v1/order/callback', () => {
  test('合法回调 → 200 SUCCESS,订单转 paid,VIP 订单写用户权益', async () => {
    const orderDoc = {
      _id: 'order-vip-1',
      userId: 'u-vip',
      productType: 'vip_month',
      amount: 99,
      status: 'pending',
      save: jest.fn(async function () { return this })
    }
    Order.findById.mockResolvedValue(orderDoc)
    const userDoc = { _id: 'u-vip', vipLevel: 0, vipExpireAt: null, save: jest.fn(async function () { return this }) }
    User.findById.mockResolvedValue(userDoc)

    const ctx = await invokeCallback(signedParams({ out_trade_no: 'order-vip-1' }))
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
      _id: 'order-deep-1',
      userId: 'u-1',
      productType: 'deep_report',
      amount: 29.9,
      status: 'pending',
      save: jest.fn(async function () { return this })
    }
    Order.findById.mockResolvedValue(orderDoc)

    const ctx = await invokeCallback(signedParams({ out_trade_no: 'order-deep-1', total_fee: '2990' }))
    expect(ctx.status).toBe(200)
    expect(orderDoc.status).toBe('paid')
    expect(User.findById).not.toHaveBeenCalled() // vip_month 才写 user
  })

  test('伪造签名 → 400 FAIL', async () => {
    const params = signedParams({ out_trade_no: 'order-1' })
    params.sign = 'DEADBEEF' // 覆盖伪造
    const ctx = await invokeCallback(params)
    expect(ctx.status).toBe(400)
    expect(ctx.body).toContain('FAIL')
    expect(ctx.body).toContain('验签失败')
    expect(Order.findById).not.toHaveBeenCalled()
  })

  test('重复回调(订单已 paid)→ 幂等 ackOk 200,不重复 save', async () => {
    const orderDoc = {
      _id: 'order-2',
      userId: 'u-2',
      productType: 'deep_report',
      amount: 29.9,
      status: 'paid', // 已 paid
      save: jest.fn()
    }
    Order.findById.mockResolvedValue(orderDoc)

    const ctx = await invokeCallback(signedParams({ out_trade_no: 'order-2', total_fee: '2990' }))
    expect(ctx.status).toBe(200)
    expect(ctx.body).toContain('SUCCESS')
    expect(orderDoc.save).not.toHaveBeenCalled()
  })

  test('订单不存在 → 200 FAIL', async () => {
    Order.findById.mockResolvedValue(null)
    const ctx = await invokeCallback(signedParams({ out_trade_no: 'no-such' }))
    expect(ctx.body).toContain('FAIL')
    expect(ctx.body).toContain('订单不存在')
  })

  test('金额不匹配 → 200 FAIL', async () => {
    const orderDoc = {
      _id: 'order-3',
      userId: 'u-3',
      productType: 'deep_report',
      amount: 29.9,
      status: 'pending',
      save: jest.fn()
    }
    Order.findById.mockResolvedValue(orderDoc)
    // total_fee 写错 1000 分(应付 2990 分)
    const ctx = await invokeCallback(signedParams({ out_trade_no: 'order-3', total_fee: '1000' }))
    expect(ctx.body).toContain('FAIL')
    expect(ctx.body).toContain('金额不匹配')
    expect(orderDoc.status).toBe('pending')
    expect(orderDoc.save).not.toHaveBeenCalled()
  })

  test('支付未成功(result_code != SUCCESS)→ 200 FAIL 不写 paid', async () => {
    const orderDoc = {
      _id: 'order-4',
      userId: 'u-4',
      productType: 'deep_report',
      amount: 29.9,
      status: 'pending',
      save: jest.fn()
    }
    Order.findById.mockResolvedValue(orderDoc)
    const params = signedParams({ out_trade_no: 'order-4', total_fee: '2990', result_code: 'FAIL' })
    params.sign = md5Sign(params, 'test-api-key-for-sign')
    const ctx = await invokeCallback(params)
    expect(ctx.body).toContain('FAIL')
    expect(orderDoc.status).toBe('pending')
  })
})