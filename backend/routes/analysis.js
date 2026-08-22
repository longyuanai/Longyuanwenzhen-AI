// routes/analysis.js - 命理分析路由
//
// 架构原则：身强弱/喜忌/格局由 utils/mingju.js 服务端确定性算出（绝不信任客户端
// 传入的论断），作为【已知结论】注入提示词；AI 仅负责把确定结论翻译成自然语言。
const Router = require('koa-router')
const axios = require('axios')
const config = require('../config')
const logger = require('../utils/logger')
const { authRequired } = require('../middleware/auth')
const { antiBrush, quotaGuard } = require('../middleware/access')
const sentry = require('../utils/sentry')
const { paipan } = require('../utils/bazi')
const { analyzeMingju } = require('../utils/mingju')
const { buildBasicPrompt, buildDeepPrompt, validateAiOutput, formatKnowledgeContext } = require('../utils/promptBuilder')
const { retrieve } = require('../utils/knowledgeRetriever')
const {
  buildFourSchoolPrompt,
  buildFourSchoolQueries
} = require('../utils/fourSchoolPrompt')
const { buildOneLiner } = require('../utils/checkupSummary')
const { buildOneLinerEn, DISCLAIMER_EN } = require('../utils/checkupSummary.en')
const T = require('../utils/i18n/baziTerms')
const { analyzeDayunSegment, analyzeDayunFull, currentDayun } = require('../utils/dayun')
const {
  buildDayunSegmentPrompt,
  buildDayunFullPrompt
} = require('../utils/dayunPrompt')
const {
  buildBasicFallback,
  buildDeepFallback,
  buildFourSchoolFallback,
  buildDayunSegmentFallback,
  buildDayunFullFallback
} = require('../utils/localFallback')
const {
  buildBasicPromptEn,
  buildDeepPromptEn,
  validateAiOutputEn
} = require('../utils/promptBuilder.en')
const { buildFourSchoolPromptEn } = require('../utils/fourSchoolPrompt.en')
const {
  buildDayunSegmentPromptEn,
  buildDayunFullPromptEn
} = require('../utils/dayunPrompt.en')
const {
  buildBasicFallbackEn,
  buildDeepFallbackEn,
  buildFourSchoolFallbackEn,
  buildDayunSegmentFallbackEn,
  buildDayunFullFallbackEn
} = require('../utils/localFallback.en')
const aiUsage = require('../utils/aiUsage')
const reg = require('../utils/entitlementRegistry')
const { Lunar } = require('lunar-javascript')

const AI_HTTP_TIMEOUT_MS = 5000

// 输出语言。只认 'zh' / 'en'，其余一律回落中文 —— 不认识的 lang 值
// 应该给出可用内容，而不是报错或吐出半英半中。
const SUPPORTED_LANGS = ['zh', 'en']
const DEFAULT_LANG = 'zh'

function resolveLang(raw) {
  const v = String(raw || '').trim().toLowerCase()
  if (SUPPORTED_LANGS.includes(v)) return v
  // 容忍 'en-US' / 'zh-CN' 这类带地区码的写法
  const base = v.split('-')[0]
  return SUPPORTED_LANGS.includes(base) ? base : DEFAULT_LANG
}

// 语言 → 提示词与降级模板构造器。集中在一处，新增语言只改这张表。
const BUILDERS = {
  zh: {
    basic: buildBasicPrompt,
    deep: buildDeepPrompt,
    fourSchool: buildFourSchoolPrompt,
    dayunSegment: buildDayunSegmentPrompt,
    dayunFull: buildDayunFullPrompt,
    fallback: {
      basic: buildBasicFallback,
      deep: buildDeepFallback,
      'four-school': buildFourSchoolFallback,
      'dayun-segment': buildDayunSegmentFallback,
      'dayun-full': buildDayunFullFallback
    }
  },
  en: {
    basic: buildBasicPromptEn,
    deep: buildDeepPromptEn,
    fourSchool: buildFourSchoolPromptEn,
    dayunSegment: buildDayunSegmentPromptEn,
    dayunFull: buildDayunFullPromptEn,
    fallback: {
      basic: buildBasicFallbackEn,
      deep: buildDeepFallbackEn,
      'four-school': buildFourSchoolFallbackEn,
      'dayun-segment': buildDayunSegmentFallbackEn,
      'dayun-full': buildDayunFullFallbackEn
    }
  }
}

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
// 走 utils/entitlementRegistry:有 Mongo 走 Mongo(权威),无 Mongo 走 in-memory 兜底
// → P1 #31 修复点,无 Mongo 演示不再永远 403
async function hasDeepEntitlement(userId) {
  if (await reg.hasOrderPaid(userId, 'deep_report')) return true
  if (await reg.hasValidVip(userId)) return true
  return false
}

