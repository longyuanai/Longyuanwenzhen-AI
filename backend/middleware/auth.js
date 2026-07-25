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
    // role 必须回填，否则 access.js 的 roleRequired / admin 绕过永远走不到。
    // 只信任签发时写进 token 的角色，缺省一律降级为最低权限 'user'。
    ctx.state.user = {
      userId: String(payload.userId),
      openid: payload.openid,
      role: payload.role || 'user'
    }
    await next()
  } catch (err) {
    ctx.status = 401
    ctx.body = envelope(401, '登录已过期或无效')
  }
}

/**
 * 可选鉴权：带了合法 token 就填充 ctx.state.user，没带或无效则静默放行。
 *
 * 用于「免登录可用、登录后有增强」的接口。典型是 /bazi/paipan：
 * 匿名用户照常排盘，登录用户额外把结果存进历史记录。
 * 绝不能因为 token 无效就拦掉免费功能，故这里不返 401。
 */
async function authOptional(ctx, next) {
  const token = extractToken(ctx)
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret)
      if (payload && payload.userId) {
        ctx.state.user = {
          userId: String(payload.userId),
          openid: payload.openid,
          role: payload.role || 'user'
        }
      }
    } catch (err) {
      // token 过期/伪造 → 当作匿名处理，不阻断
    }
  }
  await next()
}

module.exports = { authRequired, authOptional, extractToken }