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
const { retrieve } = require('../utils/knowledgeRetriever')
const {
  buildFourSchoolPrompt,
  buildFourSchoolQueries
} = require('../utils/fourSchoolPrompt')
const { buildOneLiner } = require('../utils/checkupSummary')
const {
  buildBasicFallback,
  buildDeepFallback,
  buildFourSchoolFallback
} = require('../utils/localFallback')
const { Lunar } = require('lunar-javascript')

const AI_HTTP_TIMEOUT_MS = 5000

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

// 四家并列解读权益校验：买了 four_school 的付费订单 OR 持有有效 VIP。
// 设计动机：VIP 用户应可享受所有付费档（含更高级的四家解读）。
async function hasFourSchoolEntitlement(userId) {
  const [paidOrder, user] = await Promise.all([
    Order.exists({ userId, productType: 'four_school', status: 'paid' }),
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
 *
 * 三道防线：
 *   1. axios timeout=5s（防 AI 网关假死,占位 key 触发 21s 假死的根因）
 *   2. catch 走本地降级模板(基本/深度/四家并列各自不同)
 *   3. 降级内容开头显式标注「本地解读模板」,让用户知情
 *
 * @param {string} type     'basic' | 'deep' | 'four-school'
 * @param {string} prompt   提示词
 * @param {object} computed { baziStr, dayunStr, mingju } 供降级模板使用
 */
async function generateAnalysis(type, prompt, computed) {
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
        timeout: AI_HTTP_TIMEOUT_MS,
        headers: {
          Authorization: `Bearer ${config.ai.openai.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    return response.data.choices[0].message.content
  } catch (err) {
    logger.warn(`AI生成失败(${type}), 降级到本地模板:`, err.message)
    if (type === 'basic') return buildBasicFallback(computed)
    if (type === 'deep') return buildDeepFallback(computed)
    if (type === 'four-school') return buildFourSchoolFallback(computed)
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
    const content = await generateAnalysis('basic', prompt, computed)
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
    const content = await generateAnalysis('deep', prompt, computed)
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
 * 四家并列解读
 * POST /api/v1/analysis/four-school
 * body: { baziId, birth: {...} }
 *
 * 同一盘由徐乐吾 / 梁湘润 / 袁树珊 / 韦千里 四派方法论并行解读,最后 AI 综合。
 * 需要付费档 (four_school) 或持有有效 VIP。
 */
router.post('/four-school', authRequired, async (ctx) => {
  try {
    const { baziId, birth } = ctx.request.body
    const userId = ctx.state.user.userId

    const entitled = await hasFourSchoolEntitlement(userId)
    if (!entitled) {
      ctx.status = 403
      ctx.body = {
        code: 403,
        message: '四家解读需付费解锁，请先完成支付',
        data: { baziId, type: 'four_school', paid: false },
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

    // 4 家 RAG 并发（不串行 → 总延迟 ≈ max(单家超时),最坏 ≤ 3s）。
    // 单家降级 (返回 []) 不会阻塞其他家。
    const queries = buildFourSchoolQueries(computed.mingju)
    const [xuRefs, liangRefs, yuanRefs, weiRefs] = await Promise.all([
      retrieve(computed.mingju, { query: queries.xu }),
      retrieve(computed.mingju, { query: queries.liang }),
      retrieve(computed.mingju, { query: queries.yuan }),
      retrieve(computed.mingju, { query: queries.wei })
    ])
    const knowledgeBySchool = { xu: xuRefs, liang: liangRefs, yuan: yuanRefs, wei: weiRefs }

    const prompt = buildFourSchoolPrompt(
      computed.baziStr,
      computed.dayunStr,
      computed.mingju,
      knowledgeBySchool
    )
    const content = await generateAnalysis('four-school', prompt, computed)

    // 暴露各家的古籍命中数,前端可展示「徐乐吾派(3 处引证)」
    const sources = {
      xu: xuRefs.length,
      liang: liangRefs.length,
      yuan: yuanRefs.length,
      wei: weiRefs.length,
      total: xuRefs.length + liangRefs.length + yuanRefs.length + weiRefs.length
    }

    logger.info(`生成四家解读: ${baziId}, 用户: ${userId}, 古籍命中 ${sources.total} 处`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        baziId,
        content,
        type: 'four_school',
        mingju: computed.mingju,
        schools: ['徐乐吾', '梁湘润', '袁树珊', '韦千里'],
        sources
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('四家解读错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '四家解读生成失败', data: null, timestamp: Date.now() }
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
