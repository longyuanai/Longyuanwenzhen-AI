// utils/mingju.js - 命局论断编排器
//
// 串联：五行打分 → 身强弱 → 用神(扶抑+调候) → 格局，产出统一论断对象。
// 这是论断层唯一对外入口，供 CLI 展示与 AI 解读注入。
// 所有结论确定性可复现；AI 只负责将本对象翻译成自然语言，禁止改动结论。

const { scoreWuxing } = require('./wuxingScore')
const { judgeStrength } = require('./wangShuai')
const { deriveYongShen } = require('./yongShen')
const { judgeGeju } = require('./geju')

const DISCLAIMER = '以上为基于传统命理规则的倾向性参考，非绝对论断，仅供自我认知与决策参考。'

/**
 * 完整命局论断
 * @param {object} paipan paipan() 返回对象
 * @returns {object} 统一论断对象
 */
function analyzeMingju(paipan) {
  const { scores } = scoreWuxing(paipan)
  const strength = judgeStrength(paipan, { scores })
  const yongShen = deriveYongShen(paipan, strength, scores)
  const geju = judgeGeju(paipan, strength)

  return {
    dayMaster: { gan: paipan.dayPillar.gan, element: strength.dayElement },
    wuxingScore: scores,
    strength: {
      label: strength.strength,
      lean: strength.lean,
      ratio: strength.ratio,
      deLing: strength.deLing,
      deDi: strength.deDi,
      deShi: strength.deShi
    },
    yongShen: {
      xiShen: yongShen.xiShen,
      jiShen: yongShen.jiShen,
      tiaoHou: yongShen.tiaoHou,
      conflicts: yongShen.conflicts
    },
    geju: {
      name: geju.geju,
      isSpecial: geju.isSpecial,
      isPure: geju.isPure
    },
    basis: [...strength.basis, ...yongShen.basis, ...geju.basis],
    disclaimer: DISCLAIMER
  }
}

module.exports = { analyzeMingju, DISCLAIMER }