// 四家并列解读权益校验：买了 four_school 的付费订单 OR 持有有效 VIP。
// 设计动机：VIP 用户应可享受所有付费档（含更高级的四家解读）。
async function hasFourSchoolEntitlement(userId) {
  if (await reg.hasOrderPaid(userId, 'four_school')) return true
  if (await reg.hasValidVip(userId)) return true
  return false
}

// 大运单段深度解读权益校验
async function hasDayunSegmentEntitlement(userId) {
  if (await reg.hasOrderPaid(userId, 'dayun_segment')) return true
  if (await reg.hasValidVip(userId)) return true
  return false
}

// 大运全卷权益校验
async function hasDayunFullEntitlement(userId) {
  if (await reg.hasOrderPaid(userId, 'dayun_full')) return true
  if (await reg.hasValidVip(userId)) return true
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
  const { year, month, day, hour, minute = 0, gender, birthPlace, longitude } = birth
  // birthPlace / longitude 透传给排盘：两者都不给就不做真太阳时校正（默认关闭）
  const pp = paipan({ year, month, day, hour, minute, gender, birthPlace, longitude }) // 内部已做边界校验
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
 * @param {string} type     'basic' | 'deep' | 'four-school' | 'dayun-segment' | 'dayun-full'
 * @param {string} prompt   提示词
 * @param {object} computed { baziStr, dayunStr, mingju, [seg|fullList] } 供降级模板使用
 * @param {string} [lang]   'zh' | 'en'，决定 system prompt 与降级模板语言
 */
async function generateAnalysis(type, prompt, computed, lang = DEFAULT_LANG) {
  const system = lang === 'en'
    ? 'You are a professional BaZi (Four Pillars of Destiny) consultant. '
      + 'Write in clear, natural English.'
    : '你是一位专业的八字命理师，精通传统命理学。'

  const model = config.ai.openai.model
  const startedAt = Date.now()

  try {
    const response = await axios.post(
      `${config.ai.openai.baseUrl}/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: system },
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
    const raw = response.data.choices[0].message.content
    // 记录真实 token 消耗，供 scripts/ai-usage-report.js 算单位成本
    aiUsage.record({
      type, lang, model, usage: response.data.usage, ms: Date.now() - startedAt
    })
    // 日主一致性校验：两种语言各有实现，句式差异大，不能共用一套正则
    if (lang === 'en') validateAiOutputEn(computed.mingju, raw, logger)
    else validateAiOutput(computed.mingju, raw, logger)
    return raw
  } catch (err) {
    // 降级也记一笔：降级率是判断 AI 网关是否稳定的关键指标
    aiUsage.record({ type, lang, model, ms: Date.now() - startedAt, fallback: true })
    logger.warn(`AI生成失败(${type}/${lang}), 降级到本地模板:`, err.message)
    const build = (BUILDERS[lang] || BUILDERS[DEFAULT_LANG]).fallback[type]
    if (build) return build(computed)
    return lang === 'en'
      ? 'The reading is being generated. Please try again shortly.'
      : '命理解读生成中，请稍后再试。'
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
router.post('/basic', antiBrush({ dim: 'analysis.basic', max: 60 }), async (ctx) => {
  try {
    const { baziId, birth } = ctx.request.body
    const lang = resolveLang(ctx.request.body.lang)
    let computed
    try {
      computed = computeFromBirth(birth)
    } catch (e) {
      if (e.code === 'INVALID_INPUT') return badRequest(ctx, e.message)
      throw e
    }

    const prompt = BUILDERS[lang].basic(computed.baziStr, computed.mingju)
    const content = await generateAnalysis('basic', prompt, computed, lang)
    logger.info(`生成基础解读: ${baziId} (${lang})`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: { baziId, content, type: 'basic', mingju: computed.mingju },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('基础解读错误:', err)
    sentry.captureException(err, { method: ctx.method, url: ctx.url, status: 500, ip: ctx.ip })
    ctx.status = 500
    ctx.body = { code: 500, message: '解读生成失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 深度报告
 * POST /api/v1/analysis/deep
 * body: { baziId, birth: {...} }
 */
router.post('/deep', authRequired, quotaGuard({ dim: 'analysis.deep', max: 5 }), async (ctx) => {
  try {
    const { baziId, birth } = ctx.request.body
    const userId = ctx.state.user.userId
    const lang = resolveLang(ctx.request.body.lang)

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

    const prompt = BUILDERS[lang].deep(computed.baziStr, computed.dayunStr, computed.mingju)
    const content = await generateAnalysis('deep', prompt, computed, lang)
    logger.info(`生成深度报告: ${baziId}, 用户: ${userId} (${lang})`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: { baziId, content, type: 'deep', mingju: computed.mingju },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('深度报告错误:', err)
    sentry.captureException(err, { method: ctx.method, url: ctx.url, status: 500, ip: ctx.ip })
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
router.post('/four-school', authRequired, quotaGuard({ dim: 'analysis.four_school', max: 3 }), async (ctx) => {
  try {
    const { baziId, birth } = ctx.request.body
    const userId = ctx.state.user.userId
    const lang = resolveLang(ctx.request.body.lang)

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

    const prompt = BUILDERS[lang].fourSchool(
      computed.baziStr,
      computed.dayunStr,
      computed.mingju,
      knowledgeBySchool
    )
    const content = await generateAnalysis('four-school', prompt, computed, lang)

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
    sentry.captureException(err, { method: ctx.method, url: ctx.url, status: 500, ip: ctx.ip })
    ctx.status = 500
    ctx.body = { code: 500, message: '四家解读生成失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 免费五行体检（阶段1 MVP：纯确定性，不调 AI，不需登录/付费）
 * POST /api/v1/analysis/checkup
 * body: { birth: {year,month,day,hour,minute,gender,calendar?:'solar'|'lunar',isLeap?} }
 */
// 体检结果的英文标签块。
//
// 刻意「新增 labels 而非替换原字段」：wuxingScore 的键是中文五行字符，
// pillars 里也全是干支汉字，改键名会直接打断小程序。所以原样保留，
// 另给一份英文渲染，前端按语言取。
//
// 术语一律走 utils/i18n/baziTerms.js —— 那张表已被测试锁死必须穷尽算法取值，
// 前端各自再维护一份必然漏（英文降级模板就因此漏过 偏强/羊刃格）。
function buildCheckupLabelsEn(pp, m) {
  const els = {}
  Object.keys(m.wuxingScore).forEach((e) => { els[e] = T.element(e) })

  const pillarLabels = {}
  ;['year', 'month', 'day', 'hour'].forEach((k) => {
    const p = pp[k + 'Pillar']
    pillarLabels[k] = {
      name: { year: 'Year', month: 'Month', day: 'Day', hour: 'Hour' }[k],
      pillar: T.pillar(p.gan + p.zhi),
      gan: T.gan(p.gan),
      zhi: T.zhi(p.zhi),
      ganShen: T.tenGod(pp.tenGods[k + 'Gan']),
      zhiShen: T.tenGod(pp.tenGods[k + 'Zhi']),
      cang: (pp.cangGan[k] || []).map(T.gan)
    }
  })

  const th = m.yongShen.tiaoHou
  return {
    dayMaster: T.gan(m.dayMaster.gan),
    dayElement: T.element(m.dayMaster.element),
    strength: T.strength(m.strength.label),
    geju: T.geju(m.geju.name),
    xiShen: (m.yongShen.xiShen || []).map(T.element),
    jiShen: (m.yongShen.jiShen || []).map(T.element),
    elements: els,
    pillars: pillarLabels,
    tiaoHou: {
      season: T.season(th.season),
      need: (th.need || []).map(T.element),
      urgent: !!th.urgent
    }
  }
}

/**
 * 真太阳时展示块。没启用校正时返回 null（默认关闭，不打扰）。
 *
 * 启用时额外算一遍**未校正**的盘做对比：校正是否真的改了四柱，是
 * 「我们比别家算得准」这个卖点唯一能拿出来给用户看的实证。
 * 排盘是纯函数且只需微秒级，多算一遍不心疼。
 */
function buildTrueSolarTimeView(pp, birth, lang) {
  const t = pp.trueSolarTime
  if (!t) return null

  const gz = (r, k) => r[k + 'Pillar'].gan + r[k + 'Pillar'].zhi
  const KEYS = ['year', 'month', 'day', 'hour']

  let plain = null
  try {
    // 同一出生时刻、去掉出生地
    plain = paipan({
      year: birth.year, month: birth.month, day: birth.day,
      hour: birth.hour, minute: birth.minute || 0, gender: birth.gender
    })
  } catch (e) {
    // 未校正版可能超界（校正把日期拉回了范围内）。对比拿不到就不展示对比，
    // 不能因为这个附加信息把整个体检打挂。
    plain = null
  }

  const changedPillars = plain ? KEYS.filter((k) => gz(pp, k) !== gz(plain, k)) : []
  const sign = t.offsetMinutes >= 0 ? '+' : '−'
  const abs = Math.abs(t.offsetMinutes)

  // 英文版一律用经度指代地点，不回落到中文城市名——城市表里存的是中文，
  // 直接塞进英文句子会让英文正文混中文（项目里已有的规矩）。
  // 给 122 个城市配一套罗马化表不值得，经度对英文读者反而更明确。
  const zhWhere = t.place || `东经 ${t.longitude}°`
  const enWhere = `${t.longitude}°E`

  const summary = lang === 'en'
    ? (changedPillars.length
      ? `True solar time at ${enWhere} differs from clock time by ${sign}${abs} min, which changes ${changedPillars.length} of the four pillars.`
      : `True solar time at ${enWhere} differs from clock time by ${sign}${abs} min; the four pillars are unaffected.`)
    : (changedPillars.length
      ? `按${zhWhere}的真太阳时校正 ${sign}${abs} 分钟，四柱中有 ${changedPillars.length} 柱因此改变。`
      : `按${zhWhere}的真太阳时校正 ${sign}${abs} 分钟，未改变四柱。`)

  return {
    enabled: true,
    place: t.place,
    longitude: t.longitude,
    offsetMinutes: t.offsetMinutes,
    longitudeOffset: t.longitudeOffset,
    equationOfTime: t.equationOfTime,
    crossedDay: t.crossedDay,
    clockTime: t.clockTime,
    solarTime: t.solarTime,
    // 哪些柱因校正而变——不校正就看不到的差异，这是付费转化的钩子
    changedPillars,
    comparable: plain !== null,
    summary
  }
}

router.post('/checkup', antiBrush({ dim: 'analysis.checkup', max: 120 }), async (ctx) => {
  try {
    let { birth } = ctx.request.body
    const lang = resolveLang(ctx.request.body.lang)
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
    const cur = currentDayun(pp, m)
    const currentDaYun = cur
      ? { segmentIndex: cur.segmentIndex, ganZhi: cur.ganZhi, ageRange: cur.ageRange, lean: cur.lean, oneLiner: `当前在${cur.ganZhi}大运(${cur.ageRange}),${cur.leanText}` }
      : null
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
        oneLiner: lang === 'en' ? buildOneLinerEn(pp, m) : buildOneLiner(pp, m),
        currentDaYun,
        trueSolarTime: buildTrueSolarTimeView(pp, birth, lang),
        disclaimer: lang === 'en' ? DISCLAIMER_EN : m.disclaimer,
        // 仅 en 时附带；zh 走原字段，小程序不受影响
        labels: lang === 'en' ? buildCheckupLabelsEn(pp, m) : undefined
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('体检接口错误:', err)
    sentry.captureException(err, { method: ctx.method, url: ctx.url, status: 500, ip: ctx.ip })
    ctx.status = 500
    ctx.body = { code: 500, message: '体检生成失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 大运单段深度解读（付费 dayun_segment 19.9 / VIP）
 * POST /api/v1/analysis/dayun-segment
 * body: { baziId, birth, segmentIndex }
 */
router.post('/dayun-segment', authRequired, quotaGuard({ dim: 'analysis.dayun_segment', max: 5 }), async (ctx) => {
  try {
    const { baziId, birth, segmentIndex } = ctx.request.body
    const userId = ctx.state.user.userId
    const lang = resolveLang(ctx.request.body.lang)

    if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 7) {
      return badRequest(ctx, 'segmentIndex 须为 0-7 的整数')
    }

    const entitled = await hasDayunSegmentEntitlement(userId)
    if (!entitled) {
      ctx.status = 403
      ctx.body = {
        code: 403,
        message: '大运单段解读需付费解锁，请先完成支付',
        data: { baziId, type: 'dayun_segment', paid: false },
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

    const seg = analyzeDayunSegment(computed.paipanResult, computed.mingju, { segmentIndex })
    if (!seg) return badRequest(ctx, 'segmentIndex 超出大运段范围')

    const refs = await retrieve(computed.mingju, { query: `大运 ${seg.ganZhi} ${seg.leanText}` })
    const knowledgeContext = formatKnowledgeContext(refs)

    const prompt = BUILDERS[lang].dayunSegment(
      computed.baziStr,
      computed.mingju,
      seg,
      knowledgeContext
    )
    const content = await generateAnalysis('dayun-segment', prompt, {
      ...computed,
      seg
    }, lang)

    logger.info(`生成大运单段解读: ${baziId}, 段 ${segmentIndex}, 用户: ${userId}, refs ${refs.length}`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        baziId,
        content,
        type: 'dayun_segment',
        segmentIndex,
        seg,
        mingju: computed.mingju,
        sources: { total: refs.length }
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('大运单段解读错误:', err)
    sentry.captureException(err, { method: ctx.method, url: ctx.url, status: 500, ip: ctx.ip })
    ctx.status = 500
    ctx.body = { code: 500, message: '大运单段解读生成失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 大运全卷（8 段）付费解读（dayun_full 49.9 / VIP）
 * POST /api/v1/analysis/dayun-full
 * body: { baziId, birth }
 */
router.post('/dayun-full', authRequired, quotaGuard({ dim: 'analysis.dayun_full', max: 3 }), async (ctx) => {
  try {
    const { baziId, birth } = ctx.request.body
    const userId = ctx.state.user.userId
    const lang = resolveLang(ctx.request.body.lang)

    const entitled = await hasDayunFullEntitlement(userId)
    if (!entitled) {
      ctx.status = 403
      ctx.body = {
        code: 403,
        message: '大运全卷需付费解锁，请先完成支付',
        data: { baziId, type: 'dayun_full', paid: false },
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

    const fullList = analyzeDayunFull(computed.paipanResult, computed.mingju)

    const refs = await retrieve(computed.mingju, { query: '大运十年阶段 吉凶转折' })
    const knowledgeContext = formatKnowledgeContext(refs)

    const prompt = BUILDERS[lang].dayunFull(
      computed.baziStr,
      computed.mingju,
      fullList,
      knowledgeContext
    )
    const content = await generateAnalysis('dayun-full', prompt, {
      ...computed,
      fullList
    }, lang)

    logger.info(`生成大运全卷解读: ${baziId}, 用户: ${userId}, refs ${refs.length}`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        baziId,
        content,
        type: 'dayun_full',
        segments: fullList,
        mingju: computed.mingju,
        sources: { total: refs.length }
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('大运全卷解读错误:', err)
    sentry.captureException(err, { method: ctx.method, url: ctx.url, status: 500, ip: ctx.ip })
    ctx.status = 500
    ctx.body = { code: 500, message: '大运全卷解读生成失败', data: null, timestamp: Date.now() }
  }
})

module.exports = router
