// app.js - 后端服务入口
require('dotenv').config()
const Koa = require('koa')
const Router = require('koa-router')
const bodyParser = require('koa-bodyparser')
const cors = require('koa-cors')
const mongoose = require('mongoose')
const logger = require('./utils/logger')

// 创建Koa应用
const app = new Koa()
const router = new Router()

// 中间件配置
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  headers: ['Content-Type', 'Authorization']
}))

app.use(bodyParser({
  jsonLimit: '10mb',
  formLimit: '10mb'
}))

// 错误处理中间件
app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    logger.error('请求错误:', err)
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

router.use('/api/v1/user', userRoutes.routes(), userRoutes.allowedMethods())
router.use('/api/v1/bazi', baziRoutes.routes(), baziRoutes.allowedMethods())
router.use('/api/v1/analysis', analysisRoutes.routes(), analysisRoutes.allowedMethods())
router.use('/api/v1/order', orderRoutes.routes(), orderRoutes.allowedMethods())

// 健康检查
router.get('/health', (ctx) => {
  ctx.body = {
    code: 200,
    message: 'success',
    data: { status: 'healthy', timestamp: Date.now() },
    timestamp: Date.now()
  }
})

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
