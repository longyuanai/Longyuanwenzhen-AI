// utils/fourSchoolPrompt.js - 四家命理大师并列解读 prompt 构造
//
// 产品差异化护城河：同一盘由徐乐吾 / 梁湘润 / 袁树珊 / 韦千里
// 四家方法论分别解读,产品侧展示四段并列视角 + AI 综合。
//
// 架构：
//   analyzeMingju() → 四家 query 构造（不同侧重） → retrieve() × 4（可并发）
//   → buildFourSchoolPrompt(mingju, dayun, knowledgeBySchool)
//   → AI 一次出 4 段 + 综合
//
// 关键约束：
//   - 四家 query 要不同侧重,否则检索回来的都是同一些片段,失去并列视角价值
//   - 单家 RAG 失败 / 超时 → 该家降级为空（不抛错,不阻塞其他家）
//   - 整体 prompt 必须显式说明四家方法论边界,防 AI 跨家乱串
//   - 调用方负责 knowledgeBySchool 的并发拉取和超时控制

const { formatMingliFacts } = require('./promptBuilder')

/**
 * 给四家各自构造不同侧重的查询语,供 retrieve() 用
 *
 * @param {object} mingju analyzeMingju() 输出
 * @returns {Object<string,string>}
 *   key 是学派名('xu'|'liang'|'yuan'|'wei'),value 是自然语言查询
 */
function buildFourSchoolQueries(mingju) {
  const { dayMaster, strength, yongShen, geju } = mingju
  const element = dayMaster.element
  const gan = dayMaster.gan
  const xi = yongShen.xiShen.join('') || '无'
  const ji = yongShen.jiShen.join('') || '无'
  const th = yongShen.tiaoHou
  const tiao = th.need.length
    ? `${th.season}月调候喜${th.need.join('')}${th.urgent ? '(急用)' : ''}`
    : '无显著调候需求'

  // 徐乐吾:格局+调候+体用 视角(造化元钥五系统、滴天髓体用精神)
  const xu = `${gan}${element}日主,${strength.label},格局"${geju.name}",喜用神"${xi}",忌神"${ji}",${tiao}。`
    + '请按徐乐吾《子平真诠评注》《穷通宝鉴评注》方法论,从格局成败、相神配合、调候用神链是否完整、体用精神四方面展开。'

  // 梁湘润:三轨/金不换/神煞 视角
  const liang = `${gan}${element}日主${geju.name}。`
    + '请按梁湘润《子平教材》《神煞探原》方法论,从神煞三轨(吉凶/格局/调候)、金不换断法、神煞探原的实操规则三方面展开。'

  // 袁树珊:命宫+小限+十六字+纳音 视角
  const yuan = `${gan}${element}日主${geju.name},八字四柱。`
    + '请按袁树珊《命理探原》《袁氏命谱》方法论,从命宫补柱、小限流年、纳音五行、化气五行四方面展开,博引详述。'

  // 韦千里:八步法 视角
  const wei = `${gan}${element}日主,${strength.label},格局"${geju.name}",喜用神"${xi}"。`
    + '请按韦千里《千里命稿》《八字提要》八步法(强弱→格局→用神→喜忌→岁运→六亲→性情→事业)逐项精炼展开,点到为止。'

  return { xu, liang, yuan, wei }
}

/**
 * 格式化单家结果（一段）
 *
 * @param {string} school        学派: 'xu'|'liang'|'yuan'|'wei'
 * @param {string} promptSchool  该家在 prompt 中的「提示语」(方法论焦点)
 * @param {Array}  refs          retrieve() 返回的古籍片段(可为空)
 */
