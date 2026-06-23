// utils/geju.js - 格局判定（保守取格）
//
// 取格原则（保守，避免边界争议）：
//   1. 月支为日主禄 → 建禄格；为日主阳刃 → 羊刃格（比劫月令不另立普通格）。
//   2. 否则以月支本气十神立格（正官/七杀/正偏印/食神/伤官/正偏财格）；
//      月令本气十神透干则格清纯（isPure=true）。
//   3. 仅在极端失衡（极弱无根 / 极旺）时论从格，默认不轻判。
//   4. 取不到 → 普通格，不强行成格。

const { judgeStrength } = require('./wangShuai')
const { scoreWuxing } = require('./wuxingScore')

// 十干禄支
const LU = {
  甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳',
  己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子'
}
// 阳干羊刃（阴干一般不论刃）
const YANG_REN = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' }

// 十神 → 普通格名（比肩/劫财不在此，由禄刃处理）
const GE_NAME = {
  正官: '正官格', 七杀: '七杀格', 正印: '正印格', 偏印: '偏印格',
  食神: '食神格', 伤官: '伤官格', 正财: '正财格', 偏财: '偏财格'
}

// 从格阈值（保守）：极弱无根从弱，极旺从强
const CONG_WEAK = 0.15
const CONG_STRONG = 0.85

/**
 * 格局判定
 * @param {object} paipan paipan() 返回对象
 * @param {object} [strengthResult] 可选，judgeStrength() 结果（用于从格判定）
 * @returns {{geju, isSpecial, isPure, basis: string[]}}
 */
function judgeGeju(paipan, strengthResult) {
  const { dayPillar, monthPillar, tenGods } = paipan
  const dayGan = dayPillar.gan
  const monthZhi = monthPillar.zhi
  const basis = []

  const strength = strengthResult || judgeStrength(paipan, scoreWuxing(paipan))

  // 1. 从格（极端，优先且保守）
  if (strength.ratio <= CONG_WEAK && !strength.deDi) {
    basis.push(`日主极弱且无通根（占比${(strength.ratio * 100).toFixed(1)}%），从其旺神`)
    return { geju: '从弱格', isSpecial: true, isPure: true, basis }
  }
  if (strength.ratio >= CONG_STRONG) {
    basis.push(`日主极旺（占比${(strength.ratio * 100).toFixed(1)}%），从其强势`)
    return { geju: '从强格', isSpecial: true, isPure: true, basis }
  }

  // 2. 建禄 / 羊刃
  if (LU[dayGan] === monthZhi) {
    basis.push(`月支${monthZhi}为日主${dayGan}之禄，建禄格`)
    return { geju: '建禄格', isSpecial: false, isPure: true, basis }
  }
  if (YANG_REN[dayGan] === monthZhi) {
    basis.push(`月支${monthZhi}为日主${dayGan}之阳刃，羊刃格`)
    return { geju: '羊刃格', isSpecial: false, isPure: true, basis }
  }

  // 3. 月令本气十神立格
  const benQiShiShen = tenGods.monthZhi // 月支本气十神（相对日主）
  const name = GE_NAME[benQiShiShen]
  if (name) {
    // 透干：月令本气十神是否透出于年/月/时天干
    const touGan = [tenGods.yearGan, tenGods.monthGan, tenGods.hourGan]
    const isPure = touGan.includes(benQiShiShen)
    basis.push(
      `月支${monthZhi}本气十神为${benQiShiShen}，立${name}${isPure ? '（透干，格清纯）' : '（未透，格不纯）'}`
    )
    return { geju: name, isSpecial: false, isPure, basis }
  }

  // 4. 取不到清纯格（如月令本气为比劫但非禄刃）
  basis.push(`月支${monthZhi}本气十神为${benQiShiShen}，未成清纯格，作普通格论`)
  return { geju: '普通格', isSpecial: false, isPure: false, basis }
}

module.exports = { judgeGeju, LU, YANG_REN, GE_NAME, CONG_WEAK, CONG_STRONG }
