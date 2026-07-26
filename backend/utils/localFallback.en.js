// utils/localFallback.en.js - 英文本地降级模板
//
// 与 utils/localFallback.js 同职责：AI 网关超时/失败/配错 key 时，直接基于
// utils/mingju.js 的确定性论断拼出可读段落，不让用户卡在报错上。
//
// 覆盖范围与 utils/promptBuilder.en.js 对齐（basic / deep 两条路径）——
// 英文链路目前只做到这两条，四家并列与大运全卷仍是中文独有，
// 等英文市场验证通过再补，不提前铺摊子。
//
// 设计原则沿用中文版：
//   - 不假装是 AI：开头明确标注模板来源，让用户知情
//   - 只用 mingju 的确定性结论与已算好的字符串，绝不编造
//   - 用 tends to / may 这类非绝对化措辞，对齐 promptBuilder.en 的 COMMON_RULES_EN
//   - 不混用西方占星词汇（sun sign / house / planet）
//   - 末尾附免责声明
//
// 与中文版的一个差异：中文版直接把 mingju.basis[] 原样拼进去，英文版不行 ——
// basis 是中文句子，塞进英文段落里很突兀。这里改为用结构化字段自行组句，
// basis 只在"技术依据"小节里作为原文附录列出，供懂中文的用户核对。

const T = require('./i18n/baziTerms')

const LOCAL_TAG =
  '[Offline template] The AI service is temporarily unavailable. '
  + 'The reading below is generated directly from the engine\'s deterministic '
  + 'analysis of your chart — the conclusions are the same, the prose is simpler.\n'

const DISCLAIMER_EN =
  'Note: the above reflects tendencies derived from classical BaZi rules. '
  + 'It is not a definitive prediction, and is offered as a tool for '
  + 'self-reflection and decision-making, not fortune-telling.'

// 日主五行 → 性格倾向关键词（对齐中文版 basicSection 的同一套说法）
const ELEMENT_TRAITS = {
  木: 'growth-oriented, principled, and inclined to keep improving',
  火: 'warm, expressive, and drawn to visibility',
  土: 'steady, dependable, and inclined to take responsibility',
  金: 'decisive, resolute, with a strong sense of fairness',
  水: 'adaptable, perceptive, and quick to read situations'
}

// 五行 → 对应脏腑（健康小节用）
const ELEMENT_ORGANS = {
  木: 'liver and tendons',
  火: 'heart and circulation',
  土: 'spleen and digestion',
  金: 'lungs and respiration',
  水: 'kidneys and urinary system'
}

function strengthLine(mingju) {
  const s = mingju.strength
  const parts = [
    `seasonal support: ${s.deLing ? 'yes' : 'no'}`,
    `root in branches: ${s.deDi ? 'yes' : 'no'}`,
    `stem allies: ${s.deShi ? 'yes' : 'no'}`
  ]
  return `${T.strength(s.label)} (${parts.join(', ')})`
}

function tiaoHouLine(mingju) {
  const th = mingju.yongShen.tiaoHou
  if (!th.need.length) return `${T.season(th.season)} birth, no significant climatic adjustment needed`
  return `${T.season(th.season)} birth, needs ${T.elements(th.need)}${th.urgent ? ' (urgent)' : ''}`
}

// 冠词：五行里只有 Earth 以元音开头，硬拼 "A Earth" 是明显的语法错误
function withArticle(word) {
  return /^[AEIOU]/i.test(word) ? `An ${word}` : `A ${word}`
}

function weightsLine(mingju) {
  return Object.entries(mingju.wuxingScore)
    .map(([el, v]) => `${T.element(el)} ${Number(v).toFixed(1)}`)
    .join(', ')
}

function conflictsLine(mingju) {
  const cs = mingju.yongShen.conflicts
  if (!Array.isArray(cs) || cs.length === 0) return null
  // conflicts 是五行数组（调候所需但与扶抑忌神冲突的那几个），走术语表译成英文
  return 'Note — the engine flagged tension between the balancing rule and the '
    + `climatic requirement over: ${T.elements(cs)}. `
    + 'Classical practice treats this as a judgement call rather than a fixed answer.'
}

// mingju.basis 是中文判据句，作为附录列出供核对，不混进正文
function basisAppendix(mingju) {
  return [
    'Technical derivation (engine output, in Chinese — included for reference):',
    ...mingju.basis.map((b, i) => `  ${i + 1}. ${b}`)
  ].join('\n')
}

function favorUnfavor(mingju) {
  return {
    xi: T.elements(mingju.yongShen.xiShen),
    ji: T.elements(mingju.yongShen.jiShen)
  }
}

