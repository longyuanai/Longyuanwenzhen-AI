// utils/dayunPrompt.js - 大运阶段解读提示词构造
//
// 设计动机：dayun_segment / dayun_full 两个付费档的提示词构造，沿用
// promptBuilder.js 的【已确定结论】+【古籍依据】+ COMMON_RULES 三段式。
// 区别：注入的不是 mingju(全局),而是 dayun 段论断对象(单段或全卷)。
//
// 安全：所有结论由 utils/dayun.js 服务端确定性算出,AI 只翻译,绝不重推。

const { formatKnowledgeContext, COMMON_RULES } = require('./promptBuilder')

/**
 * 把单段大运论断格式化为提示词中的"已确定结论"区块
 */
function formatSegmentFacts(seg) {
  return [
    '【以下为系统确定性计算的大运段结论，必须严格采用】',
    `段索引：第 ${seg.segmentIndex + 1} 段（共 8 段）`,
    `大运干支：${seg.ganZhi}`,
    `年龄区间：${seg.ageRange}`,
    `起止年份：${seg.startYear} - ${seg.endYear}`,
    `天干十神：${seg.tianGanShen} | 地支十神：${seg.diZhiShen}`,
    `该段帮扶：${seg.support} | 克伐：${seg.drain} | 比例：${(seg.ratio * 100).toFixed(0)}%`,
    `吉凶倾向：${seg.leanText}`,
    `判定依据：${seg.basis.join('；')}`
  ].join('\n')
}

/**
 * 把全卷(8 段)摘要格式化为表格
 */
function formatFullFacts(fullList, mingju) {
  const rows = fullList.map((s) => {
    const flag = s.lean === 'xi' ? '★喜' : s.lean === 'ji' ? '⚠忌' : '·平'
    return `  ${s.segmentIndex + 1}. ${s.ganZhi}(${s.ageRange})  ${flag}  ${(s.ratio * 100).toFixed(0)}%  天干${s.tianGanShen}/地支${s.diZhiShen}`
  })
  return [
    '【以下为系统确定性计算的 8 段大运全卷，必须严格采用】',
    `日主：${mingju.dayMaster.gan}${mingju.dayMaster.element}（${mingju.strength.label}）`,
    '段序  干支(年龄)        倾向  比例  十神',
    rows.join('\n')
  ].join('\n')
}

/**
 * 单段大运深度解读提示词
 * @param {string} baziStr
 * @param {object} mingju
 * @param {object} seg   analyzeDayunSegment() 输出
 * @param {Array}  [knowledgeContext]
 */
function buildDayunSegmentPrompt(baziStr, mingju, seg, knowledgeContext) {
  const kcBlock = formatKnowledgeContext(knowledgeContext)
  return [
    '你是一位专业的八字命理师，请根据系统已算定的命理与该大运段结论，针对这一段 10 年运势做深度解读。',
    '',
    `八字：${baziStr}`,
    formatSegmentFacts(seg),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    '请从以下方面展开：',
    `1. 该段 ${seg.ageRange}（${seg.startYear}-${seg.endYear}）的整体运势基调`,
    '2. 事业财运走向',
    '3. 感情婚姻走向',
    '4. 健康注意事项',
    '5. 该段流年内的应对建议（结合喜忌神方向）',
    '',
    COMMON_RULES
  ].join('\n')
}

/**
 * 全卷大运(8 段)概览提示词
 * @param {string} baziStr
 * @param {object} mingju
 * @param {Array}  fullList  analyzeDayunFull() 输出
 * @param {Array}  [knowledgeContext]
 */
function buildDayunFullPrompt(baziStr, mingju, fullList, knowledgeContext) {
  const kcBlock = formatKnowledgeContext(knowledgeContext)
  return [
    '你是一位专业的八字命理师，请根据系统已算定的 8 段大运全卷，给出人生阶段总览与转折点提示。',
    '',
    `八字：${baziStr}`,
    formatFullFacts(fullList, mingju),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    '请从以下方面展开：',
    '1. 各阶段运势起伏总览（按段序简述）',
    '2. 关键转折点：喜神段与忌神段的衔接处',
    '3. 终身事业方向建议',
    '4. 终身财务节奏建议',
    '5. 终身健康风险提示',
    '',
    COMMON_RULES
  ].join('\n')
}

module.exports = {
  formatSegmentFacts,
  formatFullFacts,
  buildDayunSegmentPrompt,
  buildDayunFullPrompt
}