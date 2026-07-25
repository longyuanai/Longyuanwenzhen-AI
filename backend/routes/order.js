// routes/order.js - 订单路由
//
// 安全要点（阶段1 修复）：
// 1. 所有用户接口经 authRequired 鉴权，ctx.state.user 才有值。
// 2. 订单金额由服务端价格表决定，忽略客户端传入的 amount（防价格篡改）。
// 3. /confirm 已「去信任化」：客户端无权置 paid，仅做带归属校验的只读状态查询。
// 4. 订单 → paid 的唯一合法路径是微信异步回调 /callback：验签 + 金额匹配 + 幂等。
const Router = require('koa-router')
const mongoose = require('mongoose')
const config = require('../config')
const logger = require('../utils/logger')
const Order = require('../models/Order')
const User = require('../models/User')
const { getProduct } = require('../config/products')
const { verifySign } = require('../utils/wxpay')
const { authRequired } = require('../middleware/auth')
const sentry = require('../utils/sentry')
const reg = require('../utils/entitlementRegistry')

const router = new Router()

// 微信回调要求返回的 XML 应答
function ackOk() {
  return '<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>'
}
function ackFail(msg) {
  return `<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[${msg}]]></return_msg></xml>`
}

// 按 orderId 取订单并校验归属。orderId 来自 URL，非法 ObjectId 会让 findById
// 抛 CastError → 500，所以先校验格式再查库。
// 命中问题时直接写好响应并返回 null，调用方据此 return。
async function loadOwnedOrder(ctx, orderId, denyMessage) {
  if (!mongoose.Types.ObjectId.isValid(String(orderId || ''))) {
    ctx.status = 404
    ctx.body = { code: 404, message: '订单不存在', data: null, timestamp: Date.now() }
    return null
  }
  const order = await Order.findById(orderId)
  if (!order) {
    ctx.status = 404
    ctx.body = { code: 404, message: '订单不存在', data: null, timestamp: Date.now() }
    return null
  }
  if (order.userId.toString() !== ctx.state.user.userId) {
    ctx.status = 403
    ctx.body = { code: 403, message: denyMessage, data: null, timestamp: Date.now() }
    return null
  }
  return order
}

// 支付成功后发放权益。deep_report 的权益即「存在一条 paid 订单」，由 analysis/deep 校验；
// vip_month 需要写用户 VIP 等级与到期时间。
async function grantEntitlement(order) {
  const userId = String(order.userId)

  if (order.productType === 'vip_month') {
    const user = await User.findById(order.userId)
    if (user) {
      const now = new Date()
      const base = user.vipExpireAt && user.vipExpireAt > now ? user.vipExpireAt : now
      user.vipLevel = Math.max(user.vipLevel, 1)
      user.vipExpireAt = new Date(base.getTime() + 30 * 24 * 3600 * 1000)
      await user.save()
    }
  }

  // 同步权益注册表的内存视图。注册表在 Mongo 不可用时是唯一的权益来源，
  // 只写 Mongo 会让两边不一致（刚支付完却查不到权益）。写失败不影响回调应答：
  // Mongo 里的订单状态才是权威，注册表只是缓存/兜底。
  try {
    await reg.registerOrderPaid(userId, order.productType)
  } catch (err) {
    logger.warn(`权益注册表同步失败(订单 ${order._id}): ${err.message}`)
  }
}

/**
 * 创建订单
 * POST /api/v1/order/create
 * 金额以服务端价格表为准，忽略客户端传入的 amount。
 */
