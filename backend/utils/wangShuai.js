// utils/wangShuai.js - 身强弱判定
//
// 命理依据：旺衰看"得令、得地、得势"。其中月令司令权重最大，
// 故月支本气所属党派额外获得 SEASON_BONUS（体现"提纲司令，权重过半"）。
// 同党 = 印 + 比劫（帮身）；异党 = 食伤 + 财 + 官杀（耗身）。

const { WUXING } = require('./bazi')
const { scoreWuxing, partyOf, isTongDang } = require('./wuxingScore')

// 月令司令额外加成：施加于月支本气所属党派（同党=得令身旺，异党=失令身弱）
const SEASON_BONUS = 40

// 分档阈值（同党占比）
const BANDS = [
  { min: 0.60, label: '身强' },
  { min: 0.55, label: '偏强' },
  { min: 0.45, label: '中和' },
  { min: 0.40, label: '偏弱' },
  { min: 0, label: '身弱' }
]

/**
 * 身强弱判定
 * @param {object} paipan paipan() 返回对象
 * @param {object} [precomputed] 可选，已算好的 scoreWuxing 结果，避免重复计算
 * @returns {{strength, lean, ratio, tongDang, yiDang, deLing, deDi, deShi, dayElement, basis: string[]}}
 */
function judgeStrength(paipan, precomputed) {
  const { dayPillar, cangGan, yearPillar, monthPillar, hourPillar } = paipan
  const dayEl = WUXING[dayPillar.gan]
  const { scores } = precomputed || scoreWuxing(paipan)

  // 同党 / 异党 基础分
  let tong = 0
  let yi = 0
  for (const el of Object.keys(scores)) {
    if (isTongDang(partyOf(el, dayEl))) tong += scores[el]
    else yi += scores[el]
  }

  const basis = []

  // 得令：月支本气党派决定司令加成归属
  const monthBenEl = WUXING[cangGan.month[0]]
  const deLing = isTongDang(partyOf(monthBenEl, dayEl))
  if (deLing) {
    tong += SEASON_BONUS
    basis.push(`日主生于${monthPillar.zhi}月，月令本气${monthBenEl}帮身，得令`)
  } else {
    yi += SEASON_BONUS
    basis.push(`日主生于${monthPillar.zhi}月，月令本气${monthBenEl}耗身，失令`)
  }

  const total = tong + yi
  const ratio = total > 0 ? tong / total : 0.5

  // 得地：四地支藏干中含与日主同五行者（通根/比劫根）
  const allHide = [...cangGan.year, ...cangGan.month, ...cangGan.day, ...cangGan.hour]
  const deDi = allHide.some((g) => WUXING[g] === dayEl)
  if (deDi) basis.push('日主在地支有通根（得地）')
  else basis.push('日主地支无通根（不得地）')

  // 得势：天干（年月时，日主除外）中印比个数 >= 2
  const helperGans = [yearPillar.gan, monthPillar.gan, hourPillar.gan]
  const helperCount = helperGans.filter((g) => isTongDang(partyOf(WUXING[g], dayEl))).length
  const deShi = helperCount >= 2
  basis.push(`天干印比帮扶 ${helperCount} 个（${deShi ? '得势' : '不得势'}）`)

  const strength = BANDS.find((b) => ratio >= b.min).label
  const lean = ratio >= 0.5 ? '强' : '弱' // 扶抑取用的二元倾向

  basis.push(`同党 ${tong.toFixed(1)} 对 异党 ${yi.toFixed(1)}，占比 ${(ratio * 100).toFixed(1)}%，判${strength}`)

  return {
    strength,
    lean,
    ratio,
    tongDang: tong,
    yiDang: yi,
    deLing,
    deDi,
    deShi,
    dayElement: dayEl,
    basis
  }
}

module.exports = { judgeStrength, SEASON_BONUS, BANDS }
