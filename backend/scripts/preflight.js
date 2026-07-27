// scripts/preflight.js - 上线/开测前的环境自检
//
// 为什么要有这个：这个项目踩过的坑里，相当一部分不是代码错，而是配置漏改 ——
// 变量名对不上导致微信登录必失败、ALLOWED_ORIGINS 空导致 prod 拒绝所有跨域、
// WXPAY_API_KEY 没配导致支付回调恒 503。这类问题不会让任何测试变红，
// 只会在真机上被熟人发现。
//
// 用法：
//   node scripts/preflight.js              # 按当前 .env 检查
//   NODE_ENV=production node scripts/preflight.js
//   node scripts/preflight.js --skip-net   # 跳过 Mongo/Redis/LightRAG 连通性探测
//
// 退出码：0 = 可以上/可以开测；1 = 有阻断项
//
// 分三级：
//   ERROR  阻断，必须修（生产环境下 fail）
//   WARN   能跑但有风险，或仅适用于内测
//   INFO   提示性信息

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const isProd = process.env.NODE_ENV === 'production'
const skipNet = process.argv.includes('--skip-net')

const results = []
const add = (level, item, msg, fix) => results.push({ level, item, msg, fix })

// ── 1. 安全基线 ───────────────────────────────────────────────────
function checkSecurity() {
  const secret = process.env.JWT_SECRET || ''
  const WEAK = ['bazi-jwt-secret-key', 'bazi-jwt-secret-key-change-in-production']

  if (!secret) {
    add('ERROR', 'JWT_SECRET', '未设置', "生成：node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"")
  } else if (WEAK.includes(secret) || secret.length < 32) {
    add('ERROR', 'JWT_SECRET', `过弱（长度 ${secret.length}，需 ≥32 且非默认值）`,
      "node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"")
  } else {
    add('INFO', 'JWT_SECRET', `已设置（${secret.length} 字符）`)
  }

  const origins = (process.env.ALLOWED_ORIGINS || '').trim()
  if (isProd) {
    if (!origins) {
      add('ERROR', 'ALLOWED_ORIGINS', 'prod 下为空 → 拒绝所有跨域请求（fail-closed）', '填你的前端域名，逗号分隔')
    } else if (origins === '*') {
      add('ERROR', 'ALLOWED_ORIGINS', "prod 下为 '*' → 任何站点都能调你的 AI 接口刷 token", '改成具体域名白名单')
    } else {
      add('INFO', 'ALLOWED_ORIGINS', origins)
    }
  } else {
    add('INFO', 'ALLOWED_ORIGINS', origins || '(空，dev 下自动放行)')
  }

  if (process.env.RATE_LIMIT_DISABLED === '1') {
    add(isProd ? 'ERROR' : 'WARN', 'RATE_LIMIT_DISABLED', '限流已关闭', '压测/联调后记得改回空值')
  }
}

// ── 2. 微信接入 ───────────────────────────────────────────────────
function checkWeixin() {
  const appid = process.env.WX_APPID || ''
  const secret = process.env.WX_SECRET || process.env.WX_APPSECRET || ''

  if (!appid || appid.includes('your_')) {
    add('ERROR', 'WX_APPID', '未配置或仍是占位值 → 微信登录不可用',
      '测试号申请：https://mp.weixin.qq.com/debug/cgi-bin/sandboxinfo')
  } else {
    add('INFO', 'WX_APPID', appid.slice(0, 8) + '***')
  }

  if (!secret || secret.includes('your_')) {
    add('ERROR', 'WX_SECRET', '未配置或仍是占位值 → 微信登录必失败')
  } else if (process.env.WX_APPSECRET && !process.env.WX_SECRET) {
    add('WARN', 'WX_APPSECRET', '用的是旧变量名，建议改用 WX_SECRET（.env.example 的主名）')
  } else {
    add('INFO', 'WX_SECRET', '已设置')
  }
}

// ── 3. 支付 ───────────────────────────────────────────────────────
function checkPay() {
  const key = process.env.WXPAY_API_KEY || process.env.WX_PAY_KEY || ''
  const mch = process.env.WXPAY_MCHID || process.env.WX_PAY_MCHID || ''

  if (!key) {
    // 熟人内测不收钱，这是预期状态；正式收费则是阻断项
    add(isProd ? 'ERROR' : 'INFO', 'WXPAY_API_KEY',
      '未配置 → /order/callback 一律 503 拒绝（不会误判已支付，安全默认）',
      isProd ? '要收费必须配；只做内测可忽略' : '内测不收钱，属预期')
  } else {
    add('INFO', 'WXPAY_API_KEY', '已设置')
    if (!mch) add('WARN', 'WXPAY_MCHID', '配了密钥但没配商户号')
  }
}

// ── 4. AI ─────────────────────────────────────────────────────────
function checkAi() {
  const key = process.env.OPENAI_API_KEY || ''
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL || 'gpt-4'

  if (!key || key.includes('your_')) {
    add('WARN', 'OPENAI_API_KEY', '未配置 → 所有解读走本地降级模板（能跑，但不是 AI 解读）',
      '/checkup 免费体检不需要 AI，其余档需要')
  } else {
    add('INFO', 'OPENAI_API_KEY', '已设置')
  }
  add('INFO', 'AI 端点', `${base} / ${model}`)

  if (model === 'gpt-4') {
    add('WARN', 'OPENAI_MODEL', 'gpt-4 是初代模型，价格偏高',
      '换模型只改 .env；用 npm run preview:en -- --call --compare=... 对比质量与成本')
  }
}

// ── 5. 依赖服务连通性 ─────────────────────────────────────────────
async function checkServices() {
  if (skipNet) {
    add('INFO', '连通性探测', '已跳过（--skip-net）')
    return
  }

  // Mongo：订单接口强依赖，连不上会 503
  const mongoUrl = process.env.MONGODB_URL || 'mongodb://localhost:27017/bazi'
  try {
    const mongoose = require('mongoose')
    await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 3000 })
    add('INFO', 'MongoDB', `连通（${mongoUrl.replace(/(mongodb:\/\/)[^@/]+@/, '$1***@')}）`)
    await mongoose.disconnect()
  } catch (err) {
    add('ERROR', 'MongoDB', `连不上：${err.message.slice(0, 80)}`,
      'docker run -d --name bazi-mongo -p 27017:27017 mongo:7')
  }

  // Redis：可选，没有则限流退化为进程内计数
  if (process.env.REDIS_URL) {
    let client = null
    try {
      const { createClient } = require('redis')
      // 必须同时给 connectTimeout 和关掉 reconnectStrategy：
      // node-redis 默认会无限重连退避，连不上时 connect() 永不 reject，
      // 自检脚本会直接挂死（实测踩到）。自检要的是「此刻通不通」，不是重试。
      client = createClient({
        url: process.env.REDIS_URL,
        socket: { connectTimeout: 3000, reconnectStrategy: false }
      })
      client.on('error', () => {})
      await client.connect()
      await client.ping()
      add('INFO', 'Redis', '连通（限流多实例共享计数）')
    } catch (err) {
      add('WARN', 'Redis', '配了 REDIS_URL 但连不上 → 限流回落进程内计数（多实例不精确）',
        'docker compose up -d redis')
    } finally {
      try { if (client && client.isOpen) await client.quit() } catch { /* 已断开 */ }
    }
  } else {
    add('INFO', 'Redis', '未配置（限流走进程内计数，单实例等价）')
  }

  // LightRAG：可选，没有则解读少古籍引证
  const ragUrl = process.env.LIGHTRAG_URL
  if (ragUrl) {
    try {
      const axios = require('axios')
      await axios.get(`${ragUrl}/health`, { timeout: 3000 })
      add('INFO', 'LightRAG', '连通（解读带古籍引证）')
    } catch (err) {
      add('WARN', 'LightRAG', '连不上 → 解读正常但没有古籍引证（优雅降级，非阻断）')
    }
  } else {
    add('INFO', 'LightRAG', '未配置（无古籍引证）')
  }
}

