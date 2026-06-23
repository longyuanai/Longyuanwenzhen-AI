// utils/yongShen.js - 用神推导（扶抑 + 调候）
//
// 扶抑（主干，机主盘验证）：身弱喜印比、忌食财官；身强喜食财官、忌印比。
// 调候（季节寒暖燥湿，v1 简化）：冬月寒喜火暖、夏月燥喜水润。
// 两者一致则强化；冲突时不强行合并，调候独立呈现，交由 AI 按 basis 表述。
//
// 说明：完整《穷通宝鉴》120 条（日干 × 月令）调候表为后续增强，本期用季节法。

const { WUXING } = require('./bazi')
const { SHENG, KE, ELEMENTS } = require('./wuxingScore')

// 反查：生我者（印）、克我者（官杀）
const REVERSE_SHENG = {} // REVERSE_SHENG[D] = 生 D 的五行
const REVERSE_KE = {} // REVERSE_KE[D] = 克 D 的五行
for (const e of ELEMENTS) {
  REVERSE_SHENG[SHENG[e]] = e
  REVERSE_KE[KE[e]] = e
}

// 月支 → 季节
const SEASON_OF_ZHI = {
  寅: '春', 卯: '春', 辰: '春',
  巳: '夏', 午: '夏', 未: '夏',
  申: '秋', 酉: '秋', 戌: '秋',
  亥: '冬', 子: '冬', 丑: '冬'
}

// 季节调候需求（v1 简化：冬需火暖、夏需水润；春秋调候需求弱，不强制）
const TIAOHOU_BY_SEASON = {
  冬: { need: ['火'], reason: '冬月气寒，喜火暖局' },
  夏: { need: ['水'], reason: '夏月气燥，喜水润局' },
  春: { need: [], reason: '春月气候温和，调候需求不显' },
  秋: { need: [], reason: '秋月气候凉爽，调候需求不显' }
}

// 调候"急用"阈值：所需五行在命局占比低于此值，视为急需调候
const URGENT_RATIO = 0.12

/**
 * 日主五行 → 五行的十神归类
 */
function elementRoles(dayEl) {
  return {
    印: REVERSE_SHENG[dayEl], // 生我
    比劫: dayEl, // 同我
    食伤: SHENG[dayEl], // 我生
    财: KE[dayEl], // 我克
    官杀: REVERSE_KE[dayEl] // 克我
  }
}

/**
 * 扶抑用神：依身强弱二元倾向取喜忌（五行集合）
 */
function deriveFuYi(dayEl, lean) {
  const roles = elementRoles(dayEl)
  if (lean === '弱') {
    return { xi: [roles.印, roles.比劫], ji: [roles.食伤, roles.财, roles.官杀] }
  }
  return { xi: [roles.食伤, roles.财, roles.官杀], ji: [roles.印, roles.比劫] }
}

/**
 * 调候用神：按月令季节判寒暖燥湿
 */
function deriveTiaoHou(paipan, scores) {
  const monthZhi = paipan.monthPillar.zhi
  const season = SEASON_OF_ZHI[monthZhi]
  const tpl = TIAOHOU_BY_SEASON[season] || { need: [], reason: '' }
  const total = ELEMENTS.reduce((s, e) => s + scores[e], 0) || 1
  // 急用：所需五行命局占比过低
  const urgent = tpl.need.length > 0 && tpl.need.every((e) => scores[e] / total < URGENT_RATIO)
  return { season, need: tpl.need.slice(), urgent, reason: tpl.reason }
}

/**
 * 用神推导主入口
 * @param {object} paipan paipan() 返回对象
 * @param {object} strengthResult judgeStrength() 返回对象
 * @param {object} scores scoreWuxing().scores
 */
function deriveYongShen(paipan, strengthResult, scores) {
  const dayEl = strengthResult.dayElement
  const fuYi = deriveFuYi(dayEl, strengthResult.lean)
  const tiaoHou = deriveTiaoHou(paipan, scores)

  const basis = []
  basis.push(
    strengthResult.lean === '弱'
      ? `日主${dayEl}偏弱，扶抑取印比为喜（生扶帮身），忌食财官（泄耗克身）`
      : `日主${dayEl}偏强，扶抑取食财官为喜（泄耗克身），忌印比（再生扶则太过）`
  )

  // 合并：扶抑喜为主；调候所需若不与扶抑忌冲突则并入喜神
  const xiSet = new Set(fuYi.xi)
  const conflicts = []
  for (const e of tiaoHou.need) {
    if (fuYi.ji.includes(e)) {
      conflicts.push(e) // 调候与扶抑冲突，不并入喜神，仅作提示
    } else {
      xiSet.add(e)
    }
  }
  if (tiaoHou.need.length) {
    basis.push(
      `${tiaoHou.reason}，调候需${tiaoHou.need.join('')}${tiaoHou.urgent ? '（急用）' : ''}`
    )
  }
  if (conflicts.length) {
    basis.push(`注意：调候所需${conflicts.join('')}与扶抑忌神冲突，需权衡（命局取舍交由命师判断）`)
  }

  const xiShen = ELEMENTS.filter((e) => xiSet.has(e)) // 固定五行顺序，确定性
  const jiShen = fuYi.ji.filter((e) => !xiSet.has(e))

  return { lean: strengthResult.lean, dayElement: dayEl, fuYi, tiaoHou, xiShen, jiShen, conflicts, basis }
}

module.exports = {
  deriveYongShen,
  deriveFuYi,
  deriveTiaoHou,
  elementRoles,
  SEASON_OF_ZHI,
  TIAOHOU_BY_SEASON,
  REVERSE_SHENG,
  REVERSE_KE
}
