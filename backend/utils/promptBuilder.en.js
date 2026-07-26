// utils/promptBuilder.en.js - 英文市场提示词构造（可行性验证用）
//
// 与 promptBuilder.js 一一对应，同样的核心原则：
//   身强弱/喜忌/格局由代码确定性算出，作为【不可修改的已知结论】注入；
//   AI 只负责翻译成自然语言，禁止重新推导、禁止绝对化表述。
//
// 两个刻意的设计取舍：
//
// 1. mingju.basis[] 与 RAG 古籍片段**不翻译**，原样注入并告诉模型
//    "这些是中文的确定性判据/古典文献，请在英文输出中转述其含义"。
//    模型读中文、输出英文是它擅长的事；翻译这两块要么改动算法层
//    （风险高、影响 327 个测试），要么预译古籍语料（工作量巨大）。
//
// 2. 术语用英文八字圈的通行译法（Rob Wealth / Eating God / Seven Killings），
//    不自造词。目标读者是已接触过 Four Pillars 概念的人，用社区共识术语
//    才对得上；完全意译反而让懂行的人看不懂。
//
// 面向英文读者的额外约束（中文版没有的）：
//   - 禁止套用西方占星词汇（sun sign / house / planet），这是两套体系，
//     混用会让懂行的读者立刻判定不专业。
//   - 首次出现的专有概念要一句话解释，不能假设读者知道"调候"是什么。

const T = require('./i18n/baziTerms')

/**
 * 确定性论断 → 英文"已知结论"区块
 * @param {object} mingju analyzeMingju() 返回对象
 */
function formatMingliFactsEn(mingju) {
  const s = mingju.strength
  const th = mingju.yongShen.tiaoHou
  const dm = mingju.dayMaster

  const tiaoHou = th.need.length
    ? `${T.season(th.season)} birth; needs ${T.elements(th.need)}${th.urgent ? ' (urgent)' : ''}`
    : `${T.season(th.season)} birth; no significant climatic adjustment needed`

  const score = Object.entries(mingju.wuxingScore)
    .map(([el, v]) => `${T.element(el)} ${Number(v).toFixed(1)}`)
    .join(', ')

  return [
    '[SYSTEM-COMPUTED CONCLUSIONS — these are deterministic outputs of the engine.',
    ' You MUST adopt them verbatim. Do NOT re-derive, revise, or contradict them.]',
    `Day Master: ${T.gan(dm.gan)}`,
    `Strength: ${T.strength(s.label)} `
      + `(seasonal support: ${s.deLing ? 'yes' : 'no'}, `
      + `root in branches: ${s.deDi ? 'yes' : 'no'}, `
      + `stem allies: ${s.deShi ? 'yes' : 'no'})`,
    `Five-element weights: ${score}`,
    `Favorable elements: ${T.elements(mingju.yongShen.xiShen)}`,
    `Unfavorable elements: ${T.elements(mingju.yongShen.jiShen)}`,
    `Climatic balance (Tiao Hou): ${tiaoHou}`,
    `Chart structure (Ge Ju): ${T.geju(mingju.geju.name)}`
      + `${mingju.geju.isSpecial ? ' [special structure]' : ''}`
      + `${mingju.geju.isPure ? ' [clean/pure]' : ''}`,
    '',
    'Derivation notes from the engine (written in Chinese — restate their meaning',
    'in English where relevant; do not quote them verbatim in the output):',
    ...mingju.basis.map((b, i) => `  ${i + 1}. ${b}`)
  ].join('\n')
}

/**
 * RAG 检索结果 → 英文"古典文献"区块。
 * 片段是文言文，保留原文并说明用途，由模型转述。
 */
function formatKnowledgeContextEn(knowledgeContext) {
  if (!Array.isArray(knowledgeContext) || knowledgeContext.length === 0) return null

  const lines = [
    '[CLASSICAL SOURCES] The passages below were retrieved from classical Chinese',
    'BaZi texts via semantic search. They are in Classical Chinese — read them and',
    'draw on their reasoning, restating it in English. If any passage conflicts with',
    'the SYSTEM-COMPUTED CONCLUSIONS above, the system conclusions win.'
  ]
  knowledgeContext.forEach((item, i) => {
    const src = item.source ? ` (source: ${item.source})` : ''
    const score = typeof item.score === 'number' ? ` [relevance ${item.score.toFixed(2)}]` : ''
    lines.push(`${i + 1}.${src}${score}\n${item.content}`)
  })
  return lines.join('\n\n')
}

