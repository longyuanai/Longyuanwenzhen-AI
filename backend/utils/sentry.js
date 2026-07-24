// utils/sentry.js - Sentry 监控包装器
// 设计原则:DSN 未配置时所有上报走 console.warn,不动 Sentry SDK(避免无 DSN 时 SDK 报错);
// 钩子点:captureException(err, ctx?)、process.on('unhandledRejection' / 'uncaughtException')、
// Koa 错误中间件。生产环境建议配 SENTRY_DSN + SENTRY_TRACES_SAMPLE_RATE,否则仅写日志。
const Sentry = require('@sentry/node')

let initialized = false
let enabled = false

function init() {
  if (initialized) return enabled
  initialized = true
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    console.warn('[sentry] SENTRY_DSN 未配置,异常将降级到 console.error,生产前必修')
    return false
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
    release: process.env.SENTRY_RELEASE || undefined
  })
  enabled = true
  return true
}

function captureException(err, ctx) {
  if (!init()) {
    const tag = ctx ? ` [${ctx.method} ${ctx.url}]` : ''
    console.error(`[sentry:fallback]${tag}`, err && err.stack ? err.stack : err)
    return
  }
  if (ctx) {
    Sentry.withScope((scope) => {
      scope.setTag('http.method', ctx.method)
      scope.setTag('http.url', ctx.url)
      if (ctx.status) scope.setTag('http.status', String(ctx.status))
      if (ctx.ip) scope.setUser({ ip_address: ctx.ip })
      Sentry.captureException(err)
    })
  } else {
    Sentry.captureException(err)
  }
}

function captureMessage(msg, level = 'info') {
  if (!init()) {
    console.error(`[sentry:fallback] ${level}: ${msg}`)
    return
  }
  Sentry.captureMessage(msg, level)
}

function installProcessHandlers() {
  init()
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    captureException(err)
  })
  process.on('uncaughtException', (err) => {
    captureException(err)
  })
}

module.exports = {
  init,
  captureException,
  captureMessage,
  installProcessHandlers
}
