// utils/bazi.js - 八字排盘算法（离线兜底用）
//
// ⚠️ 定位：排盘权威在后端 /api/v1/bazi/paipan（基于 lunar-javascript）。
//    本模块只在网络不可达时兜底，结果会打 isLocalFallback 标记。
//
// 与后端的一致性由 utils/solarTerms.js 保证：那张节气表是用后端同一个引擎
// 预生成的，本模块的立春分年、节气分月、起运年龄都基于它推算，因此两端
// **按构造对齐**，而不是两套算法各自逼近同一个答案。
//
// 历史坑（2026-07-25 修）：此前年柱按日历年、月柱按日历月切分，且起运年龄
// 写死 1 岁。实测四柱与后端 4/4 不一致（月柱全错、晚子时错），等于给用户看
// 了另一个八字。改动本模块或重新生成节气表后，务必跑
// backend/utils/__tests__/paipan-parity.test.js 校验两端逐日一致。

const solarTerms = require('./solarTerms')
const { resolveLongitude, toTrueSolarTime } = require('./trueSolarTime')
const { analyzeShenSha } = require('./shensha')

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
 * 求某时刻所属的「命理月序」。
 *
 * 命理以节（非中气、非日历月）分月：小寒起丑月、立春起寅月……大雪起子月。
 * solarTerms 的 12 个节按公历月序排列，索引 0=小寒(丑) 1=立春(寅) … 11=大雪(子)。
 *
 * @returns {{jieIndex:number, jieYear:number}}
 *   jieIndex 为该时刻已进入的节的索引；jieYear 为该节所属公历年
 *   （1 月立春前出生者属上一年的大雪/子月，故 jieYear 可能是 year-1）
 */
function locateJie(year, month, day, hour, minute) {
  // 从当年最后一个节往前找第一个「已到达」的节
  for (let i = 11; i >= 0; i--) {
    if (solarTerms.reachedJie(year, i, month, day, hour, minute)) {
      return { jieIndex: i, jieYear: year }
    }
  }
  // 当年小寒都还没到（1 月 1-5 日左右出生）→ 归入上一年的大雪(子月)
  return { jieIndex: 11, jieYear: year - 1 }
}

/**
 * 计算年柱（以立春为界，不是公历元旦）
 *
 * 立春前出生者仍属上一年干支。例：2002-01-15 生人年柱是辛巳而非壬午。
 *
 * @param {number} year 公历年份
 * @param {number} [month] 公历月；省略时按公历年计算（兼容旧调用）
 * @returns {object} 年柱 {gan, zhi, ganIndex, zhiIndex}
 */
function getYearPillar(year, month, day, hour, minute) {
  let y = year
  if (month != null) {
    // 立春（索引 1）之前出生 → 归上一年
    const beforeLiChun = !solarTerms.reachedJie(year, 1, month, day, hour || 0, minute || 0)
    // 只有 1、2 月才可能在立春之前，避免年末误判
    if (beforeLiChun && month <= 2) y = year - 1
  }

  const ganIndex = ((y - 4) % 10 + 10) % 10
  const zhiIndex = ((y - 4) % 12 + 12) % 12

  return {
    gan: TIANGAN[ganIndex],
    zhi: DIZHI[zhiIndex],
    ganIndex: ganIndex,
    zhiIndex: zhiIndex
  }
}

/**
 * 计算月柱（以节分月，不是公历月）
 *
 * 五虎遁月口诀：甲己之年丙作首，乙庚之岁戊为头，
 *               丙辛之岁寻庚上，丁壬壬寅顺行流，
 *               戊癸之年甲寅首
 *
 * @param {number} jieIndex 0=小寒(丑) 1=立春(寅) … 11=大雪(子)
 * @param {string} yearGan  年干（须是立春分界后的年干）
 */
