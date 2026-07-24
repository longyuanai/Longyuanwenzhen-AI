// middleware/extractToken.js - Authorization 头解析
//
// 从 Authorization: Bearer <token> 提取 token,失败返 null。
// 供 authRequired / 任何后续鉴权中间件复用,避免重复解析。

function extractToken(ctx) {
  const header = (ctx.headers && ctx.headers.authorization) || ''
  const [scheme, token] = header.split(' ')
  if (scheme === 'Bearer' && token) return token.trim()
  return null
}

module.exports = { extractToken }