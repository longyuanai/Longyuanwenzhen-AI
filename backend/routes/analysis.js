// routes/analysis.js - 命理分析路由
//
// 架构原则：身强弱/喜忌/格局由 utils/mingju.js 服务端确定性算出（绝不信任客户端
// 传入的论断），作为【已知结论】注入提示词；AI 仅负责把确定结论翻译成自然语言。
const Router = require('koa-router')
const axios = require('axios')
const config = require('../config')
const logger = require('../utils/logger')
const Order = require('../models/Order')
const User = require('../models/User')
const { authRequired } = require('../middleware/auth')
const { paipan } = require('../utils/bazi')
const { analyzeMingju } = require('../utils/mingju')
const { buildBasicPrompt, buildDeepPrompt } = require('../utils/promptBuilder')
const { buildOneLiner } = require('../utils/checkupSummary')
const { Lunar } = require('lunar-javascript')

const router = new Router()

// 时辰未知不在此处理。农历→阳历转换（paipan 只认阳历）。闰月用负月份。
function normalizeBirthToSolar(birth) {
  if (!birth || typeof birth !== 'object' || birth.calendar !== 'lunar') return birth
  const m = birth.isLeap ? -Math.abs(Number(birth.month)) : Number(birth.month)
  const solar = Lunar.fromYmd(Number(birth.year), m, Number(birth.day)).getSolar()
  return { ...birth, calendar: 'solar', year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() }
}

// 单柱展示视图（前端排盘渲染用）
function pillarView(pp, key) {
  const p = pp[key + 'Pillar']
  return {
    gan: p.gan,
    zhi: p.zhi,
    ganWuxing: pp.wuxing[key + 'Gan'],
    zhiWuxing: pp.wuxing[key + 'Zhi'],
    ganShen: pp.tenGods[key + 'Gan'],
    zhiShen: pp.tenGods[key + 'Zhi'],
    cang: pp.cangGan[key]
  }
}

// 付费校验（spec 5.4.1：生成深度报告前必须验证已付费，未付费禁止生成）。
// 判定为已付费：存在一条 paid 的 deep_report 订单，或持有未过期的 VIP。
async function hasDeepEntitlement(userId) {
  const [paidOrder, user] = await Promise.all([
    Order.exists({ userId, productType: 'deep_report', status: 'paid' }),
    User.findById(userId).select('vipLevel vipExpireAt')
  ])
  if (paidOrder) return true
  if (user && user.vipLevel > 0 && (!user.vipExpireAt || user.vipExpireAt > new Date())) return true
  return false
}

// 从请求体的 birth 重新排盘并算论断（服务端权威，杜绝客户端篡改结论）。
// 返回 { paipanResult, mingju, baziStr, dayunStr } 或抛 INVALID_INPUT。
function computeFromBirth(birth) {
  if (!birth || typeof birth !== 'object') {
    const e = new Error('缺少出生信息 birth（year/month/day/hour/gender）')
    e.code = 'INVALID_INPUT'
    throw e
  }
  const { year, month, day, hour, minute = 0, gender } = birth
  const pp = paipan({ year, month, day, hour, minute, gender }) // 内部已做边界校验
  const mingju = analyzeMingju(pp)
  const baziStr = [pp.yearPillar, pp.monthPillar, pp.dayPillar, pp.hourPillar]
    .map((p) => p.gan + p.zhi)
    .join(' ')
  const dayunStr = pp.daYun.daYunList.map((d) => d.ganZhi).join(' ')
  return { paipanResult: pp, mingju, baziStr, dayunStr }
}

/**
 * 调用AI生成解读
 */
async function generateAnalysis(prompt) {
  try {
    const response = await axios.post(
      `${config.ai.openai.baseUrl}/chat/completions`,
      {
        model: config.ai.openai.model,
        messages: [
          { role: 'system', content: '你是一位专业的八字命理师，精通传统命理学。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      },
      {
        headers: {
          Authorization: `Bearer ${config.ai.openai.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return response.data.choices[0].message.content
  } catch (err) {
    logger.error('AI生成错误:', err)
    return '命理解读生成中，请稍后再试。'
  }
}

function badRequest(ctx, message) {
  ctx.status = 400
  ctx.body = { code: 400, message, data: null, timestamp: Date.now() }
}

/**
 * 基础解读
 * POST /api/v1/analysis/basic
 * body: { baziId, birth: {year,month,day,hour,minute,gender} }
 */
router.post('/basic', async (ctx) => {
  try {
    const { baziId, birth } = ctx.request.body
    let computed
    try {
      computed = computeFromBirth(birth)
    } catch (e) {
      if (e.code === 'INVALID_INPUT') return badRequest(ctx, e.message)
      throw e
    }

    const prompt = buildBasicPrompt(computed.baziStr, computed.mingju)
    const content = await generateAnalysis(prompt)
    logger.info(`生成基础解读: ${baziId}`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: { baziId, content, type: 'basic', mingju: computed.mingju },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('基础解读错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '解读生成失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 深度报告
 * POST /api/v1/analysis/deep
 * body: { baziId, birth: {...} }
 */
router.post('/deep', authRequired, async (ctx) => {
  try {
    const { baziId, birth } = ctx.request.body
    const userId = ctx.state.user.userId

    // 付费校验：未付费禁止生成深度报告（spec 5.4.1 禁止项）
    const entitled = await hasDeepEntitlement(userId)
    if (!entitled) {
      ctx.status = 403
      ctx.body = {
        code: 403,
        message: '深度报告需付费解锁，请先完成支付',
        data: { baziId, type: 'deep', paid: false },
        timestamp: Date.now()
      }
      return
    }

    let computed
    try {
      computed = computeFromBirth(birth)
    } catch (e) {
      if (e.code === 'INVALID_INPUT') return badRequest(ctx, e.message)
      throw e
    }

    const prompt = buildDeepPrompt(computed.baziStr, computed.dayunStr, computed.mingju)
    const content = await generateAnalysis(prompt)
    logger.info(`生成深度报告: ${baziId}, 用户: ${userId}`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: { baziId, content, type: 'deep', mingju: computed.mingju },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('深度报告错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '报告生成失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 免费五行体检（阶段1 MVP：纯确定性，不调 AI，不需登录/付费）
 * POST /api/v1/analysis/checkup
 * body: { birth: {year,month,day,hour,minute,gender,calendar?:'solar'|'lunar',isLeap?} }
 */
router.post('/checkup', async (ctx) => {
  try {
    let { birth } = ctx.request.body
    try {
      birth = normalizeBirthToSolar(birth)
    } catch (e) {
      return badRequest(ctx, '农历日期转换失败，请检查年月日（含闰月）是否有效')
    }

    let computed
    try {
      computed = computeFromBirth(birth)
    } catch (e) {
      if (e.code === 'INVALID_INPUT') return badRequest(ctx, e.message)
      throw e
    }

    const pp = computed.paipanResult
    const m = computed.mingju
    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        baziStr: computed.baziStr,
        pillars: {
          year: pillarView(pp, 'year'),
          month: pillarView(pp, 'month'),
          day: pillarView(pp, 'day'),
          hour: pillarView(pp, 'hour')
        },
        dayMaster: m.dayMaster,
        wuxingScore: m.wuxingScore,
        strength: m.strength,
        yongShen: m.yongShen,
        geju: m.geju,
        oneLiner: buildOneLiner(pp, m),
        disclaimer: m.disclaimer
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('体检接口错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '体检生成失败', data: null, timestamp: Date.now() }
  }
})

module.exports = router