// 通用约束。前四条对齐中文版；后三条是英文读者特有的。
const COMMON_RULES_EN = [
  'Requirements:',
  '- Build strictly on the SYSTEM-COMPUTED CONCLUSIONS above. Never alter the',
  '  favorable/unfavorable elements, strength verdict, or chart structure.',
  '- Use hedged language ("tends to", "may", "is inclined toward"). Never use',
  '  "will definitely", "is destined to", or any absolute claim about the future.',
  '- Tie every point back to a stated BaZi rationale. Do not speculate or invent.',
  '- Frame this as a self-reflection tool grounded in a classical tradition, not',
  '  as fortune-telling or prediction.',
  '- Do NOT borrow Western astrology vocabulary (sun sign, houses, planets,',
  '  retrograde). BaZi is a separate system; mixing them reads as unserious.',
  '- On first use, explain each technical term in one clause — assume the reader',
  '  knows roughly what Four Pillars is but not what Tiao Hou or Ge Ju means.',
  '- Write in clear, natural English prose. No Chinese characters in the output',
  '  except pinyin term names already provided above.'
].join('\n')

/**
 * 基础解读提示词（英文）
 * @param {string} baziStr 四柱字符串，如 "壬午 辛亥 壬辰 乙巳"
 * @param {object} mingju  analyzeMingju() 返回对象
 * @param {Array}  [knowledgeContext] RAG 检索结果，可选
 */
function buildBasicPromptEn(baziStr, mingju, knowledgeContext) {
  const kcBlock = formatKnowledgeContextEn(knowledgeContext)
  return [
    'You are a professional BaZi (Four Pillars of Destiny) consultant writing for',
    'an English-speaking reader. The chart has already been calculated and analysed',
    'by a deterministic engine; your job is to explain those results, not to re-read',
    'the chart yourself.',
    '',
    `Four Pillars: ${T.pillars(baziStr)}`,
    '',
    formatMingliFactsEn(mingju),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    'Cover these three sections:',
    '1. Favorable elements — why these elements help this chart (tie it to the',
    '   strength verdict and the climatic balance), and what that means practically.',
    '2. Chart character — the main features of this chart, given its structure and',
    '   elemental distribution.',
    '3. Personality tendencies — grounded in the Day Master and the Ten God',
    '   configuration.',
    '',
    COMMON_RULES_EN
  ].join('\n')
}

/**
 * 深度报告提示词（英文）
 * @param {string} baziStr  四柱字符串
 * @param {string} dayunStr 大运字符串
 * @param {object} mingju   analyzeMingju() 返回对象
 * @param {Array}  [knowledgeContext] RAG 检索结果，可选
 */
function buildDeepPromptEn(baziStr, dayunStr, mingju, knowledgeContext) {
  const kcBlock = formatKnowledgeContextEn(knowledgeContext)
  const luck = String(dayunStr).trim().split(/\s+/).map(T.pillar).join(' → ')
  return [
    'You are a professional BaZi (Four Pillars of Destiny) consultant writing a',
    'detailed report for an English-speaking reader. The chart has already been',
    'calculated and analysed by a deterministic engine; explain those results.',
    '',
    `Four Pillars: ${T.pillars(baziStr)}`,
    `Luck Pillars (Da Yun, 10-year periods in order): ${luck}`,
    '',
    formatMingliFactsEn(mingju),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    'Cover these five sections:',
    '1. Overall reading of the chart (structure plus favorable elements).',
    '2. Career and wealth tendencies.',
    '3. Relationships.',
    '4. Health areas worth attention.',
    '5. Practical guidance — aligned with the favorable elements above.',
    '',
    COMMON_RULES_EN
  ].join('\n')
}

module.exports = {
  formatMingliFactsEn,
  formatKnowledgeContextEn,
  buildBasicPromptEn,
  buildDeepPromptEn,
  COMMON_RULES_EN
}
