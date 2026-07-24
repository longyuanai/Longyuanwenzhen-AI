// middleware/auth.js - JWT 鉴权中间件
//
// 背景:各路由普遍读取 ctx.state.user.userId,但此前项目中没有任何地方对
// Authorization 头验签并写入 ctx.state.user —— 鉴权形同虚设。其后果是
// /order/:orderId/confirm 这种缺少 userId 校验的接口完全裸奔(fail-open),
// 任何人都能把任意订单标记为已支付。
//
// 本中间件验签后写入 ctx.state.user = { userId, openid },失败统一返回 401 信封。
//
// 分层(2026-07-25 整理):
//   - envelope.js        : 401/403 信封构造(供其他中间件复用)
//   - extractToken.js    : Authorization: Bearer <token> 解析
//   - auth.js(本文件)    : 强制鉴权主流程

const jwt = require('jsonwebtoken')
const config = require('../config')
const { envelope } = require('./envelope')
const { extractToken } = require('./extractToken')

async function authRequired(ctx, next) {
  const token = extractToken(ctx)
  if (!token) {
    ctx.status = 401
    ctx.body = envelope(401, '未授权，请先登录')
    return
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret)
    if (!payload || !payload.userId) {
      ctx.status = 401
      ctx.body = envelope(401, '登录态无效')
      return
    }
    ctx.state.user = { userId: String(payload.userId), openid: payload.openid }
    await next()
  } catch (err) {
    ctx.status = 401
    ctx.body = envelope(401, '登录已过期或无效')
  }
}

module.exports = { authRequired, extractToken }