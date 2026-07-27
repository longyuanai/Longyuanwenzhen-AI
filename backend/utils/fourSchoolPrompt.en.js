// utils/fourSchoolPrompt.en.js - 四家并列解读的英文提示词
//
// 与 fourSchoolPrompt.js 同结构，但有一个关键的产品性改动：
//
//   中文版的分段标题是「徐乐吾派 / 梁湘润派 / 袁树珊派 / 韦千里派」——
//   这四个名字在中文命理圈是权威背书，对英文读者**完全没有意义**，
//   直接音译过去只会让人一头雾水，差异化卖点当场失效。
//
//   所以英文版改成「方法论领先，人名作为出处附注」：
//     Structural & Climatic Method (after Xu Leyu, 1886-1949)
//   读者先看懂"这一派看什么"，再知道"这是谁的体系"。
//
// 检索侧不变：RAG 语料是中文古籍，query 继续用 fourSchoolPrompt.js 的中文版，
// 只有提示词与输出是英文。故本模块不导出 query 构造函数，调用方复用中文的。

const T = require('./i18n/baziTerms')
const { formatMingliFactsEn, COMMON_RULES_EN } = require('./promptBuilder.en')

// 四家的英文呈现：方法论在前，人名与代表作在后
const SCHOOLS_EN = {
  xu: {
    title: 'Structural & Climatic Method',
    attribution: 'after Xu Leyu (1886-1949)',
    sources: 'Zi Ping Zhen Quan (annotated), Qiong Tong Bao Jian (annotated), Di Tian Sui',
    focus: [
      'Read this chart through the structural-and-climatic lens. Address, in order:',
      '  (a) whether the chart structure is intact or broken, and what completes it;',
      '  (b) how the supporting element pairs with the structure;',
      '  (c) whether the climatic (Tiao Hou) chain is complete — i.e. whether the',
      '      season-driven need is actually met by something present in the chart;',
      '  (d) the substance-and-function relationship (ti yong) of the chart.'
    ].join('\n')
  },
  liang: {
    title: 'Three-Track & Symbolic Stars Method',
    attribution: 'after Liang Xiangrun (1932-2010)',
    sources: 'Zi Ping Teaching Materials, Shen Sha Tan Yuan',
    focus: [
      'Read this chart through the three-track lens. Address:',
      '  (a) the three tracks — auspicious/inauspicious indicators, structure, and',
      '      climatic need — kept separate rather than blended;',
      '  (b) the practical "Jin Bu Huan" reading rules;',
      '  (c) the symbolic stars (Shen Sha) that apply, and their operational meaning.',
      'Note for the reader: symbolic stars are traditional markers, not predictions.'
    ].join('\n')
  },
  yuan: {
    title: 'Palace, Minor Limits & Sound-Element Method',
    attribution: 'after Yuan Shushan (1881-1952)',
    sources: 'Ming Li Tan Yuan, Yuan Shi Ming Pu',
    focus: [
      'Read this chart through the classical-almanac lens. Address:',
      '  (a) the Life Palace as a supplementary pillar;',
      '  (b) minor limits and annual cycles;',
      '  (c) the Na Yin (sound) element of each pillar;',
      '  (d) any transformation of elements. Cite which device each point comes from.',
      'This school is discursive by nature — give fuller reasoning here than elsewhere.'
    ].join('\n')
  },
  wei: {
    title: 'Eight-Step Method',
    attribution: 'after Wei Qianli (1911-1988)',
    sources: 'Qian Li Ming Gao, Ba Zi Ti Yao',
    focus: [
      'Read this chart through the eight-step sequence, one short paragraph each:',
      '  strength → structure → governing element → favorable/unfavorable →',
      '  luck periods → family relations → temperament → career.',
      'This school is deliberately terse. Be concise; do not elaborate beyond the point.'
    ].join('\n')
  }
}

/**
 * 单家分段（英文）
 * @param {string} school 'xu'|'liang'|'yuan'|'wei'
 * @param {Array}  refs   该家 retrieve() 结果（中文古籍片段，可为空）
 */
function formatSchoolSectionEn(school, refs) {
  const s = SCHOOLS_EN[school]
  if (!s) return ''

  const lines = [
    '═══════════════════════════════════════════',
    `  ${s.title}`,
    `  ${s.attribution} — ${s.sources}`,
    '═══════════════════════════════════════════',
    '',
    s.focus,
    ''
  ]

  if (Array.isArray(refs) && refs.length > 0) {
    lines.push('[Source passages for this school — Classical Chinese, restate in English]')
    refs.forEach((r, i) => {
      const src = r.source ? ` (${r.source})` : ''
      const score = typeof r.score === 'number' ? ` [relevance ${r.score.toFixed(2)}]` : ''
      lines.push(`  ${i + 1}.${src}${score}\n     ${r.content}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 四家并列解读完整提示词（英文）
 *
 * @param {string} baziStr
 * @param {string} dayunStr
 * @param {object} mingju
 * @param {Object} [knowledgeBySchool] { xu:[], liang:[], yuan:[], wei:[] }
 * @returns {string}
 */
function buildFourSchoolPromptEn(baziStr, dayunStr, mingju, knowledgeBySchool) {
  const kc = (knowledgeBySchool && typeof knowledgeBySchool === 'object') ? knowledgeBySchool : {}
  const luck = String(dayunStr).trim().split(/\s+/).map(T.pillar).join(' → ')

  return [
    'You are a professional BaZi (Four Pillars of Destiny) consultant writing for an',
    'English-speaking reader. Four distinct classical methods are applied to the SAME',
    'chart below. Read the chart once through each method separately, then synthesise.',
    '',
    'Each section must stay strictly inside its own method — do not borrow another',
    "school's devices. The value of this format is precisely that the four readings",
    'are independent and can therefore agree or disagree.',
    '',
    `Four Pillars: ${T.pillars(baziStr)}`,
    `Luck Pillars (Da Yun): ${luck}`,
    '',
    formatMingliFactsEn(mingju),
    '',
    '──────────────────────────────────────────',
    '  FOUR PARALLEL READINGS',
    '──────────────────────────────────────────',
    '',
    formatSchoolSectionEn('xu', kc.xu),
    formatSchoolSectionEn('liang', kc.liang),
    formatSchoolSectionEn('yuan', kc.yuan),
    formatSchoolSectionEn('wei', kc.wei),
    '',
    '──────────────────────────────────────────',
    '  SYNTHESIS',
    '──────────────────────────────────────────',
    '',
    'Now synthesise the four readings:',
    '1. Where do all four agree?',
    '2. Where do they diverge — and is the divergence a difference of method, or of',
    '   which part of the chart each method weights most heavily?',
    '3. Overall: the core character of this chart, the elements that matter most, and',
    '   what a person might reasonably do with that information.',
    '',
    '[Method boundaries — crossing them makes the reading invalid]',
    '- Structural & Climatic: structure, supporting element, climatic chain, ti-yong.',
    '- Three-Track: the three tracks kept separate, Jin Bu Huan rules, symbolic stars.',
    '- Palace & Sound-Element: Life Palace, minor limits, Na Yin, transformations —',
    '  and say which device each claim rests on.',
    '- Eight-Step: the fixed eight-step sequence, terse throughout.',
    '',
    COMMON_RULES_EN,
    '- Name each school by its METHOD first; the attributed master is context, not',
    '  authority. Do not assume the reader has heard of any of them.'
  ].join('\n')
}

module.exports = {
  buildFourSchoolPromptEn,
  formatSchoolSectionEn,
  SCHOOLS_EN
}
