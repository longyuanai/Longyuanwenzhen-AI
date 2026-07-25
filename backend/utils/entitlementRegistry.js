// utils/entitlementRegistry.js - 付费权益 in-memory 兜底注册表
//
// 设计动机(P1 #31):
//   backend/app.js 在 Mongo 连不上时降级到「内存存储模式」,但 hasDeepEntitlement /
//   hasFourSchoolEntitlement 直接 Order.exists() / User.findById(),导致无 Mongo
//   演示永远 403。本模块作为权益检查的兜底层:
//     - 有 Mongo:走 Mongo(权威);in-memory 作为 dev/test 注入
//     - 无 Mongo:只走 in-memory
//     - grantVip / registerOrderPaid 同时写两边,Mongo 失败不抛错(降级优先)
//
// 使用:
//   const reg = require('./entitlementRegistry')
//   await reg.registerOrderPaid(userId, 'four_school')
//   await reg.grantVip(userId, 30 * 24 * 3600 * 1000)
//   const ok = await reg.hasOrderPaid(userId, 'four_school')
//   const vip = await reg.hasValidVip(userId)

const Order = require('../models/Order')
const User = require('../models/User')

// Mongo 查询结果的缓存存活时间。此前命中即永久缓存 true，退款/撤单/管理员
// 撤销权益后进程内永远查不回来（只能重启）。有 Mongo 时缓存只作为降低查询
// 频率的短期视图，过期后重新回源；无 Mongo 时才是唯一权益来源。
const MONGO_CACHE_TTL_MS = Number(process.env.ENTITLEMENT_CACHE_TTL_MS) || 60000

// userId(string) -> { productType: expiresAt(number) | Infinity }
// Infinity 表示由 registerOrderPaid 直接注入（无 Mongo 兜底/dev-seed），不过期
const paidOrders = new Map()
// userId(string) -> Date (到期时间)
const vipExpireAt = new Map()

function hasMongo() {
  // mongoose.readyState: 0=disconnected 1=connected 2=connecting 3=disconnecting
  return require('mongoose').connection.readyState === 1
}

function cachedPaid(userId, productType) {
  const entry = paidOrders.get(userId)
  if (!entry) return false
  const exp = entry[productType]
  if (exp === undefined) return false
  if (exp !== Infinity && exp <= Date.now()) {
    delete entry[productType]
    return false
  }
  return true
}

function cachePaid(userId, productType, expiresAt) {
  const m = paidOrders.get(userId) || {}
  m[productType] = expiresAt
  paidOrders.set(userId, m)
}

async function hasOrderPaid(userId, productType) {
  if (cachedPaid(userId, productType)) return true
  if (!hasMongo()) return false
  try {
    const hit = await Order.exists({ userId, productType, status: 'paid' })
    if (hit) {
      cachePaid(userId, productType, Date.now() + MONGO_CACHE_TTL_MS)
      return true
    }
    return false
  } catch {
    return false
  }
}

async function hasValidVip(userId) {
  const memExpiry = vipExpireAt.get(userId)
  if (memExpiry && memExpiry > new Date()) return true
  if (!hasMongo()) return false
  try {
    const user = await User.findById(userId).select('vipLevel vipExpireAt')
    if (!user || !user.vipLevel) return false
    if (user.vipExpireAt && user.vipExpireAt > new Date()) {
      vipExpireAt.set(userId, user.vipExpireAt)
      return true
    }
    return false
  } catch {
    return false
  }
}

async function registerOrderPaid(userId, productType) {
  // 直接注入的权益不设过期：无 Mongo 兜底模式下这是唯一来源，过期就没了。
  cachePaid(String(userId), productType, Infinity)
  // 真实场景:Order.status = 'paid' 已由 routes/order.js 回调里写,Mongo 这里不动
}

// 撤销某用户某档权益的内存缓存（退款 / 管理员撤销后调用，让下次查询回源 Mongo）
function revokeOrderPaid(userId, productType) {
  const entry = paidOrders.get(String(userId))
  if (entry) delete entry[productType]
}

// grantVip: 给 userId 续期 VIP(days 毫秒数)
async function grantVip(userId, ms) {
  const now = new Date()
  const current = vipExpireAt.get(userId)
  const base = current && current > now ? current : now
  const next = new Date(base.getTime() + ms)
  vipExpireAt.set(userId, next)
  if (!hasMongo()) return
  try {
    const user = await User.findById(userId)
    if (user) {
      user.vipLevel = Math.max(user.vipLevel, 1)
      user.vipExpireAt = next
      await user.save()
    }
  } catch (err) {
    // Mongo 写失败不抛,内存已生效,降级模式仍可用
  }
}

// 测试 / dev-seed 用:清空注册表
function _reset() {
  paidOrders.clear()
  vipExpireAt.clear()
}

module.exports = {
  hasOrderPaid,
  hasValidVip,
  registerOrderPaid,
  revokeOrderPaid,
  grantVip,
  _reset
}