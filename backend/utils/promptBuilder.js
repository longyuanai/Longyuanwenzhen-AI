// utils/promptBuilder.js - AI 解读提示词构造
//
// 核心原则：身强弱/喜忌/格局由代码确定性算出，作为【不可修改的已知结论】注入提示词。
// AI 只负责把确定结论翻译成通俗专业的自然语言，禁止重新推导命理、禁止绝对化表述。

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
 */
function buildBasicPrompt(baziStr, mingju) {
  return [
    '你是一位专业的八字命理师，请根据系统已算定的命理结论，提供基础命理解读。',
    '',
    `八字：${baziStr}`,
    formatMingliFacts(mingju),
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
 */
function buildDeepPrompt(baziStr, dayunStr, mingju) {
  return [
    '你是一位专业的八字命理师，请根据系统已算定的命理结论，提供详细的命理分析报告。',
    '',
    `八字：${baziStr}`,
    `大运：${dayunStr}`,
    formatMingliFacts(mingju),
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

module.exports = { formatMingliFacts, buildBasicPrompt, buildDeepPrompt, COMMON_RULES }
