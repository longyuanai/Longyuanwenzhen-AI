// utils/checkupSummary.js - 免费体检页"一句点评"确定性生成
//
// 不调 AI：基于日主五行 + 身强弱 + 突出十神，确定性拼一句有结构依据的点评。
// 玄学红线：只用"多/易/宜/倾向"等非绝对措辞，不出宿命断言。

const DAY_TRAIT = {
  木: '木命之人多仁厚向上、有恻隐之心，重成长与体面',
  火: '火命之人多热情外放、反应敏捷，重表达与认同',
  土: '土命之人多稳重守信、能容能纳，偏务实保守',
  金: '金命之人多果断重义、讲求原则，偏刚直分明',
  水: '水命之人多机敏善思、灵活变通，心思细而广'
}

function strengthTone(label) {
  if (label.includes('强')) return '身旺则主见足、自驱力强，但易固执好胜、揽事上身，宜泄秀生财以收放自如'
  if (label.includes('弱')) return '身偏弱则敏感灵活、善于借力，但易受环境牵动，宜自立扎根、忌孤军独进'
  return '日主中和则刚柔较衡、适应力好，顺势而为多可成'
}

const SHISHEN_TONE = {
  比肩: '比劫偏旺，重朋友义气、行动力足，然财易聚散、合伙宜慎',
  劫财: '比劫偏旺，重朋友义气、行动力足，然财易聚散、合伙宜慎',
  食神: '食神透显，性情温和、富生活情趣与口福',
  伤官: '伤官透显，聪慧多才、表达欲强，然易心高语锐、思绪发散',
  正财: '财星透显，务实重利、机会感强，理财有道',
  偏财: '财星透显，为人大方、善抓机会，财来去较快',
  正官: '官星透显，自律守正、有责任担当',
  七杀: '杀星透显，有魄力能扛压，然易紧绷急躁',
  正印: '印星透显，好学有悟性、心地仁厚，易念多内省',
  偏印: '印星透显，悟性独到、内秀思深，易自处一隅'
}

// 统计四柱十神出现次数（排除日主自身），取最突出者
function topShiShen(tenGods) {
  const counts = {}
  for (const key of Object.keys(tenGods)) {
    const v = tenGods[key]
    if (!v || v === '日主') continue
    counts[v] = (counts[v] || 0) + 1
  }
  const keys = Object.keys(counts)
  if (!keys.length) return null
  return keys.sort((a, b) => counts[b] - counts[a])[0]
}

/**
 * 生成一句确定性点评（峰终定律的"峰"：制造"准"的体验）
 * @param {object} paipan paipan() 返回对象
 * @param {object} mingju analyzeMingju() 返回对象
 * @returns {string}
 */
function buildOneLiner(paipan, mingju) {
  const base = DAY_TRAIT[mingju.dayMaster.element] || ''
  const tone = strengthTone(mingju.strength.label)
  const top = topShiShen(paipan.tenGods)
  const shen = top ? SHISHEN_TONE[top] : ''
  const xi = (mingju.yongShen.xiShen || []).join('') || '喜用'
  const parts = [base, tone]
  if (shen) parts.push(shen)
  return parts.join('；') + `。命局${mingju.geju.name}，宜顺${xi}之性发挥。`
}

module.exports = { buildOneLiner }
