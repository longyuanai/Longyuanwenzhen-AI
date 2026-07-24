// scripts/dev-seed-test-user.js - 联调自签 JWT + 注入 VIP/已支付订单
//
// 用途：跳过 wx-login(需要真 appId + 微信接口),用 .env 里的 JWT_SECRET
//       直接签发一个能调 /four-school 的 Bearer token。
//
// 副作用：在 dev 本地 Mongo(bazi DB)插一条 user + 一条 paid four_school order。
//        测试结束后调用 scripts/dev-cleanup-test-user.js 清理。
//
// 用法：node scripts/dev-seed-test-user.js

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const Order = require('../models/Order')
const config = require('../config')
const { getProduct } = require('../config/products')

async function main() {
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/bazi'
  await mongoose.connect(mongoUrl, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })

  // 用一个固定 openid 让脚本幂等（重复跑会更新同一条 user）
  const TEST_OPENID = 'dev-openid-four-school'

  // 找或建 user,顺手开 VIP 一年
  let user = await User.findOne({ openid: TEST_OPENID })
  if (!user) {
    user = await User.create({
      openid: TEST_OPENID,
      nickName: '联调测试用户',
      vipLevel: 0   // 先 0,优先走"付费 order"分支,这样后面能改测试"VIP-only"分支
    })
    console.log('[seed] 新建 user:', user._id.toString())
  } else {
    console.log('[seed] 已有 user:', user._id.toString())
  }

  // 插一条 paid four_school 订单（幂等：同一 (userId, productType) 只留一条）
  const prod = getProduct('four_school')
  await Order.deleteMany({ userId: user._id, productType: 'four_school' })
  const order = await Order.create({
    userId: user._id,
    productType: 'four_school',
    amount: prod.amount,
    status: 'paid',
    paidAt: new Date()
  })
  console.log('[seed] 新建 paid order:', order._id.toString(), 'amount=', order.amount)

  // 签 JWT（7d 与 config.jwt.expiresIn 一致）
  const token = jwt.sign(
    { userId: user._id.toString(), openid: user.openid },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  )

  console.log('')
  console.log('═══════════════════════════════════════════')
  console.log('  联调用 Bearer Token（7 天内有效）：')
  console.log('')
  console.log(token)
  console.log('')
  console.log('  userId:', user._id.toString())
  console.log('═══════════════════════════════════════════')

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('[seed] 失败:', err)
  process.exit(1)
})
