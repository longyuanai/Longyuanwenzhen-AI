// middleware/security.js - CORS 白名单 + 简易 in-memory 滑窗限流
//
// 背景：app.js 之前直接 cors({ origin: '*' })，生产部署到公网域名时任何网站
// 都能调我们的 AI 类接口（/analysis/*）刷量、调 OpenAI 烧 token。两件事：
//   1. corsAllow：读 .env 的 ALLOWED_ORIGINS（逗号分隔），匹配则回显该 origin
//      头；不匹配且 dev 环境才放行（origin: '*'），prod 环境拒绝。
//   2. rateLimit(windowMs, max)：简易滑窗，按 IP 计数；超限返 429 统一信封。
//      默认对 /api/v1/analysis/* 应用 60 req/min（保护 AI gateway）。
//
// 注意：in-memory 限流在多实例下不精确（每实例各自计数），但比无好；生产化
// 时换 Redis（依赖已在 package.json）即可，函数签名保持不变。
// utils/logger 直接导出 { info, debug, warn, error, trace }，不要解构出 logger 键
// （曾误写成 const { logger } = ...，prod 白名单为空时 logger.warn 抛 TypeError → 500）
const logger = require('../utils/logger')

function parseList(raw) {
  if (!raw) return []
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// 允许 origin 的判定：'*' 全放；否则只放白名单；缺省行为由 isProd 控制
function corsAllow(options = {}) {
  const allowed = parseList(options.origins)
  const isProd = options.isProd || false
  // 缺省白名单为空 + prod → 拒绝所有跨域（fail-closed）
  const wildcard = allowed.length === 1 && allowed[0] === '*'

  return async function cors(ctx, next) {
    const origin = ctx.headers.origin
    if (wildcard) {
      ctx.set('Access-Control-Allow-Origin', '*')
    } else if (origin && allowed.includes(origin)) {
      ctx.set('Access-Control-Allow-Origin', origin)
      ctx.set('Vary', 'Origin')
      ctx.set('Access-Control-Allow-Credentials', 'true')
    } else if (!isProd && origin) {
      // 开发环境：白名单没配时全放，不阻断本地调试
      ctx.set('Access-Control-Allow-Origin', origin)
      ctx.set('Vary', 'Origin')
    } else if (isProd && origin && allowed.length === 0) {
      // 生产白名单为空 + 跨域请求 → 不写 ACAO 头，浏览器会拦
      logger.warn(`[cors] prod 拒绝未授权 origin: ${origin}`)
    }
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    ctx.set(
      'Access-Control-Allow-Headers',
      ctx.headers['access-control-request-headers'] || 'Content-Type, Authorization'
    )
    if (ctx.method === 'OPTIONS') {
      ctx.status = 204
      return
    }
    await next()
  }
}

// 滑窗：按 (ip, route) 维度计数；超限返 429
//   - windowMs: 窗口毫秒
//   - max: 窗口内最大请求数
//   - keyFn(ctx): 自定义计数 key（默认 IP）
function rateLimit({ windowMs = 60_000, max = 60, keyFn } = {}) {
  const buckets = new Map() // key -> { count, resetAt }
  const getKey = keyFn || ((ctx) => ctx.ip || ctx.request.ip || 'unknown')

  // 定期清理过期桶，避免 Map 无限增长
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k)
    }
  }, windowMs)
  // 不阻止进程退出
  if (sweep.unref) sweep.unref()

  return async function limiter(ctx, next) {
    const key = getKey(ctx)
    const now = Date.now()
    let b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs }
      buckets.set(key, b)
    }
    b.count += 1
    if (b.count > max) {
      const retry = Math.max(1, Math.ceil((b.resetAt - now) / 1000))
      ctx.status = 429
      ctx.set('Retry-After', String(retry))
      ctx.body = {
        code: 429,
        message: `请求过于频繁，请 ${retry} 秒后再试`,
        data: null,
        timestamp: now
      }
      return
    }
    await next()
  }
}

// 预制：AI 类接口限流 60 req/min per IP
const analysisRateLimit = () => rateLimit({ windowMs: 60_000, max: 60 })

module.exports = { corsAllow, rateLimit, analysisRateLimit }