function basicSectionEn(mingju) {
  const dm = mingju.dayMaster
  const { xi, ji } = favorUnfavor(mingju)
  const conflict = conflictsLine(mingju)

  const lines = [
    '1. Favorable elements',
    `Your Day Master is ${T.gan(dm.gan)}, assessed as ${strengthLine(mingju)}.`,
    `Favorable elements: ${xi}. Unfavorable elements: ${ji}.`,
    `Climatic balance (Tiao Hou — how the season of birth tilts the chart): ${tiaoHouLine(mingju)}.`,
    `Elemental weights across the chart: ${weightsLine(mingju)}.`
  ]
  if (conflict) lines.push(conflict)

  lines.push(
    '',
    '2. Chart character',
    `Structure (Ge Ju — the organising pattern of the chart): ${T.geju(mingju.geju.name)}`
      + `${mingju.geju.isSpecial ? ', a special structure' : ''}`
      + `${mingju.geju.isPure ? ', and a clean one' : ''}.`,
    `With ${T.element(dm.element)} as the Day Master element and the weighting above, `
      + `the chart tends to express itself most readily through ${xi}.`,
    '',
    '3. Personality tendencies',
    `${withArticle(T.element(dm.element))} Day Master assessed as ${T.strength(mingju.strength.label)} `
      + `tends to be ${ELEMENT_TRAITS[dm.element] || 'shaped by the balance of the chart as a whole'}.`,
    'These are tendencies, not fixed traits — how they show up depends heavily on '
      + 'environment and choices.',
    '',
    basisAppendix(mingju),
    '',
    DISCLAIMER_EN
  )
  return lines.join('\n')
}

function deepSectionsEn(baziStr, dayunStr, mingju) {
  const dm = mingju.dayMaster
  const { xi, ji } = favorUnfavor(mingju)
  const conflict = conflictsLine(mingju)
  const jiOrgans = mingju.yongShen.jiShen
    .map((e) => ELEMENT_ORGANS[e])
    .filter(Boolean)
    .join(', ')

  const lines = [
    '1. Overall reading',
    `Four Pillars: ${T.pillars(baziStr)}`,
    `Luck Pillars (Da Yun — successive 10-year periods): ${String(dayunStr).trim().split(/\s+/).map(T.pillar).join(' → ')}`,
    `Day Master ${T.gan(dm.gan)}, assessed as ${strengthLine(mingju)}, `
      + `in a ${T.geju(mingju.geju.name)}.`,
    `Favorable: ${xi}. Unfavorable: ${ji}. Climatic balance: ${tiaoHouLine(mingju)}.`
  ]
  if (conflict) lines.push(conflict)

  lines.push(
    '',
    '2. Career and wealth',
    `Elemental weights: ${weightsLine(mingju)}.`,
    `Work that aligns with ${xi} tends to feel more supported; directions heavily `
      + `weighted toward ${ji} tend to meet more friction. How this maps onto an actual `
      + 'industry depends on the specifics of the role, so treat it as a lens rather than a rule.',
    '',
    '3. Relationships',
    'In BaZi, partnership indications are read from the Wealth and Officer elements '
      + 'relative to the Day Master.',
    `For this chart, periods and environments leaning toward ${xi} tend to be steadier `
      + 'for close relationships.',
    '',
    '4. Health areas worth attention',
    'Each element maps to a body system: Wood — liver and tendons; Fire — heart and '
      + 'circulation; Earth — spleen and digestion; Metal — lungs and respiration; '
      + 'Water — kidneys and urinary system.',
    jiOrgans
      ? `Given the unfavorable elements here (${ji}), the ${jiOrgans} may be worth `
        + 'ordinary attention — regular rest and not over-extending.'
      : 'No single system stands out as needing particular attention in this chart.',
    'This is a traditional correspondence, not medical advice.',
    '',
    '5. Practical guidance',
    `- Lean into ${xi}: environments, activities and directions associated with these elements.`,
    `- Be deliberate about over-investing in ${ji}.`,
    `- Climatic note: ${tiaoHouLine(mingju)} — worth factoring into routine and seasonal habits.`,
    '',
    basisAppendix(mingju),
    '',
    DISCLAIMER_EN
  )
  return lines.join('\n')
}

/**
 * 基础解读降级模板（英文）
 * @param {object} p { baziStr, mingju }
 */
function buildBasicFallbackEn({ baziStr, mingju }) {
  return [
    LOCAL_TAG,
    `Four Pillars: ${T.pillars(baziStr)}`,
    '',
    basicSectionEn(mingju)
  ].join('\n')
}

/**
 * 深度报告降级模板（英文）
 * @param {object} p { baziStr, dayunStr, mingju }
 */
function buildDeepFallbackEn({ baziStr, dayunStr, mingju }) {
  return [
    LOCAL_TAG,
    '',
    deepSectionsEn(baziStr, dayunStr, mingju)
  ].join('\n')
}

module.exports = {
  buildBasicFallbackEn,
  buildDeepFallbackEn,
  DISCLAIMER_EN,
  LOCAL_TAG
}
