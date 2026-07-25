// utils/knowledgeRetriever.js - 命理古籍知识检索（接 LightRAG HTTP 服务）
//
// 架构：
//   Node.js 后端 → /utils/knowledgeRetriever.js → HTTP → LightRAG 服务（独立 Python 进程）
//                                                      ↑
//                                       bazi-skill-dist/lightrag/merged.json（灌库）
//
// 关键约束：
//   1. LightRAG 服务挂了 / 启不来 / 网络不通 → 优雅降级（返回空数组）
//      产品解读功能不能因为知识库不可用就挂掉。
//   2. 检索超时硬性限制（默认 3 秒）——AI 解读整体延迟敏感，知识检索不能拖后腿。
//   3. 查询语句构造：用 mingju 的关键字段拼成"自然语言查询"，不传原始 JSON。
//
// 配置（环境变量）：
//   LIGHTRAG_URL      LightRAG 服务地址（默认 http://127.0.0.1:9621）
//   LIGHTRAG_TIMEOUT  超时毫秒（默认 3000）
//   LIGHTRAG_TOPK     检索返回条数（默认 5）

const axios = require('axios')
const crypto = require('crypto')

const DEFAULTS = {
  url: process.env.LIGHTRAG_URL || 'http://127.0.0.1:9621',
  timeout: Number(process.env.LIGHTRAG_TIMEOUT) || 3000,
  topK: Number(process.env.LIGHTRAG_TOPK) || 5,
  cacheTtlSec: Number(process.env.LIGHTRAG_CACHE_TTL) || 300
}

// Redis 缓存层：REDIS_URL 未配置 / redis 包不可用时 getRedis() 返 null，
// 缓存整体跳过，原 HTTP 逻辑不受影响；读写失败也不抛错（继续走 HTTP）。
const { getRedis } = require('./redisClient')

function cacheKey(query, topK) {
  const h = crypto.createHash('sha1').update(`${query}|${topK}`).digest('hex')
  return `lrag:${h}`
}

/**
 * 把 analyzeMingju() 返回对象转成自然语言查询。
 * 字段顺序：日主 → 身强弱 → 喜忌 → 格局 → 调候。
 * @param {object} mingju
 * @returns {string}
 */
function buildQuery(mingju) {
  const { dayMaster, strength, yongShen, geju } = mingju
  const xi = yongShen.xiShen.join('、') || '无'
  const ji = yongShen.jiShen.join('、') || '无'
  const th = yongShen.tiaoHou
  const tiao = th.need.length
    ? `${th.season}月调候喜${th.need.join('')}${th.urgent ? '（急用）' : ''}`
    : '无显著调候需求'
  return [
    `${dayMaster.gan}${dayMaster.element}日主`,
    `身${strength.label}`,
    `喜用神为${xi}`,
    `忌神为${ji}`,
    `${geju.name}`,
    tiao
  ].join('，')
}

/**
 * 调 LightRAG 服务做语义检索。
 * 失败/超时一律返回空数组（不抛错），调用方据此决定是否注入知识区块。
 *
 * @param {object} mingju analyzeMingju() 返回对象
 * @param {object} [opts]
 * @param {string} [opts.url]        LightRAG 服务地址
 * @param {number} [opts.timeout]    超时毫秒
 * @param {number} [opts.topK]       返回条数
 * @returns {Promise<Array<{content:string, source?:string, score?:number}>>}
 */
async function retrieve(mingju, opts = {}) {
  if (!mingju || !mingju.dayMaster) {
    // 调用方传错参数，直接降级
    return []
  }

  const { url, timeout, topK, cacheTtlSec } = { ...DEFAULTS, ...opts }
  // 透传 opts.query:四家并列解读需要各家用自己的「侧重查询语」
  // (徐乐吾/梁湘润/袁树珊/韦千里各家焦点不同),否则 4 家检索
  // 同一 query → 完全重复的 refs,四家差异化卖点消失。
  // 未传 opts.query 时,回落到 buildQuery(mingju) 默认拼装。
  const query = (typeof opts.query === 'string' && opts.query.length > 0)
    ? opts.query
    : buildQuery(mingju)

  // Redis 缓存命中:跳过 HTTP(无 Redis / 命中失败 → 继续走 HTTP)
  const redis = getRedis()
  const key = cacheKey(query, topK)
  if (redis) {
    try {
      const cached = await redis.get(key)
      if (cached) {
        try {
          return JSON.parse(cached)
        } catch {
          // 损坏缓存,当作未命中
        }
      }
    } catch {
      // Redis 读失败,继续走 HTTP
    }
  }

  try {
    // LightRAG 默认 /query 端点：POST { query, mode, top_k, ... }
    // mode: 'mix' 综合向量+图谱检索；'local' 仅本地实体；'global' 仅全局关系
    // 这里用 'mix'，对单盘解读通常最准。
    const resp = await axios.post(
      `${url}/query`,
      { query, mode: 'mix', top_k: topK },
      { timeout, validateStatus: s => s >= 200 && s < 500 }
    )

    let result = []
    if (resp.status !== 200 || !resp.data) {
      result = []
    } else {
      // LightRAG 返回结构：{ response: '...', references?: [{content, file_path, ...}] }
      // 我们用 references 数组（如有）；否则把 response 整体作为一条 content。
      const refs = Array.isArray(resp.data.references) ? resp.data.references : null
      if (refs && refs.length) {
        result = refs.slice(0, topK).map(r => ({
          content: r.content || r.text || '',
          source: r.file_path || r.source || undefined,
          score: typeof r.score === 'number' ? r.score : undefined
        }))
      } else if (resp.data.response) {
        result = [{ content: resp.data.response, source: 'LightRAG' }]
      } else {
        result = []
      }
    }

    // 写缓存(成功 + 非空结果 → 缓存 5min;空结果不缓存避免 LightRAG 恢复期脏读)
    if (redis && result.length > 0) {
      try {
        await redis.set(key, JSON.stringify(result), { EX: cacheTtlSec })
      } catch {
        // 写失败不影响返回
      }
    }

    return result
  } catch (err) {
    // 网络错/超时/服务挂——按约定降级，不抛
    // 调用方如果想知道降级原因，可读 module 暴露的 lastError
    module.exports.lastError = err.message || String(err)
    return []
  }
}

/**
 * 健康检查：探测 LightRAG 服务是否在跑。
 * 用于 /api/health 端点或运维脚本。
 */
async function healthCheck(opts = {}) {
  const { url, timeout } = { ...DEFAULTS, ...opts }
  try {
    const resp = await axios.get(`${url}/health`, { timeout: Math.min(timeout, 1500) })
    return resp.status === 200
  } catch {
    return false
  }
}

module.exports = {
  retrieve,
  buildQuery,
  healthCheck,
  lastError: null
}