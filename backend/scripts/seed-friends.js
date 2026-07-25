// scripts/seed-friends.js - 批量造熟人测试账号(灰度内测用)
//
// 用途:为熟人 50 人内测一次性生成一批 JWT + 全 SKU 开通账号。
//       不走微信支付(熟人测试不收钱),走 entitlementRegistry 内存 + Mongo 双写。
//
// 用法:
//   node scripts/seed-friends.js --count=10 --prefix=f --days=30
//   node scripts/seed-friends.js --count=10 --json --out=seed.json
//   node scripts/seed-friends.js --reset
//
// 输出(默认):每人 4 行中文格式,直接复制
// 输出(--json):JSON 数组,含 token + userId + openid + vipExpireAt + orders
//
// 幂等:同 prefix 重跑会跳过已有 openid,只补缺失的;--reset 清空所有 prefix-* 用户。

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Order = require('../models/Order')
const config = require('../config')
const { getProduct } = require('../config/products')
const reg = require('../utils/entitlementRegistry')

const PAID_SKUS = ['deep_report', 'four_school', 'dayun_segment', 'dayun_full']

function parseArgs(argv) {
  const args = { count: 5, prefix: 'f', days: 30, json: false, out: null, reset: false }
  for (const a of argv.slice(2)) {
    if (a.startsWith('--count=')) args.count = parseInt(a.slice(8), 10)
    else if (a.startsWith('--prefix=')) args.prefix = a.slice(9)
    else if (a.startsWith('--days=')) args.days = parseInt(a.slice(7), 10)
    else if (a === '--json') args.json = true
    else if (a.startsWith('--out=')) args.out = a.slice(6)
    else if (a === '--reset') args.reset = true
  }
  if (args.count < 1 || args.count > 100) throw new Error('--count 须 1-100')
  if (!/^[a-z0-9]+$/i.test(args.prefix)) throw new Error('--prefix 仅允许字母数字')
  return args
}

async function connect() {
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/bazi'
  await mongoose.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 3000
  })
}

async function seedOne(i, prefix, days) {
  const openid = `${prefix}-openid-${i}`
  let user = await User.findOne({ openid })
  if (!user) {
    user = await User.create({ openid, nickName: `熟人${i}`, vipLevel: 0 })
  }
  const userId = user._id.toString()

  const orders = {}
  for (const productType of PAID_SKUS) {
    const prod = getProduct(productType)
    await Order.deleteMany({ userId: user._id, productType })
    const o = await Order.create({
      userId: user._id,
      productType,
      amount: prod.amount,
      status: 'paid',
      paidAt: new Date()
    })
    await reg.registerOrderPaid(userId, productType)
    orders[productType] = o._id.toString()
  }

  const ms = days * 24 * 3600 * 1000
  await reg.grantVip(userId, ms)
  const vipExpireAt = new Date(Date.now() + ms).toISOString()

  const token = jwt.sign(
    { userId, openid: user.openid },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  )

  return { i, userId, openid, token, vipExpireAt, orders }
}

function fmtText(accounts) {
  const lines = []
  lines.push(`已生成 ${accounts.length} 个熟人账号(均开 VIP ${accounts[0].vipExpireAt.slice(0, 10)} 到期):`)
  for (const a of accounts) {
    lines.push('')
    lines.push(`── ${a.openid} ──`)
    lines.push(`  userId:      ${a.userId}`)
    lines.push(`  token:       ${a.token}`)
    lines.push(`  vipExpireAt: ${a.vipExpireAt}`)
    lines.push(`  orders:      deep=${a.orders.deep_report.slice(-6)} four=${a.orders.four_school.slice(-6)} dayun_seg=${a.orders.dayun_segment.slice(-6)} dayun_full=${a.orders.dayun_full.slice(-6)}`)
  }
  return lines.join('\n')
}

async function reset(prefix) {
  const re = new RegExp(`^${prefix}-openid-`)
  const users = await User.find({ openid: re })
  const userIds = users.map(u => u._id)
  const delOrders = await Order.deleteMany({ userId: { $in: userIds } })
  const delUsers = await User.deleteMany({ _id: { $in: userIds } })
  reg._reset()
  return { deletedUsers: delUsers.deletedCount, deletedOrders: delOrders.deletedCount }
}

async function main() {
  const args = parseArgs(process.argv)
  await connect()

  if (args.reset) {
    const r = await reset(args.prefix)
    console.log(`[reset prefix=${args.prefix}] users=${r.deletedUsers}, orders=${r.deletedOrders}`)
    await mongoose.disconnect()
    return
  }

  const accounts = []
  for (let i = 1; i <= args.count; i++) {
    accounts.push(await seedOne(i, args.prefix, args.days))
  }

  if (args.json) {
    const payload = { count: accounts.length, prefix: args.prefix, days: args.days, generatedAt: new Date().toISOString(), accounts }
    const text = JSON.stringify(payload, null, 2)
    if (args.out) {
      const outPath = path.isAbsolute(args.out) ? args.out : path.join(process.cwd(), args.out)
      fs.writeFileSync(outPath, text, 'utf8')
      console.error(`[seed] JSON 已写到 ${outPath}`)
    } else {
      console.log(text)
    }
  } else {
    console.log(fmtText(accounts))
  }

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('[seed] 失败:', err.message)
  process.exit(1)
})