router.post('/create', authRequired, async (ctx) => {
  try {
    const { productType } = ctx.request.body
    const userId = ctx.state.user.userId

    const product = getProduct(productType)
    if (!product) {
      ctx.status = 400
      ctx.body = { code: 400, message: '无效的商品类型', data: null, timestamp: Date.now() }
      return
    }

    // 复用同用户同产品的未支付订单，避免连点/重试造出一堆废单。
    // 只复用金额一致的：价格表调过价后旧单作废，重新下单走新价。
    let order = await Order.findOne({
      userId,
      productType: product.productType,
      status: 'pending',
      amount: product.amount
    }).sort({ createdAt: -1 })

    if (order) {
      logger.info(`复用未支付订单: ${order._id}, 用户: ${userId}, 产品: ${product.productType}`)
    } else {
      order = new Order({
        userId: userId,
        productType: product.productType,
        amount: product.amount, // 服务端权威定价
        status: 'pending'
      })
      await order.save()
      logger.info(`创建订单: ${order._id}, 用户: ${userId}, 产品: ${product.productType}, 金额: ${product.amount}`)
    }

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        orderId: order._id,
        productType: order.productType,
        amount: order.amount,
        status: order.status
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('创建订单错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '创建订单失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 支付回调（微信支付服务器调用，公开接口，无 JWT）
 * POST /api/v1/order/callback
 * 这是订单状态变为 paid 的唯一合法入口。
 */
router.post('/callback', async (ctx) => {
  ctx.type = 'application/xml'

  // 安全默认：未配置商户 API 密钥则无法验签，拒绝任何回调，绝不标记支付成功。
  const apiKey = config.wxpay.apiKey
  if (!apiKey) {
    logger.error('收到支付回调但未配置 WXPAY_API_KEY，拒绝处理')
    ctx.status = 503
    ctx.body = ackFail('支付未配置')
    return
  }

  // TODO(集成): 微信 v2 回调为 XML，正式接入时需在此把请求体解析为对象（需引入 XML 解析）。
  // 当前以 ctx.request.body 的扁平参数为准，便于联调与单测。
  const params = ctx.request.body || {}

  try {
    if (!verifySign(params, apiKey)) {
      logger.warn('支付回调验签失败')
      sentry.captureMessage('wxpay callback signature invalid', 'warning')
      ctx.status = 400
      ctx.body = ackFail('验签失败')
      return
    }

    if (params.return_code !== 'SUCCESS' || params.result_code !== 'SUCCESS') {
      ctx.body = ackFail('支付未成功')
      return
    }

    // out_trade_no 是外部输入，非法 ObjectId 会让 findById 抛 CastError → 500，
    // 而微信对 5xx 会持续重推同一条回调。先校验格式，直接判「订单不存在」。
    const outTradeNo = String(params.out_trade_no || '')
    if (!mongoose.Types.ObjectId.isValid(outTradeNo)) {
      logger.warn(`支付回调 out_trade_no 非法: ${outTradeNo}`)
      ctx.body = ackFail('订单不存在')
      return
    }

    const order = await Order.findById(outTradeNo)
    if (!order) {
      ctx.body = ackFail('订单不存在')
      return
    }

    // 幂等：已处理过直接返回成功，避免重复发放权益
    if (order.status === 'paid') {
      ctx.body = ackOk()
      return
    }

    // 金额必须与服务端订单一致（微信 total_fee 单位为分）
    const expectedFen = Math.round(order.amount * 100)
    if (Number(params.total_fee) !== expectedFen) {
      logger.error(`支付金额不匹配: 订单应付 ${expectedFen} 分, 回调 ${params.total_fee} 分`)
      sentry.captureMessage(`wxpay amount mismatch: expected ${expectedFen}, got ${params.total_fee}`, 'error')
      ctx.body = ackFail('金额不匹配')
      return
    }

    order.status = 'paid'
    order.transactionId = params.transaction_id || null
    order.paidAt = new Date()
    await order.save()

    await grantEntitlement(order)

    logger.info(`支付成功（回调确认）: 订单 ${order._id}, 交易号 ${order.transactionId}`)
    ctx.body = ackOk()
  } catch (err) {
    logger.error('支付回调处理错误:', err)
    sentry.captureException(err, { method: ctx.method, url: ctx.url, status: 500, ip: ctx.ip })
    ctx.status = 500
    ctx.body = ackFail('服务器错误')
  }
})

/**
 * 查询订单列表
 * GET /api/v1/order/list
 * 注意：必须声明在 GET /:orderId 之前，否则会被参数路由吞掉。
 */
router.get('/list', authRequired, async (ctx) => {
  try {
    const userId = ctx.state.user.userId
    const orders = await Order.find({ userId }).sort({ createdAt: -1 }).limit(20)
    ctx.body = { code: 200, message: 'success', data: orders, timestamp: Date.now() }
  } catch (err) {
    logger.error('查询订单错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '查询订单失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 获取支付参数
 * POST /api/v1/order/:orderId/pay
 */
router.post('/:orderId/pay', authRequired, async (ctx) => {
  try {
    const { orderId } = ctx.params

    const order = await loadOwnedOrder(ctx, orderId, '无权操作此订单')
    if (!order) return

    // TODO(集成): 调用微信支付统一下单 API 获取真实 prepay_id 与 paySign。
    // 需商户号与证书，待商户资质就绪后接入；当前返回占位数据仅供前端联调。
    const payParams = {
      timeStamp: String(Math.floor(Date.now() / 1000)),
      nonceStr: Math.random().toString(36).substr(2, 15),
      package: `prepay_id=wx_prepay_id_${orderId}`,
      signType: 'MD5',
      paySign: 'mock_pay_sign'
    }

    logger.info(`获取支付参数: ${orderId}`)
    ctx.body = { code: 200, message: 'success', data: payParams, timestamp: Date.now() }
  } catch (err) {
    logger.error('获取支付参数错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '获取支付参数失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 查询单个订单状态（带归属校验，只读）
 * POST /api/v1/order/:orderId/confirm
 *
 * 安全：本接口已去信任化。客户端无权把订单置为已支付，
 * 真正的 paid 转换只能由微信回调 /callback 验签后写入。
 * 这里仅返回订单当前状态，供前端支付返回后轮询。
 */
router.post('/:orderId/confirm', authRequired, async (ctx) => {
  try {
    const { orderId } = ctx.params

    const order = await loadOwnedOrder(ctx, orderId, '无权操作此订单')
    if (!order) return

    ctx.body = {
      code: 200,
      message: 'success',
      data: { orderId: order._id, status: order.status, paidAt: order.paidAt },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('查询订单状态错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '查询订单失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 查询订单详情（带归属校验）
 * GET /api/v1/order/:orderId
 */
router.get('/:orderId', authRequired, async (ctx) => {
  try {
    const { orderId } = ctx.params

    const order = await loadOwnedOrder(ctx, orderId, '无权查看此订单')
    if (!order) return

    ctx.body = { code: 200, message: 'success', data: order, timestamp: Date.now() }
  } catch (err) {
    logger.error('查询订单详情错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '查询订单失败', data: null, timestamp: Date.now() }
  }
})

module.exports = router
