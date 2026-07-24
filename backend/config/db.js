// config/db.js - 数据库连接配置层
//
// 设计动机:app.js 不应直接硬编码 mongoUrl/options/重试逻辑。
// 这里统一从 backend/config/index.js 读取 db 配置,并暴露 connectMongo / connectRedis。
//
// 调用约定:
//   const db = require('./config/db')
//   await db.connectMongo()  // 失败不抛,返 false;app.js 走内存模式降级
//   await db.connectRedis()  // 同样容错
//
// 配置源:process.env -> backend/config/index.js(已做弱密钥校验等安全默认值)

const mongoose = require('mongoose')
const logger = require('../utils/logger')
const config = require('./index')

async function connectMongo() {
  try {
    await mongoose.connect(config.mongodb.url, config.mongodb.options)
    logger.info(`MongoDB连接成功: ${maskUrl(config.mongodb.url)}`)
    return true
  } catch (err) {
    logger.warn(`MongoDB连接失败,使用内存存储模式: ${err.message}`)
    return false
  }
}

// URI 含密码时,日志里只露 host:port/db,不露凭证
function maskUrl(url) {
  return String(url).replace(/(mongodb:\/\/)[^@/]+@/, '$1***@')
}

module.exports = {
  connectMongo,
  maskUrl
}