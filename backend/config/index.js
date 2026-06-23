// config/index.js - 配置文件
//
// 安全：JWT 密钥不允许使用弱默认值。生产环境必须通过环境变量注入强密钥，
// 否则启动期直接抛错（fail-fast），杜绝带着默认密钥上线。
const WEAK_JWT_DEFAULTS = ['bazi-jwt-secret-key', 'bazi-jwt-secret-key-change-in-production']

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  if (!secret || WEAK_JWT_DEFAULTS.includes(secret) || secret.length < 32) {
    if (isProd) {
      throw new Error('[安全] JWT_SECRET 缺失或过弱，生产环境拒绝启动。请用 crypto.randomBytes(48).toString("base64") 生成并注入。')
    }
    // 开发环境仅告警，便于本地调试
    console.warn('[安全警告] JWT_SECRET 缺失或过弱，仅限本地开发使用，切勿上线。')
  }
  return secret || 'dev-only-insecure-secret'
}

module.exports = {
  // 服务器配置
  // 默认 8080：Windows 常把 3000(2980-3079 段)预留导致 EACCES，故避开
  port: process.env.PORT || 8080,

  // MongoDB配置
  mongodb: {
    url: process.env.MONGODB_URL || 'mongodb://localhost:27017/bazi',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true
    }
  },

  // Redis配置
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: process.env.REDIS_DB || 0
  },

  // JWT配置
  jwt: {
    secret: resolveJwtSecret(),
    expiresIn: '7d'  // 7天过期
  },

  // 微信小程序配置
  weixin: {
    appId: process.env.WX_APPID || '',
    appSecret: process.env.WX_APPSECRET || ''
  },

  // 微信支付（商户）配置
  // apiKey 为 v2 API 密钥，用于支付回调验签；未配置时 /callback 会安全拒绝。
  wxpay: {
    mchId: process.env.WXPAY_MCHID || '',
    apiKey: process.env.WXPAY_API_KEY || '',
    notifyUrl: process.env.WXPAY_NOTIFY_URL || ''
  },

  // AI配置
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4'
    },
    wenxin: {
      apiKey: process.env.WENXIN_API_KEY || '',
      secretKey: process.env.WENXIN_SECRET_KEY || ''
    }
  }
}
