// config/__tests__/products.test.js - 服务端权威价格表测试
const { getProduct } = require('../products')

describe('getProduct', () => {
  test('已知产品返回定价（金额为正数）', () => {
    const p = getProduct('deep_report')
    expect(p).not.toBeNull()
    expect(p.productType).toBe('deep_report')
    expect(typeof p.amount).toBe('number')
    expect(p.amount).toBeGreaterThan(0)
  })

  test('未知产品返回 null（调用方据此拒绝下单）', () => {
    expect(getProduct('hack_free')).toBeNull()
    expect(getProduct(undefined)).toBeNull()
  })

  test('返回的是拷贝，修改不污染源价格表', () => {
    const p = getProduct('deep_report')
    p.amount = 0.01
    expect(getProduct('deep_report').amount).not.toBe(0.01)
  })
})
