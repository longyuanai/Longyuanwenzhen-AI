// utils/wxpay.js - 微信支付 v2 签名校验（纯函数，可离线单测）
//
// 安全核心：服务端的「已支付」状态只能来自微信异步回调，且必须验签通过 + 金额匹配
// 才能把订单标记为 paid。任何客户端断言（例如旧的 /confirm 直接置 paid）都不可信。
const crypto = require('crypto')

// 按微信 v2 规则拼接待签名串：参数按 key 字典序升序，剔除空值与 sign 字段，
// 末尾追加 &key=APIKEY。
function buildSignSource(params, apiKey) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
  const pairs = keys.map((k) => `${k}=${params[k]}`)
  return `${pairs.join('&')}&key=${apiKey}`
}

// 计算 MD5 签名（大写），微信 v2 signType=MD5 默认算法
function md5Sign(params, apiKey) {
  const source = buildSignSource(params, apiKey)
  return crypto.createHash('md5').update(source, 'utf8').digest('hex').toUpperCase()
}

// 校验回调签名。apiKey 缺失或参数无 sign 一律判失败（安全默认）。
// 用 timingSafeEqual 做定长安全比较，避免时序侧信道。
function verifySign(params, apiKey) {
  if (!apiKey || !params || !params.sign) return false
  const expected = md5Sign(params, apiKey)
  const actual = String(params.sign).toUpperCase()
  if (expected.length !== actual.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

module.exports = { buildSignSource, md5Sign, verifySign }
