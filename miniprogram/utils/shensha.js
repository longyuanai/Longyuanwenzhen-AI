// ⚠️ 本文件由 backend/scripts/gen-shensha.js 生成，请勿手改。
// 源文件：backend/utils/shensha.js（禄神/羊刃表内联自 backend/utils/geju.js）
// 重新生成：cd backend && npm run gen:shensha
//
// 手改这里会让小程序离线兜底与服务端对同一个盘给出不同神煞，
// 而且改动会在下次生成时被静默覆盖。

// utils/shensha.js - 神煞 + 命宫身宫
//
// 依据：bazi-skill-dist/core/梁湘润神煞探原通读笔记.md（《神煞探原》，行卯出版社）
//
// ── 为什么只算这一批，不算全部 ──────────────────────────────────
// 《神煞探原》里相当大的篇幅是凶煞：自缢杀（自杀倾向）、冲天杀（少年夭折）、
// 戳肢杀（后天伤残）、天屠杀（疑难杂症）、挂剑杀（刀刃血光）、死病符（痼疾）。
// 这些**刻意不实现**，两个理由：
//   1. 对 C 端用户有实际伤害。告诉一个人"你命带自缢杀"不是命理服务，是伤人。
//   2. 命理类目审核本就敏感，恐吓性内容是最先被盯上的那类。
// 梁本人也写明"神煞只是辅助信号，不能作为主要断法"（陈素庵原则）。
//
// 这里实现的是各家排盘软件通行的展示型神煞：吉神 + 中性煞。
// 要加凶煞请先想清楚产品与合规，不要只因为"古书上有"就加。
//
// ── 与 geju.js 的关系 ──────────────────────────────────────────
// 禄神与羊刃直接复用 geju.js 的表，不另抄一份。抄一份的下场是
// "羊刃格"和"羊刃神煞"对同一个盘各说各话。

// —— 以下两张表由生成脚本从 backend/utils/geju.js 内联而来 ——
// 单一真相在 geju.js：改那边后跑 npm run gen:shensha 重新生成。
// 直接改这里会让「羊刃格」与「羊刃神煞」对同一个盘各说各话。
const LU = {
  甲: '寅',
  乙: '卯',
  丙: '巳',
  丁: '午',
  戊: '巳',
  己: '午',
  庚: '申',
  辛: '酉',
  壬: '亥',
  癸: '子'
}
const YANG_REN = {
  甲: '卯',
  丙: '午',
  戊: '午',
  庚: '酉',
  壬: '子'
}

const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

// ── 神煞查表 ──────────────────────────────────────────────────

// 天乙贵人（日干/年干 → 地支）
// 口诀：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎
const TIAN_YI = {
  甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
  乙: ['子', '申'], 己: ['子', '申'],
  丙: ['亥', '酉'], 丁: ['亥', '酉'],
  壬: ['卯', '巳'], 癸: ['卯', '巳'],
  辛: ['午', '寅']
}

// 天德贵人（月支 → 天干或地支；注意取值有干有支，这是它本来的样子）
const TIAN_DE = {
  寅: '丁', 卯: '申', 辰: '壬', 巳: '辛', 午: '亥', 未: '甲',
  申: '癸', 酉: '寅', 戌: '丙', 亥: '乙', 子: '巳', 丑: '庚'
}

// 月德贵人（月支三合局 → 天干）
const YUE_DE = {
  寅: '丙', 午: '丙', 戌: '丙',
  申: '壬', 子: '壬', 辰: '壬',
  亥: '甲', 卯: '甲', 未: '甲',
  巳: '庚', 酉: '庚', 丑: '庚'
}

// 文昌贵人（日干 → 地支）
const WEN_CHANG = {
  甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申',
  己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯'
}

