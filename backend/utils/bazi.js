// utils/bazi.js - 八字排盘引擎（基于 lunar-javascript）
//
// 设计原则：排盘准确性由经过验证的 lunar-javascript 保证。
// 本模块只负责：① 参数校验 ② 调用库 ③ 组装成前端需要的结构。
// 节气分月、立春分年、晚子时、起运年龄、顺逆 全部交给库处理，
// 杜绝自研简化算法（对齐 spec 5.1.1 禁止项）。

const { Solar } = require('lunar-javascript')

const WUXING = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土',
  '巳': '火', '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水'
}

// 支持的公历范围（对齐 spec 6.1 / 4.5）
const MIN_YEAR = 1900
const MAX_YEAR = 2100

/**
 * 校验排盘输入
 * @returns {string|null} 错误信息，null 表示通过
 */
function validateInput({ year, month, day, hour, minute, gender }) {
  if (![year, month, day, hour].every(v => Number.isInteger(v))) {
    return '年月日时必须为整数'
  }
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return `暂不支持该日期范围，请输入 ${MIN_YEAR}-${MAX_YEAR} 年之间的日期`
  }
  if (month < 1 || month > 12) return '月份必须在 1-12 之间'
  if (day < 1 || day > 31) return '日期必须在 1-31 之间'
  if (hour < 0 || hour > 23) return '时间格式错误，请输入正确的时间（00:00-23:59）'
  if (minute != null && (minute < 0 || minute > 59)) return '分钟必须在 0-59 之间'
  if (gender !== 'male' && gender !== 'female') return "性别必须为 'male' 或 'female'"
  return null
}

/**
 * 完整八字排盘
 * @param {object} params {year, month, day, hour, minute=0, gender}
 * @returns {object} 排盘结果
 */
function paipan(params) {
  const error = validateInput(params)
  if (error) {
    const e = new Error(error)
    e.code = 'INVALID_INPUT'
    throw e
  }

  const { year, month, day, hour, minute = 0, gender } = params

  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0)
  const lunar = solar.getLunar()
  const ec = lunar.getEightChar()

  // 四柱
  const yearPillar = { gan: ec.getYearGan(), zhi: ec.getYearZhi() }
  const monthPillar = { gan: ec.getMonthGan(), zhi: ec.getMonthZhi() }
  const dayPillar = { gan: ec.getDayGan(), zhi: ec.getDayZhi() }
  const hourPillar = { gan: ec.getTimeGan(), zhi: ec.getTimeZhi() }

  // 十神：天干对日主，地支取藏干本气（[0] 为本气，库内已处理阴阳）
  const tenGods = {
    yearGan: ec.getYearShiShenGan(),
    yearZhi: ec.getYearShiShenZhi()[0],
    monthGan: ec.getMonthShiShenGan(),
    monthZhi: ec.getMonthShiShenZhi()[0],
    dayGan: '日主',
    dayZhi: ec.getDayShiShenZhi()[0],
    hourGan: ec.getTimeShiShenGan(),
    hourZhi: ec.getTimeShiShenZhi()[0]
  }

  // 地支藏干（含余气，对齐 spec 6.2 藏干信息）
  const cangGan = {
    year: ec.getYearHideGan(),
    month: ec.getMonthHideGan(),
    day: ec.getDayHideGan(),
    hour: ec.getTimeHideGan()
  }

  // 五行
  const wuxing = {
    yearGan: WUXING[yearPillar.gan], yearZhi: WUXING[yearPillar.zhi],
    monthGan: WUXING[monthPillar.gan], monthZhi: WUXING[monthPillar.zhi],
    dayGan: WUXING[dayPillar.gan], dayZhi: WUXING[dayPillar.zhi],
    hourGan: WUXING[hourPillar.gan], hourZhi: WUXING[hourPillar.zhi]
  }

  // 大运：起运年龄、顺逆由库按节气精确计算
  // 注意：getDaYun()[0] 是“起运前”占位段（干支为空），需过滤
  const yun = ec.getYun(gender === 'male' ? 1 : 0)
  const daYunList = yun.getDaYun()
    .filter(d => d.getGanZhi())   // 去掉起运前占位段
    .slice(0, 8)                  // 取 8 步（对齐 spec 5.3.1 通常 8-10 步）
    .map(d => ({
      gan: d.getGanZhi().charAt(0),
      zhi: d.getGanZhi().charAt(1),
      ganZhi: d.getGanZhi(),
      ageStart: d.getStartAge(),
      ageEnd: d.getEndAge(),
      ageRange: `${d.getStartAge()}-${d.getEndAge()}岁`,
      startYear: d.getStartYear()
    }))
  const daYun = {
    isForward: yun.isForward(),      // true=顺行
    // 起运年龄（虚岁）。由库按节气精算，取第一步大运的起始年龄。
    // 小程序结果页直接绑定该字段；其本地兜底算法里这个值是写死的 1 岁。
    startAge: daYunList.length ? daYunList[0].ageStart : null,
    startYear: yun.getStartYear(),   // 起运需经过的年数
    startMonth: yun.getStartMonth(),
    startDay: yun.getStartDay(),
    daYunList
  }

  return {
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    tenGods,
    cangGan,
    wuxing,
    daYun,
    input: { year, month, day, hour, minute, gender }
  }
}

module.exports = { paipan, validateInput, WUXING, MIN_YEAR, MAX_YEAR }
