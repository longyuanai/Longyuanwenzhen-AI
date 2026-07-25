// utils/bazi.js - 八字排盘核心算法

// 天干
const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']

// 地支
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']

// 五行
const WUXING = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土',
  '巳': '火', '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水'
}

// 地支藏干
const CANG_GAN = {
  '子': ['癸'],
  '丑': ['己', '癸', '辛'],
  '寅': ['甲', '丙', '戊'],
  '卯': ['乙'],
  '辰': ['戊', '乙', '癸'],
  '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'],
  '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'],
  '酉': ['辛'],
  '戌': ['戊', '辛', '丁'],
  '亥': ['壬', '甲']
}

// 十神名称
const SHISHEN_NAMES = ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印']

/**
 * 计算年柱
 * @param {number} year - 公历年份
 * @returns {object} 年柱 {gan, zhi}
 */
function getYearPillar(year) {
  // 以立春为界，这里简化处理，使用年份计算
  // 实际应用中需要根据节气判断
  const ganIndex = (year - 4) % 10
  const zhiIndex = (year - 4) % 12

  return {
    gan: TIANGAN[ganIndex >= 0 ? ganIndex : ganIndex + 10],
    zhi: DIZHI[zhiIndex >= 0 ? zhiIndex : zhiIndex + 12],
    ganIndex: ganIndex >= 0 ? ganIndex : ganIndex + 10,
    zhiIndex: zhiIndex >= 0 ? zhiIndex : zhiIndex + 12
  }
}

/**
 * 计算月柱
 * @param {number} year - 公历年份
 * @param {number} month - 公历月份 (1-12)
 * @param {string} yearGan - 年干
 * @returns {object} 月柱 {gan, zhi}
 */
function getMonthPillar(year, month, yearGan) {
  // 五虎遁月口诀：甲己之年丙作首，乙庚之岁戊为头，
  //               丙辛之岁寻庚上，丁壬壬寅顺行流，
  //               戊癸之年甲寅首

  const monthGanStart = {
    '甲': 2, '己': 2,  // 丙寅起
    '乙': 4, '庚': 4,  // 戊寅起
    '丙': 6, '辛': 6,  // 庚寅起
    '丁': 8, '壬': 8,  // 壬寅起
    '戊': 0, '癸': 0   // 甲寅起
  }

  // 月支固定：寅(1月)、卯(2月)...丑(12月)
  // 这里简化处理，实际需要根据节气判断
  const zhiIndex = (month + 1) % 12
  const ganIndex = (monthGanStart[yearGan] + month - 1) % 10

  return {
    gan: TIANGAN[ganIndex],
    zhi: DIZHI[zhiIndex],
    ganIndex: ganIndex,
    zhiIndex: zhiIndex
  }
}

/**
 * 计算日柱
 * @param {number} year - 公历年份
 * @param {number} month - 公历月份
 * @param {number} day - 公历日期
 * @returns {object} 日柱 {gan, zhi}
 */
function getDayPillar(year, month, day) {
  // 使用蔡勒公式的变体计算日干支
  // 这里使用简化算法，实际应用中建议使用万年历数据表

  // 计算该日期距离1900年1月1日的天数
  const baseDate = new Date(1900, 0, 1)
  const targetDate = new Date(year, month - 1, day)
  const days = Math.floor((targetDate - baseDate) / (1000 * 60 * 60 * 24))

  // 1900年1月1日是甲戌日（干支序号10）
  const offset = 10
  const ganIndex = (offset + days) % 10
  const zhiIndex = (offset + days) % 12

  return {
    gan: TIANGAN[ganIndex],
    zhi: DIZHI[zhiIndex],
    ganIndex: ganIndex,
    zhiIndex: zhiIndex
  }
}

/**
 * 计算时柱
 * @param {string} dayGan - 日干
 * @param {number} hour - 小时 (0-23)
 * @returns {object} 时柱 {gan, zhi}
 */
