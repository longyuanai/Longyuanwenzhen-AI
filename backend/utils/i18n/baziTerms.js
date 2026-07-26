// utils/i18n/baziTerms.js - 命理术语的英文对照表
//
// 用途：英文市场可行性验证（见 utils/promptBuilder.en.js）。
//
// 译法取自英文八字文献的通行叫法（Ten Gods 用 Rob Wealth / Eating God /
// Seven Killings 这一套），不自造词 —— 目标读者是已经接触过 Four Pillars
// 概念的英文用户，用社区共识术语才能对上。
//
// 设计要点：
//   1. 算法层（mingju/wuxingScore/yongShen/geju）输出的是结构化数据 +
//      少量中文枚举值，本表只翻译那些枚举值，不动算法本身。
//   2. mingju.basis[] 是代码拼出的中文判据句，**不在这里翻译** ——
//      直接连同中文原文喂给模型，由模型在上下文里转述成英文。
//      同理 RAG 检索到的文言片段也不翻译。这省掉了最大一块工作量，
//      而且模型读文言文、输出英文是它擅长的事。
//   3. 查不到的词一律回退原文，绝不返回 undefined 拼进提示词。

// 五行
const ELEMENT = {
  木: 'Wood',
  火: 'Fire',
  土: 'Earth',
  金: 'Metal',
  水: 'Water'
}

// 天干：拼音 + 阴阳五行，英文读者靠后者理解
const GAN = {
  甲: { pinyin: 'Jia', en: 'Yang Wood' },
  乙: { pinyin: 'Yi', en: 'Yin Wood' },
  丙: { pinyin: 'Bing', en: 'Yang Fire' },
  丁: { pinyin: 'Ding', en: 'Yin Fire' },
  戊: { pinyin: 'Wu', en: 'Yang Earth' },
  己: { pinyin: 'Ji', en: 'Yin Earth' },
  庚: { pinyin: 'Geng', en: 'Yang Metal' },
  辛: { pinyin: 'Xin', en: 'Yin Metal' },
  壬: { pinyin: 'Ren', en: 'Yang Water' },
  癸: { pinyin: 'Gui', en: 'Yin Water' }
}

// 地支：拼音 + 生肖（英文圈普遍认生肖，比"子丑寅卯"好懂）
const ZHI = {
  子: { pinyin: 'Zi', en: 'Rat' },
  丑: { pinyin: 'Chou', en: 'Ox' },
  寅: { pinyin: 'Yin', en: 'Tiger' },
  卯: { pinyin: 'Mao', en: 'Rabbit' },
  辰: { pinyin: 'Chen', en: 'Dragon' },
  巳: { pinyin: 'Si', en: 'Snake' },
  午: { pinyin: 'Wu', en: 'Horse' },
  未: { pinyin: 'Wei', en: 'Goat' },
  申: { pinyin: 'Shen', en: 'Monkey' },
  酉: { pinyin: 'You', en: 'Rooster' },
  戌: { pinyin: 'Xu', en: 'Dog' },
  亥: { pinyin: 'Hai', en: 'Pig' }
}

// 十神：英文八字圈的标准译名
const TEN_GOD = {
  比肩: 'Friend',
  劫财: 'Rob Wealth',
  食神: 'Eating God',
  伤官: 'Hurting Officer',
  偏财: 'Indirect Wealth',
  正财: 'Direct Wealth',
  七杀: 'Seven Killings',
  正官: 'Direct Officer',
  偏印: 'Indirect Resource',
  正印: 'Direct Resource',
  日主: 'Day Master'
}

// 身强弱
const STRENGTH = {
  身强: 'Strong Day Master',
  身弱: 'Weak Day Master',
  身旺: 'Very Strong Day Master',
  从强: 'Follow-the-Strong',
  从弱: 'Follow-the-Weak',
  均衡: 'Balanced Day Master'
}

// 季节（调候用）
const SEASON = {
  春: 'Spring',
  夏: 'Summer',
  秋: 'Autumn',
  冬: 'Winter'
}

// 格局：保留拼音（这是专有结构名）+ 意译说明
const GEJU = {
  建禄格: 'Jian Lu (Established Prosperity) structure',
  月劫格: 'Yue Jie (Monthly Rob Wealth) structure',
  正官格: 'Direct Officer structure',
  七杀格: 'Seven Killings structure',
  正印格: 'Direct Resource structure',
  偏印格: 'Indirect Resource structure',
  正财格: 'Direct Wealth structure',
  偏财格: 'Indirect Wealth structure',
  食神格: 'Eating God structure',
  伤官格: 'Hurting Officer structure',
  从强格: 'Follow-the-Strong special structure',
  从弱格: 'Follow-the-Weak special structure'
}

// 查表并回退原文：宁可提示词里出现中文，也不能出现 undefined
function lookup(table, key, pick) {
  const hit = table[key]
  if (hit === undefined) return String(key)
  if (pick && typeof hit === 'object') return hit[pick]
  return typeof hit === 'object' ? hit.en : hit
}

const element = (z) => lookup(ELEMENT, z)
const strength = (z) => lookup(STRENGTH, z)
const season = (z) => lookup(SEASON, z)
const tenGod = (z) => lookup(TEN_GOD, z)

// 格局无对照时给个可读的兜底，而不是直接吐中文
function geju(name) {
  return GEJU[name] || `${name} (classical structure)`
}

// 单个天干 → "Ren (Yang Water)"
function gan(g) {
  const hit = GAN[g]
  return hit ? `${hit.pinyin} (${hit.en})` : String(g)
}

// 单个地支 → "Hai (Pig)"
function zhi(z) {
  const hit = ZHI[z]
  return hit ? `${hit.pinyin} (${hit.en})` : String(z)
}

// 一柱 "壬午" → "Ren-Wu (Yang Water over Horse)"
function pillar(ganZhi) {
  const g = String(ganZhi).charAt(0)
  const z = String(ganZhi).charAt(1)
  const gh = GAN[g]
  const zh = ZHI[z]
  if (!gh || !zh) return String(ganZhi)
  return `${gh.pinyin}-${zh.pinyin} (${gh.en} over ${zh.en})`
}

// 五行数组 "木、火" → "Wood, Fire"
function elements(list) {
  if (!Array.isArray(list) || list.length === 0) return 'none'
  return list.map(element).join(', ')
}

// 四柱串 "壬午 辛亥 壬辰 乙巳" → 逐柱翻译
function pillars(baziStr) {
  return String(baziStr).trim().split(/\s+/).map(pillar).join(' | ')
}

module.exports = {
  ELEMENT, GAN, ZHI, TEN_GOD, STRENGTH, SEASON, GEJU,
  element, elements, gan, zhi, pillar, pillars,
  strength, season, tenGod, geju
}
