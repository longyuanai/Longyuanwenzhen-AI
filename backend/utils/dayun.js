// utils/dayun.js - 大运段论断算法
//
// 设计动机：用户进入新大运段（10 年一换）时想知道这段运势走向。算法层
// 只做"大运干支与原局喜忌的确定性互动"，AI 负责把论断翻译成自然语言。
// 这是后续 dayun_segment / dayun_full 付费档的论断基石。
//
// 算法依据（复用 wuxingScore / wangShuai / yongShen 的语义）：
//   1. 大运段干支对该段日主的新增帮扶/克伐（按五行打分）
//   2. 该段日主身强/身弱在新大运下重新判定
//   3. 大运干支所代表的十神阵营 → 是"喜神段"还是"忌神段"
//
// 边界：依赖 paipan() 的 daYun.daYunList（已过滤空段、取 8 步），与 1900-2100 范围。

const { WUXING } = require('./bazi')
const { SHENG, KE, ELEMENTS, partyOf } = require('./wuxingScore')

/**
 * 大运段在天干地支层对该段日主环境的"帮扶/克伐"打分
 *
 * 复用 wuxingScore 权重语义：每柱天干权重 8，地支按月/日/年/时 40/20/12/12。
 * 输出：
 *   {
 *     support: 同党(印+比劫)总分,
 *     drain:   异党(食伤+财+官杀)总分,
 *     ratio:   帮扶 / (帮扶+克伐),
 *     tianGanShen: 大运天干所代表的十神（如 甲木日主 见 丙火大运 → 食神）
 *     diZhiShen:   大运地支所代表的十神（按本气五行归类）
 *   }
 */
function scoreSegment(dayEl, segmentGan, segmentZhi) {
  let support = 0, drain = 0
  const ganEl = WUXING[segmentGan]
  const ganParty = partyOf(ganEl, dayEl)
  if (ganParty === '印' || ganParty === '比劫') support += 8
  else drain += 8

  // 地支权重按"日柱近身"取 20（最强档），简化为统一取 20
  const zhiEl = WUXING[segmentZhi]
  const zhiParty = partyOf(zhiEl, dayEl)
  if (zhiParty === '印' || zhiParty === '比劫') support += 20
  else drain += 20

  const total = support + drain
  return {
    support,
    drain,
    ratio: total > 0 ? support / total : 0.5,
    tianGanShen: ganParty,
    diZhiShen: zhiParty
  }
}

/**
 * 判断该大运段是"喜神段"还是"忌神段"
 *
 * 规则（确定性）：
 *   - 原局身弱 → 该段 support > drain → 喜神段
 *   - 原局身强 → 该段 drain   > support → 喜神段
 *   - 其他 → 平段
 *
 * 输出：'xi' (喜) | 'ji' (忌) | 'ping' (平)
 */
function judgeSegmentLean(origLean, score) {
  // origLean: 'strong' | 'weak' | 'balanced'
  if (origLean === 'weak') return score.support > score.drain ? 'xi' : (score.support < score.drain ? 'ji' : 'ping')
  if (origLean === 'strong') return score.drain > score.support ? 'xi' : (score.drain < score.support ? 'ji' : 'ping')
  return 'ping'
}

/**
 * 给定 birth + 目标年份或段索引,返回大运段论断对象
 *
 * @param {object} paipanResult  paipan() 输出
 * @param {object} mingju        analyzeMingju() 输出
 * @param {object} opts
 *   - segmentIndex?: number  0-7,显式选段
 *   - targetYear?:   number  按公历年份反查该年落入哪段
 *
 * 优先 segmentIndex,否则按 targetYear 落入,否则抛错。
 */
function analyzeDayunSegment(paipanResult, mingju, opts = {}) {
  const list = paipanResult.daYun.daYunList
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('命盘无大运数据(年份超出范围或排盘失败)')
  }

  let idx
  if (Number.isInteger(opts.segmentIndex)) {
    if (opts.segmentIndex < 0 || opts.segmentIndex >= list.length) {
      throw new Error(`segmentIndex 越界(0-${list.length - 1})`)
    }
    idx = opts.segmentIndex
  } else if (Number.isInteger(opts.targetYear)) {
    const hit = list.findIndex((d) => opts.targetYear >= d.startYear && opts.targetYear < d.startYear + 10)
    if (hit < 0) {
      throw new Error(`targetYear ${opts.targetYear} 不在已知 8 步大运范围内`)
    }
    idx = hit
  } else {
    throw new Error('必须传 segmentIndex 或 targetYear')
  }

  const seg = list[idx]
  const dayEl = mingju.dayMaster.element
  const score = scoreSegment(dayEl, seg.gan, seg.zhi)
  const lean = judgeSegmentLean(mingju.strength.lean, score)

  return {
    segmentIndex: idx,
    ganZhi: seg.ganZhi,
    ageRange: seg.ageRange,
    startYear: seg.startYear,
    endYear: seg.startYear + 9,
    tianGanShen: score.tianGanShen,
    diZhiShen: score.diZhiShen,
    support: score.support,
    drain: score.drain,
    ratio: Number(score.ratio.toFixed(3)),
    lean,
    leanText: lean === 'xi' ? '喜神段(运势向好)' : lean === 'ji' ? '忌神段(需谨慎)' : '平段(波动起伏)',
    basis: [
      `原局日主 ${dayEl} 属${mingju.strength.label}`,
      `大运 ${seg.ganZhi}(${seg.ageRange}):天干 ${score.tianGanShen},地支 ${score.diZhiShen}`,
      `该段帮扶 ${score.support} / 克伐 ${score.drain},比例 ${(score.ratio * 100).toFixed(0)}%`
    ]
  }
}

/**
 * 全卷(8 段)摘要 — 给 dayun_full 用
 *
 * 返回 8 个 lean 标记 + 起止年,数据极简供 AI 概览。
 */
function analyzeDayunFull(paipanResult, mingju) {
  const list = paipanResult.daYun.daYunList
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('命盘无大运数据')
  }
  const dayEl = mingju.dayMaster.element
  return list.map((seg, i) => {
    const score = scoreSegment(dayEl, seg.gan, seg.zhi)
    const lean = judgeSegmentLean(mingju.strength.lean, score)
    return {
      segmentIndex: i,
      ganZhi: seg.ganZhi,
      ageRange: seg.ageRange,
      startYear: seg.startYear,
      lean,
      ratio: Number(score.ratio.toFixed(3)),
      tianGanShen: score.tianGanShen,
      diZhiShen: score.diZhiShen
    }
  })
}

/**
 * 当前大运(基于 today) — 给 /checkup 免费钩子用
 *
 * 比 analyzeDayunSegment 少一步:自动按当前公历年算 targetYear,无 match 则返回 null。
 */
function currentDayun(paipanResult, mingju, today = new Date()) {
  const targetYear = today.getFullYear()
  const list = paipanResult.daYun.daYunList
  const hit = list.findIndex((d) => targetYear >= d.startYear && targetYear < d.startYear + 10)
  if (hit < 0) return null
  return analyzeDayunSegment(paipanResult, mingju, { segmentIndex: hit })
}

module.exports = {
  scoreSegment,
  judgeSegmentLean,
  analyzeDayunSegment,
  analyzeDayunFull,
  currentDayun
}