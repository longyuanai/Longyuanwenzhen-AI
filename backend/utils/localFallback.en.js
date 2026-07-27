// utils/localFallback.en.js - 英文本地降级模板
//
// 与 utils/localFallback.js 同职责：AI 网关超时/失败/配错 key 时，直接基于
// utils/mingju.js 的确定性论断拼出可读段落，不让用户卡在报错上。
//
// 覆盖 5 条路径，与中文版一一对应：
//   basic / deep / four-school / dayun-segment / dayun-full
// 每条各自成文，绝不共用一段换个标题 —— 用户在四家解读页看到基础解读的
// 内容，比看到报错更伤信任。
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

// 四家的方法论一句话概括（与 fourSchoolPrompt.en.js 的 SCHOOLS_EN 对齐，
// 但这里只保留降级模板讲得清的部分：AI 不可用时给不出四段独立解读，
// 只能如实说明每派会看什么，并给出共通的确定性结论）
const SCHOOL_BRIEFS_EN = [
  ['Structural & Climatic Method (after Xu Leyu)',
    'weighs whether the chart structure is intact and whether the season-driven '
    + 'need is actually met by something present in the chart'],
  ['Three-Track & Symbolic Stars Method (after Liang Xiangrun)',
    'keeps auspicious indicators, structure and climatic need on separate tracks '
    + 'rather than blending them'],
  ['Palace, Minor Limits & Sound-Element Method (after Yuan Shushan)',
    'adds the Life Palace, minor limits and the Na Yin element as supplementary readings'],
  ['Eight-Step Method (after Wei Qianli)',
    'runs a fixed sequence: strength, structure, governing element, favorable/unfavorable, '
    + 'luck periods, family, temperament, career']
]

/**
 * 四家并列解读降级模板（英文）
 *
 * AI 不可用时给不出四段独立解读 —— 那需要模型按各派方法论分别推演。
 * 这里如实说明情况：列出四派各自的关注点 + 共通的确定性结论，
 * 并明确告知这不是完整的四家解读，而非拿一段通用文字冒充四段。
 */
function buildFourSchoolFallbackEn({ baziStr, dayunStr, mingju }) {
  const { xi, ji } = favorUnfavor(mingju)
  const lines = [
    LOCAL_TAG,
    'Note: a full four-school reading requires the AI service, because each school '
      + 'reasons through the chart by its own method. What follows is the shared '
      + 'deterministic analysis plus what each school would focus on — not four '
      + 'independent readings.',
    '',
    `Four Pillars: ${T.pillars(baziStr)}`,
    dayunStr
      ? `Luck Pillars: ${String(dayunStr).trim().split(/\s+/).map(T.pillar).join(' → ')}`
      : null,
    '',
    'Shared findings (identical across all four schools — these are computed, not interpreted):',
    `  Day Master: ${T.gan(mingju.dayMaster.gan)}, ${strengthLine(mingju)}`,
    `  Structure: ${T.geju(mingju.geju.name)}`,
    `  Favorable: ${xi} | Unfavorable: ${ji}`,
    `  Climatic balance: ${tiaoHouLine(mingju)}`,
    `  Elemental weights: ${weightsLine(mingju)}`,
    '',
    'What each school would examine:'
  ].filter((x) => x !== null)

  SCHOOL_BRIEFS_EN.forEach(([title, brief], i) => {
    lines.push(`  ${i + 1}. ${title}`)
    lines.push(`     ${brief}.`)
  })

  const conflict = conflictsLine(mingju)
  if (conflict) {
    lines.push('', conflict)
  }

  lines.push(
    '',
    'Please retry shortly for the full parallel reading.',
    '',
    basisAppendix(mingju),
    '',
    DISCLAIMER_EN
  )
  return lines.join('\n')
}

/**
 * 单段大运降级模板（英文）
 */
