// utils/wuxingScore.js - 五行力量打分
//
// 设计：以日主为参照，统计其余七字（天干 + 地支藏干）对日主的五行环境。
// 月令当令权重最高，藏干按本气/中气/余气分配。日主天干本身不计入帮扶分。
// 输出为确定性分数，供 wangShuai/yongShen 判定身强弱与喜忌，避免大模型瞎算。

const { WUXING } = require('./bazi')

const ELEMENTS = ['木', '火', '土', '金', '水']

// 五行相生：key 生 value（木生火，火生土……）
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }
// 五行相克：key 克 value（木克土，土克水……）
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }

// 位置基础权重（月令决定旺衰最甚，故月支最高；日支近身次之）
// 月令"司令"的额外加成不在此处，而在 wangShuai 层按当令党派施加（见 SEASON_BONUS）。
const GAN_WEIGHT = 8 // 每个天干（日主本身不计）
const ZHI_WEIGHT = { month: 40, day: 20, year: 12, hour: 12 }
// 地支藏干按个数分配比例（本气 / 中气 / 余气），使每支贡献其完整基础权重
const HIDE_DIST = { 1: [1.0], 2: [0.7, 0.3], 3: [0.6, 0.3, 0.1] }

function emptyScores() {
  return { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
}

/**
 * 判断某五行相对日主五行的十神党派
 * @returns {'比劫'|'印'|'食伤'|'财'|'官杀'}
 */
function partyOf(element, dayElement) {
  if (element === dayElement) return '比劫' // 同我
  if (SHENG[element] === dayElement) return '印' // 生我
  if (SHENG[dayElement] === element) return '食伤' // 我生
  if (KE[element] === dayElement) return '官杀' // 克我
  return '财' // 我克（KE[dayElement] === element）
}

// 同党（帮身）= 印 + 比劫；异党（耗身）= 食伤 + 财 + 官杀
function isTongDang(party) {
  return party === '印' || party === '比劫'
}

/**
 * 五行力量打分
 * @param {object} paipan paipan() 的返回对象
 * @returns {{scores: object, breakdown: Array}}
 */
function scoreWuxing(paipan) {
  const { yearPillar, monthPillar, hourPillar, cangGan } = paipan
  const scores = emptyScores()
  const breakdown = []

  // 天干：年/月/时（日主天干本身不计帮扶）
  const gans = [
    { pos: 'year', gan: yearPillar.gan },
    { pos: 'month', gan: monthPillar.gan },
    { pos: 'hour', gan: hourPillar.gan }
  ]
  for (const { pos, gan } of gans) {
    const el = WUXING[gan]
    scores[el] += GAN_WEIGHT
    breakdown.push({ source: `${pos}干`, gan, element: el, weight: GAN_WEIGHT })
  }

  // 地支藏干：按位置基础权重 × 本中余气比例
  const zhis = [
    { pos: 'year', hide: cangGan.year },
    { pos: 'month', hide: cangGan.month },
    { pos: 'day', hide: cangGan.day },
    { pos: 'hour', hide: cangGan.hour }
  ]
  for (const { pos, hide } of zhis) {
    const base = ZHI_WEIGHT[pos]
    const dist = HIDE_DIST[hide.length] || HIDE_DIST[3]
    hide.forEach((g, i) => {
      const el = WUXING[g]
      const w = base * (dist[i] != null ? dist[i] : 0)
      scores[el] += w
      breakdown.push({ source: `${pos}支藏`, gan: g, element: el, weight: w })
    })
  }

  return { scores, breakdown }
}

module.exports = {
  scoreWuxing,
  partyOf,
  isTongDang,
  emptyScores,
  ELEMENTS,
  SHENG,
  KE,
  GAN_WEIGHT,
  ZHI_WEIGHT,
  HIDE_DIST
}
