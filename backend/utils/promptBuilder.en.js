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
/**
 * 神煞区块（英文）。mingju.shenSha 缺省时整块不出现。
 *
 * 与中文侧同样要压分量：不加约束，模型会围着 "Heavenly Noble" 大写特写，
 * 把格局与喜忌挤没。英文读者对这类星曜名尤其容易当真。
 */
function formatShenShaLinesEn(shenSha) {
  if (!shenSha) return []
  const p = (k) => T.PALACE[k]
  const lines = [
    `${p('mingGong')}: ${T.pillar(shenSha.mingGong.gan + shenSha.mingGong.zhi)}`,
    `${p('shenGong')}: ${T.pillar(shenSha.shenGong.gan + shenSha.shenGong.zhi)}`,
    `Void branches (Kong Wang): ${shenSha.kongWang.map(T.zhi).join(', ')}`
  ]
  if (shenSha.list.length) {
    lines.push('Symbolic stars (Shen Sha) present:')
    for (const s of shenSha.list) {
      lines.push(`  - ${T.shenSha(s.name)} — on ${s.pillars.map(T.pillarName).join(', ')}`)
    }
  } else {
    lines.push('Symbolic stars (Shen Sha): none of note')
  }
  lines.push(
    'Constraint on Shen Sha: treat these as secondary colour only. Never build a',
    'prediction on them, and never let them override structure or favorable elements.')
  return lines
}

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
    ...formatShenShaLinesEn(mingju.shenSha),
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

// 英文输出里的日主声明可能是这些形态：
//   "Day Master is Ren (Yang Water)"  "the Ren Water Day Master"
//   "Day Master: Yang Water"          "Your Day Master, Ren, ..."
// 只在 "Day Master" 附近的窗口里找，否则会误伤正文里满地都是的五行词
// （favorable elements、elemental weights 那些）。
const GAN_PINYIN = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui']
const ELEMENT_EN = ['Wood', 'Fire', 'Earth', 'Metal', 'Water']

// "Day Master" 前后各 40 字符的窗口
const DM_WINDOW = new RegExp(
  `(.{0,40}\\bDay Master\\b.{0,40})`,
  'gi'
)

/**
 * 英文版 AI 输出校验：从输出里提取日主声明，与 mingju.dayMaster 比对。
 *
 * 与中文版同样的哲学：找不到声明 → 放过（模型可能通篇没显式点名日主）；
 * 找到且矛盾 → warn 但仍返原文，不影响用户看到内容。
 *
 * 中文版靠 "日主：甲木" 这种紧凑写法，正则很好写；英文句式松散得多，
 * 所以改为「窗口内取词 + 集合比对」而不是逐字匹配。
 *
 * @param {object} mingju
 * @param {string} content
 * @param {object} [logger]
 * @returns {{ ok:boolean, mismatch:string|null, content:string }}
 */
function validateAiOutputEn(mingju, content, logger) {
  const log = logger || { warn: (msg) => console.warn(msg) }
  const dm = mingju.dayMaster
  const expectedPinyin = (T.GAN[dm.gan] || {}).pinyin // 如 'Ren'
  const expectedElement = T.element(dm.element)       // 如 'Water'

  const text = String(content || '')
  const windows = text.match(DM_WINDOW) || []
  if (windows.length === 0) return { ok: true, mismatch: null, content }

  let mismatch = null
  for (const w of windows) {
    // 窗口里出现的干拼音与五行词
    const gans = GAN_PINYIN.filter((g) => new RegExp(`\\b${g}\\b`).test(w))
    const els = ELEMENT_EN.filter((e) => new RegExp(`\\b${e}\\b`, 'i').test(w))

    // 出现了别的天干 → 明确矛盾
    const wrongGan = gans.find((g) => g !== expectedPinyin)
    if (wrongGan) { mismatch = wrongGan; break }

    // 没提天干但提了五行，且全都不是日主五行 → 矛盾
    // （只提到一个且不对才算，提到多个可能是在讲喜忌而非日主）
    if (gans.length === 0 && els.length === 1 && els[0].toLowerCase() !== expectedElement.toLowerCase()) {
      mismatch = els[0]
      break
    }
  }

  if (mismatch) {
    log.warn(
      `[AI check] Day Master declared as "${mismatch}" contradicts the computed `
      + `"${expectedPinyin} (${expectedElement})"; system conclusion stands`
    )
  }
  return { ok: mismatch === null, mismatch, content }
}

module.exports = {
  formatMingliFactsEn,
  formatKnowledgeContextEn,
  buildBasicPromptEn,
  buildDeepPromptEn,
  validateAiOutputEn,
  COMMON_RULES_EN
}