function getHourPillar(dayGan, hour) {
  // 五鼠遁时口诀：甲己还加甲，乙庚丙作初，
  //               丙辛从戊起，丁壬庚子居，
  //               戊癸何方发，壬子是真途

  const hourGanStart = {
    '甲': 0, '己': 0,  // 甲子起
    '乙': 2, '庚': 2,  // 丙子起
    '丙': 4, '辛': 4,  // 戊子起
    '丁': 6, '壬': 6,  // 庚子起
    '戊': 8, '癸': 8   // 壬子起
  }

  // 时辰计算：23-1点为子时，1-3点为丑时，依此类推
  let zhiIndex
  if (hour === 23 || hour === 0) {
    zhiIndex = 0  // 子时
  } else {
    zhiIndex = Math.floor((hour + 1) / 2)
  }

  const ganIndex = (hourGanStart[dayGan] + zhiIndex) % 10

  return {
    gan: TIANGAN[ganIndex],
    zhi: DIZHI[zhiIndex],
    ganIndex: ganIndex,
    zhiIndex: zhiIndex
  }
}

/**
 * 计算十神
 * @param {string} dayGan - 日干
 * @param {string} targetGan - 目标天干
 * @returns {string} 十神名称
 */
function getShiShen(dayGan, targetGan) {
  const dayWuxing = WUXING[dayGan]
  const targetWuxing = WUXING[targetGan]
  const dayYinYang = TIANGAN.indexOf(dayGan) % 2  // 0为阳，1为阴
  const targetYinYang = TIANGAN.indexOf(targetGan) % 2
  const sameYinYang = dayYinYang === targetYinYang

  // 五行生克关系
  const wuxingRelation = {
    '木': { '木': '比', '火': '食', '土': '财', '金': '官', '水': '印' },
    '火': { '火': '比', '土': '食', '金': '财', '水': '官', '木': '印' },
    '土': { '土': '比', '金': '食', '水': '财', '木': '官', '火': '印' },
    '金': { '金': '比', '水': '食', '木': '财', '火': '官', '土': '印' },
    '水': { '水': '比', '木': '食', '火': '财', '土': '官', '金': '印' }
  }

  const relation = wuxingRelation[dayWuxing][targetWuxing]

  // 十神映射
  const shiShenMap = {
    '比': sameYinYang ? '比肩' : '劫财',
    '食': sameYinYang ? '食神' : '伤官',
    '财': sameYinYang ? '偏财' : '正财',
    '官': sameYinYang ? '七杀' : '正官',
    '印': sameYinYang ? '偏印' : '正印'
  }

  return shiShenMap[relation]
}

/**
 * 获取地支藏干
 * @param {string} zhi - 地支
 * @returns {array} 藏干列表
 */
function getCangGan(zhi) {
  return CANG_GAN[zhi] || []
}

/**
 * 计算大运
 * @param {string} gender - 性别 'male' 或 'female'
 * @param {string} yearGan - 年干
 * @param {object} monthPillar - 月柱
 * @param {number} birthYear - 出生年份
 * @param {number} birthMonth - 出生月份
 * @returns {object} 大运信息
 */
function getDaYun(gender, yearGan, monthPillar, birthYear, birthMonth) {
  // 判断大运顺逆
  // 阳男阴女顺行，阴男阳女逆行
  const yearGanYinYang = TIANGAN.indexOf(yearGan) % 2  // 0为阳，1为阴
  const isMale = gender === 'male'

  let isForward
  if (isMale) {
    // 男命：阳年顺行，阴年逆行
    isForward = yearGanYinYang === 0
  } else {
    // 女命：阴年顺行，阳年逆行
    isForward = yearGanYinYang === 1
  }

  // 计算起运年龄（简化计算，实际需要根据节气）
  // 这里使用简化公式：起运年龄 = (出生月到下一个节气的天数) / 3
  // 简化处理：假设起运年龄为1岁
  const startAge = 1

  // 排列大运（通常排8步）
  const daYunList = []
  for (let i = 0; i < 8; i++) {
    let ganIndex, zhiIndex

    if (isForward) {
      // 顺行：天干地支各+1
      ganIndex = (monthPillar.ganIndex + i + 1) % 10
      zhiIndex = (monthPillar.zhiIndex + i + 1) % 12
    } else {
      // 逆行：天干地支各-1
      ganIndex = (monthPillar.ganIndex - i - 1 + 10) % 10
      zhiIndex = (monthPillar.zhiIndex - i - 1 + 12) % 12
    }

    const ageStart = startAge + i * 10
    const ageEnd = ageStart + 9

    daYunList.push({
      gan: TIANGAN[ganIndex],
      zhi: DIZHI[zhiIndex],
      ageRange: `${ageStart}-${ageEnd}岁`,
      ageStart: ageStart,
      ageEnd: ageEnd
    })
  }

  return {
    isForward: isForward,
    startAge: startAge,
    daYunList: daYunList
  }
}

