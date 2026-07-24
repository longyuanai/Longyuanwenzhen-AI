// utils/promptBuilder.js - AI 解读提示词构造
//
// 核心原则：身强弱/喜忌/格局由代码确定性算出，作为【不可修改的已知结论】注入提示词。
// AI 只负责把确定结论翻译成通俗专业的自然语言，禁止重新推导命理、禁止绝对化表述。
//
// 可选第三参数：knowledgeContext（RAG 检索到的古籍依据）
//   来自 knowledgeRetriever.retrieve() 的返回值（数组或 undefined）。
//   注入为【古籍依据】区块；缺失或为空数组时优雅降级，不影响 prompt 构造。

/**
 * 把确定性论断对象格式化为提示词中的"已知结论"区块
 * @param {object} mingju analyzeMingju() 返回对象
 */
function formatMingliFacts(mingju) {
  const s = mingju.strength
  const th = mingju.yongShen.tiaoHou
  return [
    '【以下为系统确定性计算的命理结论，必须严格采用，不得修改、不得重新推导】',
    `日主：${mingju.dayMaster.gan}${mingju.dayMaster.element}`,
    `身强弱：${s.label}（得令${s.deLing ? '是' : '否'}、得地${s.deDi ? '是' : '否'}、得势${s.deShi ? '是' : '否'}）`,
    `喜用神（五行）：${mingju.yongShen.xiShen.join('、') || '无'}`,
    `忌神（五行）：${mingju.yongShen.jiShen.join('、') || '无'}`,
    `调候：${th.season}月，${th.need.length ? th.need.join('') + (th.urgent ? '（急用）' : '') : '无显著需求'}`,
    `格局：${mingju.geju.name}`,
    `判定依据：${mingju.basis.join('；')}`
  ].join('\n')
}

/**
 * 把 RAG 检索结果格式化为"古籍依据"区块。
 * 输入约定：knowledgeRetriever.retrieve() 返回的数组，元素形如：
 *   { content: '...', source: '《子平真诠》卷二', score: 0.82 }
 * 缺省或空数组时返回 null（调用方据此决定是否注入区块）。
 */
function formatKnowledgeContext(knowledgeContext) {
  if (!Array.isArray(knowledgeContext) || knowledgeContext.length === 0) return null

  const lines = [
    '【古籍依据】以下段落来自传统命理典籍（已通过知识图谱语义检索），可作为解读参考；'
      + '若与【已确定结论】冲突，以【已确定结论】为准。'
  ]
  knowledgeContext.forEach((item, i) => {
    const src = item.source ? `（${item.source}）` : ''
    const score = typeof item.score === 'number' ? ` [相关度 ${item.score.toFixed(2)}]` : ''
    lines.push(`${i + 1}.${src}${score}\n${item.content}`)
  })
  return lines.join('\n\n')
}

// 通用约束（对齐 spec 5.2.1.4/5：避免绝对化、每条结论须有命理依据）
const COMMON_RULES = [
  '要求：',
  '- 严格基于上述【已确定结论】展开，不得改动喜用神、忌神、身强弱、格局的判定。',
  '- 使用"可能""倾向于""容易"等非绝对化表述，禁止"必定""一定""注定"等绝对断言。',
  '- 每条解读都要回扣上述命理依据，不臆测、不编造。',
  '- 语言通俗易懂，兼顾专业性与文化底蕴，避免迷信色彩。'
].join('\n')

/**
 * 基础解读提示词
 * @param {string} baziStr  四柱字符串，如 "壬午 辛亥 壬辰 乙巳"
 * @param {object} mingju   analyzeMingju() 返回对象
 * @param {Array}  [knowledgeContext]  RAG 检索结果，可选
 */
function buildBasicPrompt(baziStr, mingju, knowledgeContext) {
  const kcBlock = formatKnowledgeContext(knowledgeContext)
  return [
    '你是一位专业的八字命理师，请根据系统已算定的命理结论，提供基础命理解读。',
    '',
    `八字：${baziStr}`,
    formatMingliFacts(mingju),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    '请从以下方面解读：',
    '1. 喜用神说明：解释为何以上述五行为喜用（结合身强弱与调候），以及对命主的现实意义。',
    '2. 命局特点：结合格局与五行旺衰，总结命局主要特征。',
    '3. 性格特征：基于十神配置与五行特点，分析性格倾向。',
    '',
    COMMON_RULES
  ].join('\n')
}

/**
 * 深度报告提示词
 * @param {string} baziStr  四柱字符串
 * @param {string} dayunStr 大运字符串，如 "甲寅 乙卯 丙辰"
 * @param {object} mingju   analyzeMingju() 返回对象
 * @param {Array}  [knowledgeContext]  RAG 检索结果，可选
 */
function buildDeepPrompt(baziStr, dayunStr, mingju, knowledgeContext) {
  const kcBlock = formatKnowledgeContext(knowledgeContext)
  return [
    '你是一位专业的八字命理师，请根据系统已算定的命理结论，提供详细的命理分析报告。',
    '',
    `八字：${baziStr}`,
    `大运：${dayunStr}`,
    formatMingliFacts(mingju),
    ...(kcBlock ? ['', kcBlock] : []),
    '',
    '请从以下方面详细解读：',
    '1. 命局总评（结合格局与喜用神）',
    '2. 事业财运分析',
    '3. 感情婚姻分析',
    '4. 健康运势分析',
    '5. 人生建议（应顺应喜用神五行方向）',
    '',
    COMMON_RULES
  ].join('\n')
}

// 日主行匹配正则:容许 "日主:甲木" / "日主为甲木" / "日主:甲" 后跟任意位置五行字符
const RI_ZHU_PATTERN = /日主[为:]?\s*([甲乙丙丁戊己庚辛壬癸])([金木水火土])?/g

/**
 * AI 输出解析校验:从 AI content 里提取"日主"声明,与 mingju.dayMaster 比对。
 * 不一致时 logger.warn 但仍返原 content(防御性日志,不影响用户体验)。
 *
 * @param {object} mingju  analyzeMingju() 返回对象
 * @param {string} content AI 返回文本
 * @param {object} [logger] 可选 logger;若不传走 console.warn
 * @returns {{ ok: boolean, mismatch: string|null, content: string }}
 */
function validateAiOutput(mingju, content, logger) {
  const log = logger || { warn: (msg) => console.warn(msg) }
  const expected = `${mingju.dayMaster.gan}${mingju.dayMaster.element}`
  const expectedGanOnly = mingju.dayMaster.gan
  const matches = []
  let m
  RI_ZHU_PATTERN.lastIndex = 0
  while ((m = RI_ZHU_PATTERN.exec(content)) !== null) {
    matches.push(`${m[1]}${m[2] || ''}`)
  }
  if (matches.length === 0) {
    return { ok: true, mismatch: null, content }
  }
  const mismatch = matches.find((decl) => decl !== expected && decl !== expectedGanOnly) || null
  if (mismatch) {
    log.warn(`[AI 校验] 日主声明 "${mismatch}" 与系统结论 "${expected}" 不符;以系统为准`)
  }
  return { ok: mismatch === null, mismatch, content }
}

module.exports = {
  formatMingliFacts,
  formatKnowledgeContext,
  buildBasicPrompt,
  buildDeepPrompt,
  validateAiOutput,
  COMMON_RULES
}