// 以下四组都按「年支或日支」的三合局起，是同一套四生四旺四库的不同落点
const SAN_HE_GROUP = {
  申: 'shen', 子: 'shen', 辰: 'shen',
  寅: 'yin', 午: 'yin', 戌: 'yin',
  巳: 'si', 酉: 'si', 丑: 'si',
  亥: 'hai', 卯: 'hai', 未: 'hai'
}
const YI_MA = { shen: '寅', yin: '申', si: '亥', hai: '巳' }        // 驿马
const TAO_HUA = { shen: '酉', yin: '卯', si: '午', hai: '子' }      // 桃花（咸池）
const HUA_GAI = { shen: '辰', yin: '戌', si: '丑', hai: '未' }      // 华盖
const JIANG_XING = { shen: '子', yin: '午', si: '酉', hai: '卯' }   // 将星

// 孤辰寡宿（年支所属季 → 地支）
const GU_GUA = {
  亥: ['寅', '戌'], 子: ['寅', '戌'], 丑: ['寅', '戌'],
  寅: ['巳', '丑'], 卯: ['巳', '丑'], 辰: ['巳', '丑'],
  巳: ['申', '辰'], 午: ['申', '辰'], 未: ['申', '辰'],
  申: ['亥', '未'], 酉: ['亥', '未'], 戌: ['亥', '未']
}

// 神煞释义。写给普通用户看，不写吉凶断语——
// 神煞是辅助信号，把它讲成结论就是本末倒置。
const MEANINGS = {
  天乙贵人: '古称最尊之吉神，主逢难得助、遇事有人相帮',
  天德贵人: '主心性宽厚、多得庇荫，凶事易化解',
  月德贵人: '主福泽绵长、行事得正，与天德同为「论吉不论凶」之神',
  文昌贵人: '主聪颖好学、利文书考试与专业技艺',
  禄神: '主衣食有靠、自立更生之力',
  将星: '主有统御之才、在群体中易居主位',
  华盖: '主聪慧孤高、亲近艺术宗教哲思，也主独处',
  // 原文作「生旺则…死绝则…」，那是十二长生的术语，不是断生死。
  // 但给 C 端读者看，「死绝」二字只会引起误解，故改用白话表达同一个意思。
  驿马: '古注不作「出远门」解，本义是待发之气：得力时通变灵活、多声望，失位时则漂泊不定',
  桃花: '亦称咸池。在旺宫主才艺出众、异性缘佳；在衰宫则主感情易生波折',
  羊刃: '刚锐之气。用得其所主果决担当，失其平衡则失于冲动',
  孤辰: '古义为「幼而无父曰孤」，今多论性格独立、不倚六亲',
  寡宿: '古义为「老而无夫曰寡」，今多论孤独感强、喜独处',
  空亡: '该支力量虚浮，所主之事易生变数或迟到'
}

// 神煞类别，供前端分组展示
const CATEGORY = {
  天乙贵人: 'auspicious', 天德贵人: 'auspicious', 月德贵人: 'auspicious',
  文昌贵人: 'auspicious', 禄神: 'auspicious', 将星: 'auspicious',
  华盖: 'neutral', 驿马: 'neutral', 桃花: 'neutral', 羊刃: 'neutral',
  孤辰: 'neutral', 寡宿: 'neutral', 空亡: 'neutral'
}

const PILLAR_KEYS = ['year', 'month', 'day', 'hour']
const PILLAR_LABEL = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' }

// ── 命宫 / 身宫 ───────────────────────────────────────────────
//
// 规律由 tyme4ts 的 getOwnSign()/getBodySign() 反推并逐盘校验
// （见 utils/__tests__/shensha.diff.test.js，与第三方实现比对上万盘）：
//
//   命宫支 = (5 − 月支序 − 时支序) mod 12    逆行
//   身宫支 = (月支序 + 时支序 + 1) mod 12    顺行
//
// 两宫的天干都由**年干**按五虎遁起（与月柱天干同一套推法）。
// 注意年干取的是八字年柱之干（立春分年），不是公历年——立春前出生者
// 用的是上一年的干，这一点错了整个宫位就错。

