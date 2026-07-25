// middleware/access.js - 角色 / 配额 / 防刷中间件
//
// 与 auth.js 协作:access 中间件应在 authRequired 之后挂载,
// 依赖 ctx.state.user = { userId, openid, role } 已填充。
//
// 三个中间件(2026-07-25 新增):
//   - roleRequired(minRole)   角色门槛:user / vip / admin。admin 总通过。
//   - quotaGuard(opts)        按用户配额:Redis 计数,超限 429。
//   - antiBrush(opts)         按 IP 滑窗防刷:超限 429。
//
// 设计原则:
//   - Redis 不可用时自动降级(放行 + warn),不阻断业务
//   - 计数 key 格式 q:<scope>:<id>:<dim> / b:<scope>:<ip>:<dim>,TTL = 窗口长
//   - admin 角色绕过 quota / antiBrush

const { envelope } = require('./envelope')
const { incrInWindow } = require('../utils/redisClient')

const ROLE_RANK = { user: 0, vip: 1, admin: 2 }

function actor(ctx) {
  const u = ctx.state.user || {}
  return { role: u.role || 'user', isAdmin: (u.role || 'user') === 'admin' }
}

/**
 * 角色门槛中间件。`minRole` 传 'user' | 'vip' | 'admin'。
 * 配在 authRequired 之后,无 ctx.state.user 时返 401。
 */
function roleRequired(minRole = 'user') {
  const need = ROLE_RANK[minRole]
  if (typeof need !== 'number') throw new Error(`roleRequired: 未知角色 ${minRole}`)
  return async function (ctx, next) {
    if (!ctx.state.user) {
      ctx.status = 401
      ctx.body = envelope(401, '未授权')
      return
    }
    const { role } = actor(ctx)
    const have = ROLE_RANK[role] ?? 0
    if (have < need) {
      ctx.status = 403
      ctx.body = envelope(403, `需要 ${minRole} 角色`)
      return
    }
    await next()
  }
}

/**
 * 配额中间件:在滑窗内按用户维度限次。
 * @param {object} opts
 * @param {string} opts.dim        维度名(eg 'analysis-deep' / 'analysis-fs')
 * @param {number} opts.max        窗口内最大次数
 * @param {number} [opts.windowMs] 窗口毫秒,默认 86400000 (24h)
 */
function quotaGuard(opts) {
  const { dim, max, windowMs = 86400000 } = opts || {}
  if (!dim || typeof max !== 'number' || max <= 0) {
    throw new Error('quotaGuard: 必须传 dim + max > 0')
  }
  return async function (ctx, next) {
    if (!ctx.state.user) {
      ctx.status = 401
      ctx.body = envelope(401, '未授权')
      return
    }
    const { isAdmin } = actor(ctx)
    if (isAdmin) return next()
    // Redis 不可用 / 读失败 → incrInWindow 返 null → 降级放行，不阻断业务
    const n = await incrInWindow(`q:u:${ctx.state.user.userId}:${dim}`, windowMs)
    if (n !== null && n > max) {
      ctx.status = 429
      ctx.body = envelope(429, `今日 ${dim} 配额已用完(${max}/天)`)
      return
    }
    await next()
  }
}

/**
 * 防刷中间件:按 IP 滑窗,超限 429。
 * @param {object} opts
 * @param {string} opts.dim        维度名(eg 'analysis' / 'order')
 * @param {number} opts.max        窗口内最大次数
 * @param {number} [opts.windowMs] 窗口毫秒,默认 60000 (1min)
 */
function antiBrush(opts) {
  const { dim, max, windowMs = 60000 } = opts || {}
  if (!dim || typeof max !== 'number' || max <= 0) {
    throw new Error('antiBrush: 必须传 dim + max > 0')
  }
  return async function (ctx, next) {
    const ip = ctx.request.ip || ctx.ip || 'unknown'
    // Redis 不可用 / 读失败 → 降级放行
    const n = await incrInWindow(`b:ip:${ip}:${dim}`, windowMs)
    if (n !== null && n > max) {
      ctx.status = 429
      ctx.body = envelope(429, `操作过于频繁,请 ${Math.ceil(windowMs / 1000)}s 后再试`)
      return
    }
    await next()
  }
}

module.exports = { roleRequired, quotaGuard, antiBrush }