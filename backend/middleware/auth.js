// middleware/auth.js - JWT 鉴权中间件
//
// 背景：各路由普遍读取 ctx.state.user.userId，但此前项目中没有任何地方对
// Authorization 头验签并写入 ctx.state.user —— 鉴权形同虚设。其后果是
// /order/:orderId/confirm 这种缺少 userId 校验的接口完全裸奔（fail-open），
// 任何人都能把任意订单标记为已支付。
//
// 本中间件验签后写入 ctx.state.user = { userId, openid }，失败统一返回 401 信封。
const jwt = require('jsonwebtoken')
const config = require('../config')

function unauthorized(ctx, message = '未授权，请先登录') {
  ctx.status = 401
  ctx.body = { code: 401, message, data: null, timestamp: Date.now() }
}

// 从 Authorization: Bearer <token> 提取 token，取不到返回 null
function extractToken(ctx) {
  const header = (ctx.headers && ctx.headers.authorization) || ''
  const [scheme, token] = header.split(' ')
  if (scheme === 'Bearer' && token) return token.trim()
  return null
}

// 强制鉴权：无 token 或验签失败 → 401 并中断后续处理
async function authRequired(ctx, next) {
  const token = extractToken(ctx)
  if (!token) return unauthorized(ctx)

  try {
    const payload = jwt.verify(token, config.jwt.secret)
    if (!payload || !payload.userId) return unauthorized(ctx, '登录态无效')
    ctx.state.user = { userId: String(payload.userId), openid: payload.openid }
    await next()
  } catch (err) {
    return unauthorized(ctx, '登录已过期或无效')
  }
}

module.exports = { authRequired, extractToken }