// ── 6. 小程序侧配置 ───────────────────────────────────────────────
function checkMiniprogram() {
  try {
    const mp = require('../../miniprogram/config')
    const issues = mp.checkConfig()
    if (issues.length === 0) {
      add('INFO', '小程序配置', `API=${mp.API_HOST}，客服微信号已替换`)
    } else {
      issues.forEach((msg) => add(isProd ? 'ERROR' : 'WARN', '小程序配置', msg,
        '改 miniprogram/config.js，文件末尾有检查清单'))
    }
  } catch (err) {
    add('WARN', '小程序配置', `读取失败：${err.message}`)
  }
}

// ── 输出 ──────────────────────────────────────────────────────────
const ICON = { ERROR: '✗', WARN: '!', INFO: '·' }

function report() {
  const order = ['ERROR', 'WARN', 'INFO']
  const byLevel = { ERROR: [], WARN: [], INFO: [] }
  results.forEach((r) => byLevel[r.level].push(r))

  console.log(`\n环境自检 — NODE_ENV=${process.env.NODE_ENV || 'development'}`)
  console.log('═'.repeat(72))

  for (const level of order) {
    for (const r of byLevel[level]) {
      console.log(`${ICON[level]} [${r.item}] ${r.msg}`)
      if (r.fix) console.log(`    → ${r.fix}`)
    }
  }

  console.log('═'.repeat(72))
  const e = byLevel.ERROR.length
  const w = byLevel.WARN.length
  console.log(`阻断 ${e} 项，警告 ${w} 项`)

  if (e > 0) {
    console.log('\n有阻断项，' + (isProd ? '不可上线' : '部分功能不可用') + '。逐条按上面的 → 提示修。')
    process.exitCode = 1
  } else if (w > 0) {
    console.log('\n无阻断项，可以起服务。警告项按场景判断是否需要处理。')
  } else {
    console.log('\n全部通过。')
  }
}

async function main() {
  checkSecurity()
  checkWeixin()
  checkPay()
  checkAi()
  checkMiniprogram()
  await checkServices()
  report()
}

main().catch((err) => {
  console.error('自检脚本本身出错：', err.message)
  process.exitCode = 1
})
