// utils/dayunPrompt.en.js - 大运阶段解读的英文提示词
//
// 与 dayunPrompt.js 同结构（已确定结论 + 古籍依据 + 通用约束三段式），
// 注入的是 utils/dayun.js 算出的段论断，AI 只翻译不重推。
//
// 英文侧的一个额外注意：大运是「十年一段的人生阶段」，英文读者对
// Da Yun 这个概念未必熟悉，首次出现要解释清楚它不是"预言未来"，
// 而是"传统体系里对不同人生阶段的分期与倾向标注"——这一点对
// 合规表述和产品调性都重要。

const T = require('./i18n/baziTerms')
const { formatKnowledgeContextEn, COMMON_RULES_EN } = require('./promptBuilder.en')

// 段倾向：xi=喜(顺)、ji=忌(逆)、其余为平
const LEAN_EN = {
  xi: 'supportive (the period leans toward the chart\'s favorable elements)',
  ji: 'challenging (the period leans toward the chart\'s unfavorable elements)',
  ping: 'neutral (no strong tilt either way)'
}

function leanText(seg) {
  return LEAN_EN[seg.lean] || LEAN_EN.ping
}

/**
 * 单段大运论断 → 英文"已确定结论"区块
 */
function formatSegmentFactsEn(seg) {
  return [
    '[SYSTEM-COMPUTED CONCLUSIONS for this luck period — adopt verbatim,',
    ' do not re-derive]',
    `Period: ${seg.segmentIndex + 1} of 8`,
    `Luck Pillar: ${T.pillar(seg.ganZhi)}`,
    `Ages covered: ${T.ageRange(seg.ageRange)}`,
    `Calendar years: ${seg.startYear} - ${seg.endYear}`,
    `Ten God on the stem: ${T.tenGod(seg.tianGanShen)} | on the branch: ${T.tenGod(seg.diZhiShen)}`,
    `Support vs drain in this period: ${seg.support} vs ${seg.drain} `
      + `(${(seg.ratio * 100).toFixed(0)}%)`,
    `Overall tilt: ${leanText(seg)}`,
    '',
    'Derivation notes from the engine (written in Chinese — restate their meaning',
    'in English where relevant; do not quote verbatim):',
    ...seg.basis.map((b, i) => `  ${i + 1}. ${b}`)
  ].join('\n')
}

/**
 * 全卷 8 段 → 英文摘要表
 */
function formatFullFactsEn(fullList, mingju) {
  const rows = fullList.map((s) => {
    const flag = s.lean === 'xi' ? 'SUPPORTIVE ' : s.lean === 'ji' ? 'CHALLENGING' : 'NEUTRAL    '
    return `  ${String(s.segmentIndex + 1).padStart(2)}. ${T.pillar(s.ganZhi).padEnd(34)} `
      + `ages ${T.ageRange(s.ageRange).padEnd(10)} ${flag} ${String((s.ratio * 100).toFixed(0)).padStart(3)}%  `
      + `${T.tenGod(s.tianGanShen)}/${T.tenGod(s.diZhiShen)}`
  })
  return [
    '[SYSTEM-COMPUTED CONCLUSIONS — all 8 luck periods, adopt verbatim]',
    `Day Master: ${T.gan(mingju.dayMaster.gan)} (${T.strength(mingju.strength.label)})`,
    '',
    '   #  Luck Pillar                        Ages       Tilt         Ratio  Ten Gods',
    rows.join('\n')
  ].join('\n')
}

// Da Yun 概念说明：英文读者未必知道，且关系到合规调性
const DAYUN_PRIMER = [
  'Context for the reader: "Luck Pillars" (Da Yun) divide a life into successive',
  '10-year periods. In the classical system each period is characterised by how its',
  'elements interact with the natal chart. This is a framework for thinking about',
  'life stages — it describes tendencies within a tradition, not events that will happen.'
].join('\n')

/**
 * 单段大运深度解读提示词（英文）
 */
function buildDayunSegmentPromptEn(baziStr, mingju, seg, knowledgeContext) {
  const kcBlock = formatKnowledgeContextEn(knowledgeContext)
  return [
    'You are a professional BaZi (Four Pillars of Destiny) consultant writing for an',
    'English-speaking reader. Give an in-depth reading of ONE 10-year luck period.',
    'The chart and this period have already been analysed by a deterministic engine;',
    'explain those results rather than re-reading the chart yourself.',
    '',
    DAYUN_PRIMER,
    '',
    `Four Pillars: ${T.pillars(baziStr)}`,
    `Day Master: ${T.gan(mingju.dayMaster.gan)} — ${T.strength(mingju.strength.label)}`,
    `Favorable: ${T.elements(mingju.yongShen.xiShen)} | `
      + `Unfavorable: ${T.elements(mingju.yongShen.jiShen)}`,
    '',
    formatSegmentFactsEn(seg),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    'Cover these five sections:',
    `1. The overall tone of ages ${T.ageRange(seg.ageRange)} (${seg.startYear}-${seg.endYear}).`,
    '2. Career and wealth through this period.',
    '3. Relationships through this period.',
    '4. Health areas worth attention.',
    '5. Practical guidance for this period, aligned with the favorable elements.',
    '',
    COMMON_RULES_EN
  ].join('\n')
}

/**
 * 全卷大运(8 段)概览提示词（英文）
 */
function buildDayunFullPromptEn(baziStr, mingju, fullList, knowledgeContext) {
  const kcBlock = formatKnowledgeContextEn(knowledgeContext)
  return [
    'You are a professional BaZi (Four Pillars of Destiny) consultant writing for an',
    'English-speaking reader. Give a life-stage overview across all 8 luck periods,',
    'highlighting the transitions. The analysis below is deterministic engine output;',
    'explain it rather than re-deriving it.',
    '',
    DAYUN_PRIMER,
    '',
    `Four Pillars: ${T.pillars(baziStr)}`,
    `Favorable: ${T.elements(mingju.yongShen.xiShen)} | `
      + `Unfavorable: ${T.elements(mingju.yongShen.jiShen)}`,
    '',
    formatFullFactsEn(fullList, mingju),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    'Cover these five sections:',
    '1. Period-by-period overview of how the tone shifts.',
    '2. Key transitions — where a supportive period meets a challenging one, or',
    '   vice versa. These hinges usually matter more than the periods themselves.',
    '3. Long-run career direction.',
    '4. Long-run financial rhythm — when to build, when to consolidate.',
    '5. Long-run health themes worth keeping an eye on.',
    '',
    COMMON_RULES_EN
  ].join('\n')
}

module.exports = {
  formatSegmentFactsEn,
  formatFullFactsEn,
  buildDayunSegmentPromptEn,
  buildDayunFullPromptEn,
  DAYUN_PRIMER
}