function buildDayunSegmentFallbackEn({ baziStr, mingju, seg }) {
  const { xi, ji } = favorUnfavor(mingju)
  const tilt = seg.lean === 'xi'
    ? `leans toward this chart's favorable elements (${xi})`
    : seg.lean === 'ji'
      ? `leans toward this chart's unfavorable elements (${ji})`
      : 'shows no strong tilt either way'

  return [
    LOCAL_TAG,
    `Four Pillars: ${T.pillars(baziStr)}`,
    '',
    `Luck period ${seg.segmentIndex + 1} of 8 — ${T.pillar(seg.ganZhi)}`,
    `Ages ${T.ageRange(seg.ageRange)} (calendar years ${seg.startYear}-${seg.endYear})`,
    '',
    'What the engine computed for this period:',
    `  Ten God on the stem: ${T.tenGod(seg.tianGanShen)}`,
    `  Ten God on the branch: ${T.tenGod(seg.diZhiShen)}`,
    `  Support vs drain: ${seg.support} vs ${seg.drain} (${(seg.ratio * 100).toFixed(0)}%)`,
    `  Overall: this period ${tilt}.`,
    '',
    'Reading it practically:',
    seg.lean === 'xi'
      ? `  A period tilted toward ${xi} tends to be one where effort compounds more `
        + 'readily. Traditionally this is when to build rather than consolidate.'
      : seg.lean === 'ji'
        ? `  A period tilted toward ${ji} tends to ask for more effort per unit of `
          + 'result. Traditionally this is when to consolidate rather than over-extend.'
        : '  A period without a strong tilt tends to reward whatever direction is '
          + 'already established, rather than forcing a change.',
    `  Either way, choices aligned with ${xi} tend to sit better with this chart.`,
    '',
    'A fuller reading (career, relationships, health, year-by-year guidance) requires',
    'the AI service — please retry shortly.',
    '',
    'Derivation notes for this period (engine output, in Chinese):',
    ...seg.basis.map((b, i) => `  ${i + 1}. ${b}`),
    '',
    DISCLAIMER_EN
  ].join('\n')
}

/**
 * 大运全卷降级模板（英文）
 */
function buildDayunFullFallbackEn({ baziStr, mingju, fullList }) {
  const { xi, ji } = favorUnfavor(mingju)

  const rows = fullList.map((s) => {
    const tilt = s.lean === 'xi' ? 'supportive ' : s.lean === 'ji' ? 'challenging' : 'neutral    '
    return `  ${String(s.segmentIndex + 1).padStart(2)}. ${T.pillar(s.ganZhi).padEnd(34)} `
      + `ages ${T.ageRange(s.ageRange).padEnd(10)} ${tilt}  ${String((s.ratio * 100).toFixed(0)).padStart(3)}%`
  })

  // 转折点：相邻两段倾向变号处，这是全卷解读里最有信息量的部分
  const turns = []
  for (let i = 1; i < fullList.length; i++) {
    const prev = fullList[i - 1]
    const cur = fullList[i]
    if (prev.lean !== cur.lean && (prev.lean === 'xi' || cur.lean === 'xi'
      || prev.lean === 'ji' || cur.lean === 'ji')) {
      turns.push(`  Around age ${T.ageRange(cur.ageRange).split('-')[0]}: `
        + `${T.pillar(prev.ganZhi)} → ${T.pillar(cur.ganZhi)}`)
    }
  }

  return [
    LOCAL_TAG,
    `Four Pillars: ${T.pillars(baziStr)}`,
    `Day Master: ${T.gan(mingju.dayMaster.gan)} — ${strengthLine(mingju)}`,
    `Favorable: ${xi} | Unfavorable: ${ji}`,
    '',
    'All 8 luck periods:',
    '',
    '   #  Luck Pillar                        Ages       Tilt         Ratio',
    rows.join('\n'),
    '',
    'Transition points (where the tilt changes — traditionally these hinges matter',
    'more than the periods themselves):',
    turns.length ? turns.join('\n') : '  No sharp reversals across the eight periods.',
    '',
    'A fuller reading (career direction, financial rhythm, health themes across the',
    'whole span) requires the AI service — please retry shortly.',
    '',
    basisAppendix(mingju),
    '',
    DISCLAIMER_EN
  ].join('\n')
}

module.exports = {
  buildBasicFallbackEn,
  buildDeepFallbackEn,
  buildFourSchoolFallbackEn,
  buildDayunSegmentFallbackEn,
  buildDayunFullFallbackEn,
  DISCLAIMER_EN,
  LOCAL_TAG
}
