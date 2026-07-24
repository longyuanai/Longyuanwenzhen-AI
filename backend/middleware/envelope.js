// middleware/envelope.js - 统一响应信封
//
// 所有路由 ctx.body 用同一形 { code, message, data, timestamp }。
// 401/403 这类鉴权错误也走同一封装,前端无需为鉴权错误单独判 schema。
//
// 调用:
//   envelope(401, '未授权')  -> { code: 401, message: '未授权', data: null, timestamp: ... }

function envelope(code, message, data = null) {
  return { code, message, data, timestamp: Date.now() }
}

module.exports = { envelope }