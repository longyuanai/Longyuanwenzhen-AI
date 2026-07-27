// utils/checkupSummary.en.js - 免费体检「一句点评」的英文版
//
// 与 checkupSummary.js 同结构：不调 AI，基于日主五行 + 身强弱 + 突出十神
// 确定性拼一句。免费档要快（实测 7ms），不能为一句话去调模型。
//
// 玄学红线与中文版一致：只用 tends to / often / may 这类措辞，
// 不出宿命断言。英文版额外避开西方占星词汇。

const T = require('./i18n/baziTerms')

const DAY_TRAIT_EN = {
  木: 'Wood Day Masters tend toward growth and decency, valuing progress and standing',
  火: 'Fire Day Masters tend to be warm and quick to respond, valuing expression and recognition',
  土: 'Earth Day Masters tend to be steady and dependable, leaning practical and conservative',
  金: 'Metal Day Masters tend to be decisive and principled, leaning direct and clear-cut',
  水: 'Water Day Masters tend to be perceptive and adaptable, thinking broadly and in detail'
}

function strengthToneEn(label) {
  if (label.includes('强')) {
    return 'a strong Day Master brings conviction and self-drive, though it can tip into '
      + 'stubbornness or taking on too much — channelling that energy outward tends to help'
  }
  if (label.includes('弱')) {
    return 'a weaker Day Master brings sensitivity and a knack for working through others, '
      + 'though it is more swayed by environment — building a stable base tends to help'
  }
  return 'a balanced Day Master adapts readily; going with the grain of a situation usually works'
}

// 与中文版同样的合并逻辑：比肩/劫财 归一句，正财/偏财 归一句，正印/偏印 归一句
const SHISHEN_TONE_EN = {
  比肩: 'Friend and Rob Wealth stand out — loyal and action-oriented, though money tends to '
    + 'come and go and partnerships deserve care',
  劫财: 'Friend and Rob Wealth stand out — loyal and action-oriented, though money tends to '
    + 'come and go and partnerships deserve care',
  食神: 'Eating God is prominent — an easy temperament with a taste for the good things',
  伤官: 'Hurting Officer is prominent — bright and expressive, though thoughts can scatter '
    + 'and words can cut',
  正财: 'Wealth is prominent — practical and opportunity-aware, with a head for money',
  偏财: 'Wealth is prominent — generous and quick to spot openings, with money moving fast',
  正官: 'Direct Officer is prominent — self-disciplined and willing to carry responsibility',
  七杀: 'Seven Killings is prominent — able to take pressure and act, though it can run tense',
  正印: 'Resource is prominent — studious and kind-natured, prone to introspection',
  偏印: 'Resource is prominent — an original mind that thinks deeply and keeps its own counsel'
}

// 与中文版共用同一套「取最突出十神」规则，保证两语言点评落在同一结论上
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
 * 英文版一句点评
 * @param {object} paipan paipan() 返回对象
 * @param {object} mingju analyzeMingju() 返回对象
 * @returns {string}
 */
function buildOneLinerEn(paipan, mingju) {
  const base = DAY_TRAIT_EN[mingju.dayMaster.element] || ''
  const tone = strengthToneEn(mingju.strength.label)
  const top = topShiShen(paipan.tenGods)
  const shen = top ? SHISHEN_TONE_EN[top] : ''
  const xi = T.elements(mingju.yongShen.xiShen)

  const parts = [base, tone]
  if (shen) parts.push(shen)
  return `${parts.join('; ')}. This chart reads as ${T.geju(mingju.geju.name)}; `
    + `working with ${xi} tends to suit it best.`
}

// 免责声明英文版（与 mingju.js 的中文 disclaimer 对应）
const DISCLAIMER_EN =
  'This reflects tendencies derived from classical BaZi rules. It is not a definitive '
  + 'reading, and is offered as a tool for self-reflection and decision-making, '
  + 'not fortune-telling.'

module.exports = { buildOneLinerEn, DISCLAIMER_EN }