/**
 * 把排盘结果转成后端解读接口要的 birth 请求体。
 *
 * 后端 routes/analysis.js 的 computeFromBirth() 只认
 * { year, month, day, hour, minute, gender }，并会用这些字段在服务端
 * 重新排盘（服务端权威，不信任客户端算出的四柱/论断）。此前各页面直接把
 * { bazi, dayGan, wuxing } 发过去，后端一律返回 400「缺少出生信息」。
 *
 * @param {object} result paipan() 的返回值（含 input 字段）
 * @returns {object|null} birth 请求体；input 缺失或不完整时返回 null
 */
function buildBirthPayload(result) {
  const input = (result && result.input) || {}
  const { year, month, day, hour } = input
  if ([year, month, day, hour].some((v) => typeof v !== 'number' || isNaN(v))) {
    return null
  }
  return {
    year: year,
    month: month,
    day: day,
    hour: hour,
    minute: 0,
    gender: input.gender || 'male'
  }
}

/**
 * 完整的八字排盘
 * @param {object} params - 排盘参数
 * @returns {object} 排盘结果
 */
function paipan(params) {
  const { year, month, day, hour, gender } = params

  // 计算四柱
  const yearPillar = getYearPillar(year)
  const monthPillar = getMonthPillar(year, month, yearPillar.gan)
  const dayPillar = getDayPillar(year, month, day)
  const hourPillar = getHourPillar(dayPillar.gan, hour)

  // 计算十神
  const tenGods = {
    yearGan: getShiShen(dayPillar.gan, yearPillar.gan),
    yearZhi: getShiShen(dayPillar.gan, yearPillar.zhi),
    monthGan: getShiShen(dayPillar.gan, monthPillar.gan),
    monthZhi: getShiShen(dayPillar.gan, monthPillar.zhi),
    dayGan: '日主',
    dayZhi: getShiShen(dayPillar.gan, dayPillar.zhi),
    hourGan: getShiShen(dayPillar.gan, hourPillar.gan),
    hourZhi: getShiShen(dayPillar.gan, hourPillar.zhi)
  }

  // 获取藏干
  const cangGan = {
    year: getCangGan(yearPillar.zhi),
    month: getCangGan(monthPillar.zhi),
    day: getCangGan(dayPillar.zhi),
    hour: getCangGan(hourPillar.zhi)
  }

  // 计算大运
  const daYun = getDaYun(gender, yearPillar.gan, monthPillar, year, month)

  // 组装结果
  const result = {
    // 四柱
    yearPillar: {
      gan: yearPillar.gan,
      zhi: yearPillar.zhi
    },
    monthPillar: {
      gan: monthPillar.gan,
      zhi: monthPillar.zhi
    },
    dayPillar: {
      gan: dayPillar.gan,
      zhi: dayPillar.zhi
    },
    hourPillar: {
      gan: hourPillar.gan,
      zhi: hourPillar.zhi
    },

    // 十神
    tenGods: tenGods,

    // 藏干
    cangGan: cangGan,

    // 大运
    daYun: daYun,

    // 五行
    wuxing: {
      yearGan: WUXING[yearPillar.gan],
      yearZhi: WUXING[yearPillar.zhi],
      monthGan: WUXING[monthPillar.gan],
      monthZhi: WUXING[monthPillar.zhi],
      dayGan: WUXING[dayPillar.gan],
      dayZhi: WUXING[dayPillar.zhi],
      hourGan: WUXING[hourPillar.gan],
      hourZhi: WUXING[hourPillar.zhi]
    },

    // 原始输入
    input: {
      year: year,
      month: month,
      day: day,
      hour: hour,
      gender: gender
    }
  }

  return result
}

module.exports = {
  TIANGAN,
  DIZHI,
  WUXING,
  getYearPillar,
  getMonthPillar,
  getDayPillar,
  getHourPillar,
  getShiShen,
  getCangGan,
  getDaYun,
  paipan,
  buildBirthPayload
}