function getMonthPillar(jieIndex, yearGan) {
  const monthGanStart = {
    '甲': 2, '己': 2,  // 丙寅起
    '乙': 4, '庚': 4,  // 戊寅起
    '丙': 6, '辛': 6,  // 庚寅起
    '丁': 8, '壬': 8,  // 壬寅起
    '戊': 0, '癸': 0   // 甲寅起
  }

  // 节索引 → 月支索引：小寒(0)→丑(1)，立春(1)→寅(2)，……大雪(11)→子(0)
  const zhiIndex = (jieIndex + 1) % 12
  // 寅月为该年第 1 个月（五虎遁的起点），小寒/丑月排在寅月之前算第 12 个
  const monthOrder = jieIndex === 0 ? 11 : jieIndex - 1
  const ganIndex = (monthGanStart[yearGan] + monthOrder) % 10

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
 *
 * 晚子时（23:00-23:59）：日柱仍算当日，但时干按**次日**日干起遁
 * （对齐后端 lunar-javascript 的处理）。此前统一用当日日干，
 * 23 点出生的盘时柱必错。
 *
 * 五鼠遁时口诀：甲己还加甲，乙庚丙作初，
 *               丙辛从戊起，丁壬庚子居，
 *               戊癸何方发，壬子是真途
 *
 * @param {string} dayGan   日干（当日）
 * @param {number} hour     小时 (0-23)
 * @param {string} [nextDayGan] 次日日干，晚子时用；省略则退回 dayGan
 * @returns {object} 时柱 {gan, zhi, ganIndex, zhiIndex}
 */
// 晚子时（23:00-23:59）日柱归属流派，必须与后端 BAZI_LATE_ZI_SECT 保持一致，
// 否则 23 点出生的盘会出现「服务端排盘」与「本地兜底」结论打架。
//   1 = 日柱进次日（默认，盘面自洽）
//   2 = 日柱仍算当日、时干按次日起遁（会排出时柱推不回日主的矛盾盘）
// 详见 backend/utils/bazi.js 中 LATE_ZI_SECT 的说明。
// 后端若改成 2，这里必须同步改，并重跑 paipan-parity 测试。
const LATE_ZI_SECT = 1

function getHourPillar(dayGan, hour, nextDayGan) {
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

  // 晚子时用次日日干起遁
  const startGan = (hour === 23 && nextDayGan) ? nextDayGan : dayGan
  const ganIndex = (hourGanStart[startGan] + zhiIndex) % 10

  return {
    gan: TIANGAN[ganIndex],
    zhi: DIZHI[zhiIndex],
    ganIndex: ganIndex,
    zhiIndex: zhiIndex
  }
}

/**
 * 计算地支的十神：取该支的**藏干本气**（CANG_GAN[zhi][0]）对日主论十神。
 *
 * 这是命理通则，也是后端 lunar-javascript 的 getXxxShiShenZhi()[0] 的取值方式，
 * 两端由此对齐。不能拿地支本身当天干去论——地支的阴阳与其藏干本气的阴阳
 * 并不总是一致（亥为阴支，本气壬却是阳干），直接论会错到「比肩/劫财」这类
 * 同性异性的分档上。
 *
 * @param {string} dayGan 日干
 * @param {string} zhi    地支
 * @returns {string} 十神名
 */
function getShiShenOfZhi(dayGan, zhi) {
  const benQi = CANG_GAN[zhi] && CANG_GAN[zhi][0]
  if (!benQi) throw new Error(`未知地支「${zhi}」`)
  return getShiShen(dayGan, benQi)
}

/**
 * 计算十神
 * @param {string} dayGan - 日干
 * @param {string} targetGan - 目标天干
 * @returns {string} 十神名称
 */
function getShiShen(dayGan, targetGan) {
  // 只接受天干。地支必须先取藏干本气再进来——见 getShiShenOfZhi。
  //
  // 这里曾被直接传入地支：WUXING 表恰好也收了地支，五行查得到，于是错误被
  // 掩盖；但 TIANGAN.indexOf('亥') 返回 -1，-1 % 2 === -1 永不等于日干的 0/1，
  // 导致 sameYinYang 恒为 false，四个地支十神一律取到「异性」那一档
  // （劫财/伤官/正财/正官/正印）。黄金基准盘 2002-11-20 上 3/4 地支十神算错。
  // 显式抛错，别再让它静默走过去。
  if (TIANGAN.indexOf(targetGan) === -1) {
    throw new Error(`getShiShen 只接受天干，收到「${targetGan}」；地支请用 getShiShenOfZhi`)
  }

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

// 时辰序号：子=0(23:00-00:59) 丑=1(01:00-02:59) … 亥=11(21:00-22:59)
// 与 lunar-javascript 的 LunarUtil.getTimeZhiIndex 同规则
function timeZhiIndex(hour, minute) {
  const hm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  let x = 1
  for (let i = 1; i < 22; i += 2) {
    const lo = `${String(i).padStart(2, '0')}:00`
    const hi = `${String(i + 1).padStart(2, '0')}:59`
    if (hm >= lo && hm <= hi) return x
    x++
  }
  return 0
}

// 两个日期相差的整天数（忽略时分）
function daysBetween(a, b) {
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)
  return Math.round(ms / 86400000)
}

/**
 * 起运时刻距出生的「年/月/日」偏移。
 *
 * 严格照搬 lunar-javascript 的 Yun 起运算法（默认 sect=1）：
 *   顺行数到下一个节、逆行数到上一个节；三天折一年、一天折四个月、
 *   一个时辰折十天。这里必须与后端逐步一致，否则起运年龄会差一岁。
 *
 * @returns {{year:number, month:number, day:number}}
 */
function calcStartOffset(birth, jieLoc, isForward) {
  let prev, next

  if (isForward) {
    // 下一个节：当前节索引 +1，跨年则进到下一年的小寒
    const ni = jieLoc.jieIndex + 1
    const ny = ni > 11 ? jieLoc.jieYear + 1 : jieLoc.jieYear
    const j = solarTerms.getJie(ny, ni > 11 ? 0 : ni)
    if (!j) return null
    next = { year: ny, ...j }
  } else {
    // 上一个节就是当前所在的节
    const j = solarTerms.getJie(jieLoc.jieYear, jieLoc.jieIndex)
    if (!j) return null
    prev = { year: jieLoc.jieYear, ...j }
  }

  const start = isForward ? birth : prev
  const end = isForward ? next : birth

  // 注意 23 点的特例：起运计算里按亥(11)处理，不按子(0)
  const endTzi = end.hour === 23 ? 11 : timeZhiIndex(end.hour, end.minute || 0)
  const startTzi = start.hour === 23 ? 11 : timeZhiIndex(start.hour, start.minute || 0)

  let hourDiff = endTzi - startTzi
  let dayDiff = daysBetween(start, end)
  if (hourDiff < 0) {
    hourDiff += 12
    dayDiff--
  }

  const monthDiff = Math.floor((hourDiff * 10) / 30)
  let month = dayDiff * 4 + monthDiff
  const day = hourDiff * 10 - monthDiff * 30
  const year = Math.floor(month / 12)
  month = month - year * 12

  return { year, month, day }
}

/**
 * 起运虚岁 = 起运公历年 - 出生公历年 + 1
 * （lunar-javascript 的 buildDaYun 就是这么定的，不是天数直接折算）
 */
function calcStartAge(birth, jieLoc, isForward) {
  const off = calcStartOffset(birth, jieLoc, isForward)
  if (!off) return 1 // 表外年份，退回保守值

  // 起运公历日期 = 出生日期 + year 年 + month 月 + day 天
  const d = new Date(birth.year + off.year, birth.month - 1 + off.month, birth.day + off.day)
  return d.getFullYear() - birth.year + 1
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
function getDaYun(gender, yearGan, monthPillar, birth, jieLoc) {
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

  // 起运年龄：顺行数到下一个节、逆行数到上一个节，三天折一年（余数舍去）。
  // 此前这里写死 1 岁，导致所有人的 8 步大运年龄区间整体偏移。
  const startAge = calcStartAge(birth, jieLoc, isForward)

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
  const payload = {
    year: year,
    month: month,
    day: day,
    hour: hour,
    // 分钟必须如实带上，不能写死 0：立春交年的交接时刻精确到分钟，
    // 起运年龄也是按分钟推的。写死 0 会让「解读依据的盘」与
    // 「页面展示的盘」在边界样本上不是同一个。
    minute: typeof input.minute === 'number' ? input.minute : 0,
    gender: input.gender || 'male'
  }

  // 出生地：有才带，没有就不带（真太阳时默认关闭）。
  // 漏带会让服务端按钟表时间重排，解读与展示对不上。
  if (input.birthPlace) payload.birthPlace = input.birthPlace
  if (typeof input.longitude === 'number') payload.longitude = input.longitude

  return payload
}

/**
 * 完整的八字排盘
 * @param {object} params - 排盘参数
 * @returns {object} 排盘结果
 */
function paipan(params) {
  const gender = params.gender
  const clock = {
    year: params.year,
    month: params.month,
    day: params.day,
    hour: params.hour,
    minute: params.minute || 0
  }

  // 真太阳时：默认关闭，只有传了 birthPlace / longitude 才校正。
  // 逻辑与后端同源（utils/trueSolarTime.js 由后端生成），保证两端一致。
  const geo = resolveLongitude(params)
  let year = clock.year
  let month = clock.month
  let day = clock.day
  let hour = clock.hour
  let minute = clock.minute
  let trueSolarTime = null

  if (geo) {
    const t = toTrueSolarTime(clock, geo.longitude)
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

  // 定位所在的「节」——年柱、月柱、起运年龄都以它为准（不是日历年月）
  const jieLoc = locateJie(year, month, day, hour, minute)

  // 计算四柱
  const yearPillar = getYearPillar(year, month, day, hour, minute)
  const monthPillar = getMonthPillar(jieLoc.jieIndex, yearPillar.gan)
  // 晚子时（23 点）时干按次日日干起遁，故无论哪个流派都需要次日日柱
  const nextDay = new Date(year, month - 1, day + 1)
  const nextDayPillar = getDayPillar(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate())

  // 流派 1：23 点即进次日，日柱与时柱同步跨日，盘面自洽
  // 流派 2：日柱留在当日，时干仍按次日起遁（时柱推不回日主）
  const calendarDayPillar = getDayPillar(year, month, day)
  const dayPillar = (LATE_ZI_SECT === 1 && hour === 23) ? nextDayPillar : calendarDayPillar

  // 起遁基准始终是次日日干——这一点两个流派相同
  const hourPillar = getHourPillar(dayPillar.gan, hour, nextDayPillar.gan)

  // 计算十神
  const tenGods = {
    yearGan: getShiShen(dayPillar.gan, yearPillar.gan),
    yearZhi: getShiShenOfZhi(dayPillar.gan, yearPillar.zhi),
    monthGan: getShiShen(dayPillar.gan, monthPillar.gan),
    monthZhi: getShiShenOfZhi(dayPillar.gan, monthPillar.zhi),
    dayGan: '日主',
    dayZhi: getShiShenOfZhi(dayPillar.gan, dayPillar.zhi),
    hourGan: getShiShen(dayPillar.gan, hourPillar.gan),
    hourZhi: getShiShenOfZhi(dayPillar.gan, hourPillar.zhi)
  }

  // 获取藏干
  const cangGan = {
    year: getCangGan(yearPillar.zhi),
    month: getCangGan(monthPillar.zhi),
    day: getCangGan(dayPillar.zhi),
    hour: getCangGan(hourPillar.zhi)
  }

  // 计算大运
  const daYun = getDaYun(gender, yearPillar.gan, monthPillar, { year, month, day, hour, minute }, jieLoc)

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

    // 原始输入：必须是用户填的**钟表时间**，不是校正后的真太阳时。
    // 上面 year/month/day/hour 已被真太阳时改写过，这里若直接用它们，
    // 记录回显会显示成校正后的时间，且拿去二次排盘会把校正叠加两次。
    input: {
      year: clock.year,
      month: clock.month,
      day: clock.day,
      hour: clock.hour,
      minute: clock.minute,
      gender: gender,
      // 出生地也是入参的一部分：buildBirthPayload 要靠它把校正条件
      // 原样带给服务端，否则服务端会按钟表时间重排出另一个盘
      birthPlace: geo && geo.place ? geo.place : undefined,
      longitude: geo && geo.source === 'longitude' ? geo.longitude : undefined
    },

    trueSolarTime: trueSolarTime
  }

  // 神煞与命宫身宫。纯查表，不依赖网络，离线兜底时照样算得出来。
  // 放在 result 组装完之后：analyzeShenSha 读的是四柱，而四柱到这里才齐。
  result.shenSha = analyzeShenSha(result)

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
  getShiShenOfZhi,
  getCangGan,
  getDaYun,
  paipan,
  buildBirthPayload
}
