// config/__tests__/env-wiring.test.js - .env 变量名 ↔ config 读取的接线测试
//
// 背景：.env.example 写 WX_SECRET / WX_PAY_KEY，config/index.js 却读
// WX_APPSECRET / WXPAY_API_KEY —— 照模板填 .env 的人，微信登录必失败、
// 支付回调恒 503。这类"名字对不上"的 bug 不会让任何测试变红，只会在联调
// 现场浪费半天，所以在这里把接线锁死。
//
// config/index.js 在模块顶层读 process.env，故每个用例都要先改 env 再
// jest.resetModules() 重新 require。

const ENV_KEYS = [
  'WX_SECRET', 'WX_APPSECRET',
  'WXPAY_API_KEY', 'WX_PAY_KEY',
  'WXPAY_MCHID', 'WX_PAY_MCHID',
  'WXPAY_NOTIFY_URL', 'WX_PAY_NOTIFY_URL',
  'OPENAI_BASE_URL', 'OPENAI_MODEL',
  'JWT_EXPIRES_IN'
]

function loadConfig(overrides = {}) {
  jest.resetModules()
  ENV_KEYS.forEach((k) => delete process.env[k])
  Object.assign(process.env, overrides)
  return require('../index')
}

describe('config 环境变量接线', () => {
  const saved = {}

  beforeAll(() => {
    ENV_KEYS.forEach((k) => { saved[k] = process.env[k] })
  })

  afterAll(() => {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    })
    jest.resetModules()
  })

  test('WX_SECRET（.env.example 主名）能填到 weixin.appSecret', () => {
    expect(loadConfig({ WX_SECRET: 'from-wx-secret' }).weixin.appSecret).toBe('from-wx-secret')
  })

  test('WX_APPSECRET 旧名仍兼容，但 WX_SECRET 优先', () => {
    expect(loadConfig({ WX_APPSECRET: 'legacy' }).weixin.appSecret).toBe('legacy')
    const c = loadConfig({ WX_SECRET: 'primary', WX_APPSECRET: 'legacy' })
    expect(c.weixin.appSecret).toBe('primary')
  })

  test('WXPAY_API_KEY 与旧名 WX_PAY_KEY 都能填到 wxpay.apiKey', () => {
    // apiKey 为空 → /order/callback 直接 503，付费链路整条断掉
    expect(loadConfig({ WXPAY_API_KEY: 'k1' }).wxpay.apiKey).toBe('k1')
    expect(loadConfig({ WX_PAY_KEY: 'k2' }).wxpay.apiKey).toBe('k2')
  })

  test('WXPAY_MCHID / WXPAY_NOTIFY_URL 接线正确', () => {
    const c = loadConfig({ WXPAY_MCHID: 'm1', WXPAY_NOTIFY_URL: 'https://x/cb' })
    expect(c.wxpay.mchId).toBe('m1')
    expect(c.wxpay.notifyUrl).toBe('https://x/cb')
  })

  test('OPENAI_BASE_URL / OPENAI_MODEL 可覆盖（换自建 AI 网关用）', () => {
    const c = loadConfig({ OPENAI_BASE_URL: 'https://gw.internal/v1', OPENAI_MODEL: 'gpt-4o-mini' })
    expect(c.ai.openai.baseUrl).toBe('https://gw.internal/v1')
    expect(c.ai.openai.model).toBe('gpt-4o-mini')
  })

  test('未配置时 AI 回落到 OpenAI 官方端点与默认模型', () => {
    const c = loadConfig()
    expect(c.ai.openai.baseUrl).toBe('https://api.openai.com/v1')
    expect(c.ai.openai.model).toBe('gpt-4')
  })

  test('JWT_EXPIRES_IN 可覆盖，缺省 7d', () => {
    expect(loadConfig({ JWT_EXPIRES_IN: '30d' }).jwt.expiresIn).toBe('30d')
    expect(loadConfig().jwt.expiresIn).toBe('7d')
  })
})
