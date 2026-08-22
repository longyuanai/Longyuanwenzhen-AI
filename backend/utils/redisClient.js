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

// 单条命令的兜底超时。Redis 正常时命令是亚毫秒级的，200ms 已经宽裕到
// 不会误伤；真触发了说明 Redis 病了，此时限流降级远好过拖慢请求。
const COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS) || 200

// 给 promise 加超时。注意要清掉定时器：不清的话每个请求都会留一个
// 活跃 timer，把 Node 的事件循环钉住，进程退不出去。
function withTimeout(promise, ms) {
  let timer = null
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('redis command timeout')), ms)
    })
  ]).finally(() => { if (timer) clearTimeout(timer) })
}

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
    const client = createClient({
      url: process.env.REDIS_URL,
      // 关掉离线队列：这是本文件最要紧的一行。
      // node-redis 默认会把客户端未就绪时发出的命令**排队**，等连上了再发。
      // 于是 Redis 挂着时 `await redis.incr()` 的 promise 永不 settle，
      // 外层 try/catch 一辈子等不到 reject —— 限流不是降级成进程内计数，
      // 而是把每一个 /analysis 请求挂死。实测就是这么卡住的。
      // 关掉之后未就绪时命令立即抛错，走下面的 catch 返回 null 降级。
      disableOfflineQueue: true,
      socket: {
        // 不给 connectTimeout 的话，连不上时握手会一直吊着
        connectTimeout: 2000,
        // 有界退避重连：Redis 恢复后要能自动接回共享计数，
        // 所以不能像自检脚本那样直接 false 关掉重连。
        // 但退避必须封顶，否则退避间隔会一路涨到不可用。
        reconnectStrategy: (retries) => Math.min(200 * (retries + 1), 5000)
      }
    })
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
  // 未就绪直接降级，不必等到命令抛错。disableOfflineQueue 已经兜住了，
  // 这层是显式表达意图：限流宁可算不准，也不能让请求等 Redis。
  if (!redis.isReady) return null
  try {
    const n = await withTimeout(redis.incr(key), COMMAND_TIMEOUT_MS)
    if (n === 1) {
      // 过期设置失败不影响本次判定，但别让它把整个调用拖进 catch
      await withTimeout(redis.expire(key, Math.ceil(windowMs / 1000)), COMMAND_TIMEOUT_MS)
        .catch(() => {})
    }
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
