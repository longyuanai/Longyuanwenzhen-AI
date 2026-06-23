// config/products.js - 付费产品的「服务端权威价格表」
//
// 安全：订单金额必须由服务端按 productType 决定，绝不能信任客户端请求体里传入的
// amount，否则用户可篡改请求用 0.01 元解锁付费内容（价格篡改漏洞）。
//
// 注意：以下为占位价格（元），上线前请按实际运营定价调整，可用环境变量覆盖。
function positiveNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const PRODUCTS = Object.freeze({
  deep_report: Object.freeze({
    productType: 'deep_report',
    name: '深度命理报告',
    amount: positiveNumber(process.env.PRICE_DEEP_REPORT, 9.9)
  }),
  vip_month: Object.freeze({
    productType: 'vip_month',
    name: '月度会员',
    amount: positiveNumber(process.env.PRICE_VIP_MONTH, 19.9)
  })
})

// 返回产品定义的浅拷贝，未知产品返回 null（调用方负责拒绝）
function getProduct(productType) {
  const product = PRODUCTS[productType]
  return product ? { ...product } : null
}

module.exports = { PRODUCTS, getProduct }
