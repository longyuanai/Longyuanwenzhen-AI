// utils/redisClient.js - Redis 客户端单例（懒加载 + 容错）
//
// 背景：access.js、knowledgeRetriever.js、security.js 各自复制了一份
// 一模一样的懒加载 getRedis()，三份连接、三份错误处理。抽到这里共用。
//
// 约定（保持原有降级语义，调用方无需改写容错逻辑）：
//   - 未配 REDIS_URL / redis 包不可用 → 返回 null，调用方走本地降级
//   - 连接错误全部吞掉，不污染业务日志、不阻断请求
//   - 连接是懒建的：首次调用才连，未用到 Redis 的部署不会平白建连接

let _client = null
let _tried = false

/**
 * 取共享 Redis 客户端。
 * @returns {object|null} node-redis 客户端；不可用时返回 null
 */
function getRedis() {
  if (_tried) return _client
  _tried = true
  if (!process.env.REDIS_URL) return null
  try {
    const { createClient } = require('redis')
    const client = createClient({ url: process.env.REDIS_URL })
    client.on('error', () => {}) // 吞错，容错交给各调用点
    client.connect().catch(() => {})
    _client = client
    return client
  } catch {
    return null
  }
}

/**
 * 滑窗计数：对 key 自增，首次自增时设置过期。
 * 返回当前窗口内计数；Redis 不可用或出错时返回 null，调用方据此降级。
 *
 * @param {string} key
 * @param {number} windowMs 窗口毫秒
 * @returns {Promise<number|null>}
 */
async function incrInWindow(key, windowMs) {
  const redis = getRedis()
  if (!redis) return null
  try {
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, Math.ceil(windowMs / 1000))
    return n
  } catch {
    return null
  }
}

// 测试用：重置单例，让下个用例能重新走懒加载分支
function _reset() {
  _client = null
  _tried = false
}

module.exports = { getRedis, incrInWindow, _reset }
