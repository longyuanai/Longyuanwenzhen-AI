// utils/bazi.js - 八字排盘引擎（基于 lunar-javascript）
//
// 设计原则：排盘准确性由经过验证的 lunar-javascript 保证。
// 本模块只负责：① 参数校验 ② 调用库 ③ 组装成前端需要的结构。
// 节气分月、立春分年、晚子时、起运年龄、顺逆 全部交给库处理，
// 杜绝自研简化算法（对齐 spec 5.1.1 禁止项）。

const { Solar } = require('lunar-javascript')
const { resolveLongitude, toTrueSolarTime } = require('./trueSolarTime')

const WUXING = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土',
  '巳': '火', '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水'
}

// 支持的公历范围（对齐 spec 6.1 / 4.5）
const MIN_YEAR = 1900
const MAX_YEAR = 2100

// 晚子时（23:00-23:59）日柱归属流派。
//
//   1 = 日柱进次日（默认）。子时即新的一天，日柱与时柱同步跨日。
//   2 = 日柱仍算当日，但时干仍按次日日干起遁（lunar-javascript 的默认）。
//
// 为什么默认改成 1：流派 2 会排出**盘面自相矛盾**的命盘。
// 实例 1965-12-23 23:45：流派 2 给出 日柱=辛亥、时柱=庚子，
// 而按五鼠遁，辛日的子时应是戊子——庚子是从次日日干「壬」推来的。
// 于是时干十神以「辛」为日主去算庚（劫财），若按流派 1（日主壬）
// 同一个庚是偏印。十神 → 身强弱 → 喜忌 → 格局 全线级联走偏，
// 影响所有 23 点出生的用户（约 4%）。
//
// 该分歧由 scripts/diff-paipan.js 与 tyme4ts 差分校验发现：
// 5000 盘中 219 例日柱不一致，100% 落在 23 点。
// 流派 1 同时对齐 tyme4ts 默认与 cantian-ai/bazi-mcp 的取值。
//
// 仍保留切换口子：命理各家对晚子时确有分歧，遇到坚持流派 2 的
// 命理师时设 BAZI_LATE_ZI_SECT=2 即可，无需改代码。
const LATE_ZI_SECT = process.env.BAZI_LATE_ZI_SECT === '2' ? 2 : 1

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
 *
 * 真太阳时：默认关闭。只有传了 birthPlace 或 longitude 才校正——
 * 历史排盘记录里没有出生地字段，静默启用会改掉用户已经看过的盘。
 *
 * @param {object} params {year, month, day, hour, minute=0, gender,
 *                         birthPlace?, longitude?}
 * @returns {object} 排盘结果；启用校正时附 trueSolarTime 元信息块
 */
function paipan(params) {
  const error = validateInput(params)
  if (error) {
    const e = new Error(error)
    e.code = 'INVALID_INPUT'
    throw e
  }

  // 用户填的钟表时间（北京时间），原样留档用于展示对比
  const clock = {
    year: params.year,
    month: params.month,
    day: params.day,
    hour: params.hour,
    minute: params.minute || 0
  }
  const gender = params.gender

  // 解析出生地 → 经度。查不到城市会抛 INVALID_INPUT（不静默忽略：
  // 用户填了出生地却没生效，比直接告诉他查不到更糟）
  const geo = resolveLongitude(params)

  let year = clock.year
  let month = clock.month
  let day = clock.day
  let hour = clock.hour
  let minute = clock.minute
  let trueSolarTime = null

  if (geo) {
    const t = toTrueSolarTime(clock, geo.longitude)
    // 校正可能把日期推出支持范围：喀什 1900-01-01 00:30 会退到 1899-12-31，
    // 而节气表与 lunar 的可靠区间都从 1900 起。宁可明确报错也不排错盘。
    if (t.year < MIN_YEAR || t.year > MAX_YEAR) {
      const e = new Error(
        `真太阳时校正后为 ${t.year}-${t.month}-${t.day}，超出 ${MIN_YEAR}-${MAX_YEAR} 支持范围`)
      e.code = 'INVALID_INPUT'
      throw e
    }
    year = t.year; month = t.month; day = t.day; hour = t.hour; minute = t.minute
    trueSolarTime = {
      enabled: true,
      place: geo.place,
      longitude: geo.longitude,
      source: geo.source,
      clockTime: clock,
      solarTime: { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute },
      offsetMinutes: t.offsetMinutes,
      longitudeOffset: t.longitudeOffset,
      equationOfTime: t.equationOfTime,
      crossedDay: t.crossedDay
    }
  }

  const solar = Solar.fromYmdHms(year, month, day, hour, minute, 0)
  const lunar = solar.getLunar()
  const ec = lunar.getEightChar()
  // 必须在读取任何柱之前设置：sect 只影响晚子时的日柱归属，
  // 但十神/藏干都由日柱派生，设晚了拿到的是旧值。
  ec.setSect(LATE_ZI_SECT)

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
    // input 保持「用户填的钟表时间」语义不变：下游的落库、回显、
    // 重新排盘都依赖它，改成校正后的时间会让记录无法还原用户输入，
    // 且二次排盘会把校正叠加两次。校正结果单独放 trueSolarTime。
    input: {
      ...clock,
      gender,
      // 出生地是入参的一部分：落库与二次排盘都要靠它还原同一个盘
      birthPlace: geo && geo.place ? geo.place : undefined,
      longitude: geo && geo.source === 'longitude' ? geo.longitude : undefined
    },
    trueSolarTime
  }
}

module.exports = { paipan, validateInput, WUXING, MIN_YEAR, MAX_YEAR, LATE_ZI_SECT }