function formatSchoolSection(school, promptSchool, refs) {
  const titleMap = {
    xu: '【徐乐吾派】格局·调候·体用 —— 派生于《子平真诠评注》《穷通宝鉴评注》《滴天髓补注》',
    liang: '【梁湘润派】三轨·金不换·神煞 —— 派生于《子平教材》《神煞探原》',
    yuan: '【袁树珊派】命宫·小限·纳音 —— 派生于《命理探原》《袁氏命谱》',
    wei: '【韦千里派】八步法 —— 派生于《千里命稿》《八字提要》'
  }

  const lines = [
    '═══════════════════════════════════════════',
    `  ${titleMap[school] || school}`,
    '═══════════════════════════════════════════',
    '',
    promptSchool,
    ''
  ]

  if (Array.isArray(refs) && refs.length > 0) {
    lines.push('【该派古籍依据】')
    refs.forEach((r, i) => {
      const src = r.source ? `(${r.source})` : ''
      const score = typeof r.score === 'number' ? `[相关度 ${r.score.toFixed(2)}]` : ''
      lines.push(`  ${i + 1}.${src}${score}\n     ${r.content}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 构造「四家并列解读」完整 prompt
 *
 * @param {string} baziStr   四柱字符串
 * @param {string} dayunStr  大运字符串
 * @param {object} mingju    analyzeMingju() 输出
 * @param {Object} [knowledgeBySchool] 四家各自 retrieve() 结果,如：
 *   { xu: [...], liang: [...], yuan: [...], wei: [...] }
 *   缺省或某家缺/空数组 → 不注入该家古籍区块,优雅降级
 * @returns {string}
 */
function buildFourSchoolPrompt(baziStr, dayunStr, mingju, knowledgeBySchool) {
  const queries = buildFourSchoolQueries(mingju)
  const kcMap = (knowledgeBySchool && typeof knowledgeBySchool === 'object') ? knowledgeBySchool : {}

  const sections = [
    '你是一位专业的八字命理师。请按以下四个命理学派的方法论,分别为同一命盘独立解读,',
    '最后再综合四家观点给出整体判断。每家解读必须**严格遵循该派方法论**,不得混用其他派的工具。',
    '',
    `命盘：${baziStr}`,
    `大运：${dayunStr}`,
    formatMingliFacts(mingju),
    '',
    '──────────────────────────────────────────',
    '  ★ 四家并列解读',
    '──────────────────────────────────────────',
    '',
    formatSchoolSection('xu', queries.xu, kcMap.xu),
    formatSchoolSection('liang', queries.liang, kcMap.liang),
    formatSchoolSection('yuan', queries.yuan, kcMap.yuan),
    formatSchoolSection('wei', queries.wei, kcMap.wei),
    '',
    '──────────────────────────────────────────',
    '  ★ AI 综合(根据四家观点)',
    '──────────────────────────────────────────',
    '',
    '现在请你综合四家观点：',
    '1. 四家共识是什么？',
    '2. 四家分歧在哪？分歧的原因是方法论差异还是对命盘不同要素的侧重？',
    '3. 综合判断：此人命局的核心特征、关键喜忌、人生建议。',
    '',
    '【四家方法论边界(必须遵守,混用即视为不合格)】',
    '- 徐乐吾:用其格局+调候+体用框架,引子平真诠/穷通宝鉴/滴天髓原文',
    '- 梁湘润:用其三轨金不换/神煞探原体系,引梁氏讲义原文',
    '- 袁树珊:可用命宫/小限/纳音/化气,但要标注来源',
    '- 韦千里:走八步法,简洁精炼不铺陈,引千里命稿原文',
    '',
    '要求：',
    '- 严格基于【已确定结论】展开,不得改动喜用神、忌神、身强弱、格局的判定。',
    '- 使用"可能""倾向于""容易"等非绝对化表述,禁止"必定""一定""注定"。',
    '- 每家解读都要回扣该派方法论与【已确定结论】,不臆测、不编造。',
    '- 语言通俗易懂,兼顾专业性与文化底蕴。'
  ]

  return sections.join('\n')
}

module.exports = {
  buildFourSchoolPrompt,
  buildFourSchoolQueries,
  formatSchoolSection
}
