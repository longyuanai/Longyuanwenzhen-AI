// app.js - 后端服务入口
require('dotenv').config()
const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const mongoose = require('mongoose')
const logger = require('./utils/logger')
const sentry = require('./utils/sentry')
const { corsAllow, analysisRateLimit } = require('./middleware/security')

sentry.installProcessHandlers()

// 创建Koa应用
const app = new Koa()
const router = new Router()

// 中间件配置
// CORS 白名单（读 .env ALLOWED_ORIGINS），生产 fail-closed；开发兜底放行
app.use(
  corsAllow({
    origins: process.env.ALLOWED_ORIGINS,
    isProd: process.env.NODE_ENV === 'production'
  })
)

app.use(bodyParser({
  jsonLimit: '10mb',
  formLimit: '10mb'
}))

// AI 类接口限流：60 req/min per IP（可被 RATE_LIMIT_DISABLED=1 关掉做压测）
if (process.env.RATE_LIMIT_DISABLED !== '1') {
  app.use(analysisRateLimit())
}

// 错误处理中间件
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    logger.error('请求错误:', err)
    sentry.captureException(err, ctx)
    ctx.status = err.status || 500
    ctx.body = {
      code: ctx.status,
      message: err.message || '服务器内部错误',
      data: null,
      timestamp: Date.now()
    }
  }
})

// 响应时间中间件
app.use(async (ctx, next) => {
  const start = Date.now()
  await next()
  const ms = Date.now() - start
  ctx.set('X-Response-Time', `${ms}ms`)
  logger.info(`${ctx.method} ${ctx.url} - ${ms}ms`)
})

// 路由配置
const userRoutes = require('./routes/user')
const baziRoutes = require('./routes/bazi')
const analysisRoutes = require('./routes/analysis')
const orderRoutes = require('./routes/order')
const healthRoutes = require('./routes/health')

router.use('/api/v1/user', userRoutes.routes(), userRoutes.allowedMethods())
router.use('/api/v1/bazi', baziRoutes.routes(), baziRoutes.allowedMethods())
router.use('/api/v1/analysis', analysisRoutes.routes(), analysisRoutes.allowedMethods())
router.use('/api/v1/order', orderRoutes.routes(), orderRoutes.allowedMethods())

// /health（顶级,不挂 /api/v1 前缀；保持向后兼容）
router.use('', healthRoutes.routes(), healthRoutes.allowedMethods())

app.use(router.routes()).use(router.allowedMethods())

// 数据库连接
const connectDB = async () => {
  try {
    const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/bazi'
    await mongoose.connect(mongoUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    logger.info('MongoDB连接成功')
    return true
  } catch (err) {
    logger.warn('MongoDB连接失败，使用内存存储模式:', err.message)
    return false
  }
}

// 启动服务器
const PORT = process.env.PORT || 8080

const startServer = () => {
  // 先监听、数据库后台异步连接：连不上自动降级内存模式，不阻塞启动（避免等 MongoDB 超时）
  app.listen(PORT, () => {
    logger.info(`服务器启动成功，端口: ${PORT}`)
    logger.info(`访问地址: http://localhost:${PORT}`)
    logger.info(`健康检查: http://localhost:${PORT}/health`)
  })

  connectDB().then((dbConnected) => {
    logger.info(dbConnected ? '运行模式: MongoDB数据库' : '运行模式: 内存存储（无需数据库）')
  })
}

startServer()

module.exports = app
