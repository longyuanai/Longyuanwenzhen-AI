// utils/logger.js - 日志工具
const log4js = require('log4js')

log4js.configure({
  appenders: {
    console: {
      type: 'console'
    },
    file: {
      type: 'file',
      filename: 'logs/app.log',
      maxLogSize: 10485760,  // 10MB
      backups: 3,
      compress: true
    },
    errorFile: {
      type: 'file',
      filename: 'logs/error.log',
      maxLogSize: 10485760,
      backups: 3,
      compress: true
    }
  },
  categories: {
    default: {
      appenders: ['console', 'file'],
      level: 'info'
    },
    error: {
      appenders: ['console', 'errorFile'],
      level: 'error'
    }
  }
})

const logger = log4js.getLogger()
const errorLogger = log4js.getLogger('error')

module.exports = {
  info: (...args) => logger.info(...args),
  debug: (...args) => logger.debug(...args),
  warn: (...args) => logger.warn(...args),
  error: (...args) => errorLogger.error(...args),
  trace: (...args) => logger.trace(...args)
}
