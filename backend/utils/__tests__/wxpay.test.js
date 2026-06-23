// utils/__tests__/wxpay.test.js - 微信支付验签纯函数测试
const { buildSignSource, md5Sign, verifySign } = require('../wxpay')

const API_KEY = 'test_api_key_32_chars_xxxxxxxxxx'

describe('buildSignSource', () => {
  test('按 key 字典序升序拼接并追加 &key=APIKEY', () => {
    const src = buildSignSource({ b: '2', a: '1' }, API_KEY)
    expect(src).toBe(`a=1&b=2&key=${API_KEY}`)
  })

  test('剔除 sign 字段与空值', () => {
    const src = buildSignSource({ a: '1', sign: 'X', empty: '', nul: null, und: undefined }, API_KEY)
    expect(src).toBe(`a=1&key=${API_KEY}`)
  })
})

describe('verifySign', () => {
  // 用正确算法生成一个合法签名作为基准
  function signedParams() {
    const params = { out_trade_no: 'order123', total_fee: '990', result_code: 'SUCCESS' }
    params.sign = md5Sign(params, API_KEY)
    return params
  }

  test('正确签名通过', () => {
    expect(verifySign(signedParams(), API_KEY)).toBe(true)
  })

  test('参数被篡改后验签失败', () => {
    const params = signedParams()
    params.total_fee = '1' // 改金额不改 sign
    expect(verifySign(params, API_KEY)).toBe(false)
  })

  test('apiKey 缺失一律失败（安全默认）', () => {
    expect(verifySign(signedParams(), '')).toBe(false)
  })

  test('无 sign 字段失败', () => {
    expect(verifySign({ out_trade_no: 'x' }, API_KEY)).toBe(false)
  })

  test('错误密钥失败', () => {
    expect(verifySign(signedParams(), 'wrong_key_wrong_key_wrong_key_xx')).toBe(false)
  })
})