/**
 * 五虎遁：由年干推某地支上的天干。
 * 甲己之年丙作首，乙庚之岁戊为头，丙辛必定寻庚起，
 * 丁壬壬位顺行流，戊癸何方发，甲寅之上好追求。
 */
function ganOfBranchByYear(yearGan, zhi) {
  const y = TIANGAN.indexOf(yearGan)
  const z = DIZHI.indexOf(zhi)
  if (y < 0 || z < 0) throw new Error(`五虎遁入参非法: ${yearGan}/${zhi}`)
  const baseAtYin = ((y % 5) * 2 + 2) % 10          // 寅位上的天干
  const stepsFromYin = ((z - DIZHI.indexOf('寅')) % 12 + 12) % 12
  return TIANGAN[(baseAtYin + stepsFromYin) % 10]
}

function computePalaces(paipan) {
  const yearGan = paipan.yearPillar.gan
  const m = DIZHI.indexOf(paipan.monthPillar.zhi)
  const h = DIZHI.indexOf(paipan.hourPillar.zhi)

  const mingZhi = DIZHI[((5 - m - h) % 12 + 12) % 12]
  const shenZhi = DIZHI[((m + h + 1) % 12 + 12) % 12]

  return {
    mingGong: { gan: ganOfBranchByYear(yearGan, mingZhi), zhi: mingZhi },
    shenGong: { gan: ganOfBranchByYear(yearGan, shenZhi), zhi: shenZhi }
  }
}

// ── 空亡（旬空） ──────────────────────────────────────────────
/**
 * 按日柱定旬空。六十甲子每旬十干配十二支，多出的两支即为空亡。
 * 推法：日柱干支序相减定旬首，旬首前两位就是空亡。
 */
function xunKong(dayGan, dayZhi) {
  const g = TIANGAN.indexOf(dayGan)
  const z = DIZHI.indexOf(dayZhi)
  if (g < 0 || z < 0) throw new Error(`空亡入参非法: ${dayGan}${dayZhi}`)
  return [DIZHI[(z - g + 10) % 12], DIZHI[(z - g + 11) % 12]]
}

// ── 主入口 ────────────────────────────────────────────────────

function addHit(map, name, pillar) {
  if (!map[name]) map[name] = []
  if (!map[name].includes(pillar)) map[name].push(pillar)
}

/**
 * 计算一张盘的神煞与命宫身宫。
 *
 * @param {object} paipan paipan() 的返回对象
 * @returns {object} { list, byPillar, mingGong, shenGong, kongWang }
 *   list      按类别排好序的神煞数组，每项 { name, category, pillars, meaning }
 *   byPillar  { year: ['天乙贵人',...], ... } 供四柱表格逐柱标注
 */
function analyzeShenSha(paipan) {
  const dayGan = paipan.dayPillar.gan
  const yearZhi = paipan.yearPillar.zhi
  const dayZhi = paipan.dayPillar.zhi

  const zhiOf = {}
  const ganOf = {}
  for (const k of PILLAR_KEYS) {
    zhiOf[k] = paipan[k + 'Pillar'].zhi
    ganOf[k] = paipan[k + 'Pillar'].gan
  }

  const hits = {}

  // 天乙贵人：日干为主，年干为辅（两者都查是通行做法）
  for (const gan of [dayGan, paipan.yearPillar.gan]) {
    const targets = TIAN_YI[gan] || []
    for (const k of PILLAR_KEYS) {
      if (targets.includes(zhiOf[k])) addHit(hits, '天乙贵人', k)
    }
  }

  // 天德贵人：按月支查，取值可能是天干也可能是地支，故干支都要比
  const tianDe = TIAN_DE[paipan.monthPillar.zhi]
  for (const k of PILLAR_KEYS) {
    if (ganOf[k] === tianDe || zhiOf[k] === tianDe) addHit(hits, '天德贵人', k)
  }

  // 月德贵人：只落在天干
  const yueDe = YUE_DE[paipan.monthPillar.zhi]
  for (const k of PILLAR_KEYS) {
    if (ganOf[k] === yueDe) addHit(hits, '月德贵人', k)
  }

  // 文昌、禄神、羊刃：按日干查地支
  const byDayGan = [
    ['文昌贵人', WEN_CHANG[dayGan]],
    ['禄神', LU[dayGan]],
    ['羊刃', YANG_REN[dayGan]]   // 阴干无羊刃，取值为 undefined，下面自然不命中
  ]
  for (const [name, target] of byDayGan) {
    if (!target) continue
    for (const k of PILLAR_KEYS) {
      if (zhiOf[k] === target) addHit(hits, name, k)
    }
  }

  // 三合系（驿马/桃花/华盖/将星）：年支与日支两个起点都查，取并集。
  // 只查年支是旧法，现代排盘普遍两者都查——只查一个会漏掉相当多命中。
  for (const base of [yearZhi, dayZhi]) {
    const g = SAN_HE_GROUP[base]
    if (!g) continue
    const group = [
      ['驿马', YI_MA[g]], ['桃花', TAO_HUA[g]],
      ['华盖', HUA_GAI[g]], ['将星', JIANG_XING[g]]
    ]
    for (const [name, target] of group) {
      for (const k of PILLAR_KEYS) {
        if (zhiOf[k] === target) addHit(hits, name, k)
      }
    }
  }

  // 孤辰寡宿：按年支查
  const gg = GU_GUA[yearZhi]
  if (gg) {
    for (const k of PILLAR_KEYS) {
      if (zhiOf[k] === gg[0]) addHit(hits, '孤辰', k)
      if (zhiOf[k] === gg[1]) addHit(hits, '寡宿', k)
    }
  }

  // 空亡：按日柱定，日柱自身不论空
  const kongWang = xunKong(dayGan, dayZhi)
  for (const k of PILLAR_KEYS) {
    if (k === 'day') continue
    if (kongWang.includes(zhiOf[k])) addHit(hits, '空亡', k)
  }

  // 组装：吉神在前，中性在后，同类按柱序
  const ORDER = { auspicious: 0, neutral: 1 }
  const list = Object.keys(hits)
    .map((name) => {
      // 先排序再生成标签。曾经用未排序的 hits[name] 生成 pillarLabels，
      // 于是 pillars 是年月日时序、标签却是命中顺序，前端显示成「时柱/日柱」。
      const pillars = hits[name].slice()
        .sort((a, b) => PILLAR_KEYS.indexOf(a) - PILLAR_KEYS.indexOf(b))
      return {
        name,
        category: CATEGORY[name] || 'neutral',
        pillars,
        pillarLabels: pillars.map((k) => PILLAR_LABEL[k]),
        meaning: MEANINGS[name] || ''
      }
    })
    .sort((a, b) => (ORDER[a.category] - ORDER[b.category]) ||
      PILLAR_KEYS.indexOf(a.pillars[0]) - PILLAR_KEYS.indexOf(b.pillars[0]))

  const byPillar = {}
  for (const k of PILLAR_KEYS) {
    byPillar[k] = list.filter((s) => s.pillars.includes(k)).map((s) => s.name)
  }

  return {
    list,
    byPillar,
    kongWang,
    ...computePalaces(paipan),
    // 免责语气统一在这里给一次，避免各调用点各写一句
    note: '神煞为辅助参考信号，不作主要断法，须回到格局用神综合判断。'
  }
}

module.exports = {
  analyzeShenSha,
  computePalaces,
  xunKong,
  ganOfBranchByYear,
  MEANINGS,
  CATEGORY,
  TIAN_YI,
  TIAN_DE,
  YUE_DE,
  WEN_CHANG
}
