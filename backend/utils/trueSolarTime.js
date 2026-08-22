// utils/trueSolarTime.js - 真太阳时换算
//
// 为什么需要：
//   八字的时辰是按**太阳的实际位置**分的（子时=太阳下中天），而钟表时间是
//   北京时间——全国统一按东经 120° 的平太阳时。两者在乌鲁木齐相差近 3 小时。
//   不做校正，西部出生者的时柱会系统性偏错一到两柱。
//
//   调研同类项目时发现这是业内标配（xuemian168/bazi-skill 等都做了），
//   而我们此前完全没有——属于「排盘正确性」层面的缺口，比提示词工程重要得多。
//
// 真太阳时 = 北京时间 + 经度时差 + 均时差
//
//   经度时差 = (当地经度 − 120°) × 4 分钟/度
//     地球 1 小时转 15°，故 1° = 4 分钟。喀什 75.99°E → −176 分钟。
//
//   均时差 = 视太阳时 − 平太阳时
//     地球轨道是椭圆且黄赤交角不为零，真太阳走得时快时慢，
//     一年内在 −14 分（2 月中）到 +16 分（11 月初）之间摆动。
//     **只做经度校正、漏掉均时差，最大会差 16 分钟**——足以跨过时辰边界，
//     这是「做了一半的真太阳时」最常见的错法。
//
// 默认关闭：不传出生地就完全不校正，行为与此前逐字节一致。
// 理由是历史记录里没有出生地字段，静默启用会改掉用户已经看过的盘。

// ── 均时差 ────────────────────────────────────────────────────────
// 采用 NOAA 太阳位置算法（Meeus《Astronomical Algorithms》的工程化版本），
// 精度优于 0.1 分钟。不用那个到处流传的 229.18 单项级数近似——它误差可达
// 0.5 分钟，而我们要判定的恰恰是「是否跨过时辰边界」这种分钟级问题。
const RAD = Math.PI / 180

function julianCentury(year, month, day, hourUtc) {
  // 儒略日（Fliegel-Van Flandern），再折算成 J2000 起算的儒略世纪
  let y = year
  let m = month
  if (m <= 2) { y -= 1; m += 12 }
  const a = Math.floor(y / 100)
  const b = 2 - a + Math.floor(a / 4)
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) +
    day + b - 1524.5 + hourUtc / 24
  return (jd - 2451545.0) / 36525
}

/**
 * 均时差（分钟）。正值表示真太阳走在平太阳前面（日晷快于钟表）。
 * @param {number} year @param {number} month @param {number} day
 * @param {number} [hourUtc=0] 世界时小时，用于日内插值；对分钟级精度影响很小
 * @returns {number} 分钟，约在 [-14.3, +16.5] 之间
 */
function equationOfTime(year, month, day, hourUtc = 0) {
  const t = julianCentury(year, month, day, hourUtc)

  // 太阳几何平黄经
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360
  // 太阳平近点角
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  // 地球轨道离心率
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  // 黄赤交角（含章动修正项）
  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))
  const eps0 = 23 + (26 + seconds / 60) / 60
  const omega = 125.04 - 1934.136 * t
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)

  const y = Math.tan(eps / 2 * RAD) ** 2

  const eqTime = y * Math.sin(2 * l0 * RAD)
    - 2 * e * Math.sin(m * RAD)
    + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD)
    - 0.5 * y * y * Math.sin(4 * l0 * RAD)
    - 1.25 * e * e * Math.sin(2 * m * RAD)

  return 4 * (eqTime / RAD)   // 弧度 → 度 → 分钟（1° = 4min）
}

// ── 城市经度表 ────────────────────────────────────────────────────
// 离线表，不调地理编码 API：排盘是核心链路，不能因为第三方地图挂了就排不出盘；
// 而且出生地只需要精确到市——市内跨度撑死几十公里，折合不到 3 分钟，
// 远小于均时差本身的量级。
//
// 覆盖：4 直辖市 + 省会/首府 + 主要地级市 + 港澳台。
// 西部城市务必留全——正是它们的偏差最大（喀什 −176 分钟，接近 3 个时辰）。
const CITY_LONGITUDE = {
  // 直辖市
  北京: 116.41, 上海: 121.47, 天津: 117.20, 重庆: 106.55,
  // 省会 / 首府
  哈尔滨: 126.53, 长春: 125.32, 沈阳: 123.43, 呼和浩特: 111.75, 石家庄: 114.51,
  太原: 112.55, 济南: 117.00, 郑州: 113.62, 西安: 108.95, 兰州: 103.83,
  西宁: 101.78, 银川: 106.27, 乌鲁木齐: 87.62, 拉萨: 91.11, 成都: 104.07,
  贵阳: 106.63, 昆明: 102.71, 南宁: 108.37, 海口: 110.20, 长沙: 112.98,
  武汉: 114.30, 南昌: 115.89, 合肥: 117.28, 南京: 118.78, 杭州: 120.15,
  福州: 119.30, 广州: 113.26,
  // 港澳台
  香港: 114.17, 澳门: 113.55, 台北: 121.52, 高雄: 120.30, 台中: 120.68,
  // 主要地级市（东部）
  深圳: 114.06, 青岛: 120.38, 大连: 121.61, 厦门: 118.09, 苏州: 120.62,
  无锡: 120.30, 宁波: 121.55, 温州: 120.70, 佛山: 113.12, 东莞: 113.75,
  珠海: 113.55, 汕头: 116.68, 泉州: 118.68, 常州: 119.95, 南通: 120.86,
  扬州: 119.42, 盐城: 120.16, 徐州: 117.18, 台州: 121.43, 嘉兴: 120.75,
  金华: 119.65, 绍兴: 120.58, 湖州: 120.09, 烟台: 121.39, 潍坊: 119.16,
  临沂: 118.35, 淄博: 118.05, 唐山: 118.18, 保定: 115.47, 邯郸: 114.49,
  秦皇岛: 119.60, 芜湖: 118.38,
  // 中部
  洛阳: 112.45, 南阳: 112.53, 九江: 115.99, 襄阳: 112.14, 宜昌: 111.29,
  岳阳: 113.13, 衡阳: 112.57, 株洲: 113.13, 常德: 111.70, 赣州: 114.93,
  信阳: 114.09, 大同: 113.30, 运城: 111.00,
  // 东北
  大庆: 125.11, 齐齐哈尔: 123.92, 牡丹江: 129.63, 佳木斯: 130.32,
  吉林: 126.55, 延吉: 129.51, 鞍山: 123.01, 抚顺: 123.96, 锦州: 121.14,
  丹东: 124.38,
  // 西南
  桂林: 110.29, 柳州: 109.42, 遵义: 106.93, 绵阳: 104.68, 德阳: 104.40,
  宜宾: 104.62, 泸州: 105.44, 南充: 106.11, 大理: 100.23, 丽江: 100.23,
  攀枝花: 101.72, 西昌: 102.26,
  // 西北（偏差最大，务必留全）
  包头: 109.84, 鄂尔多斯: 109.99, 榆林: 109.73, 宝鸡: 107.24, 咸阳: 108.71,
  天水: 105.72, 酒泉: 98.51, 敦煌: 94.66, 格尔木: 94.90, 喀什: 75.99,
  伊宁: 81.32, 克拉玛依: 84.89, 阿克苏: 80.26, 哈密: 93.51, 库尔勒: 86.15,
  吐鲁番: 89.19, 石河子: 86.04, 日喀则: 88.88, 昌都: 97.18
}

// 东经 120°：北京时间（UTC+8）的标准经线
const STANDARD_LONGITUDE = 120

/**
 * 查城市经度。容忍「市/区/县」后缀与前后空白。
 * @param {string} place
 * @returns {number|null} 东经度数，查不到返回 null
 */
function lookupLongitude(place) {
  if (typeof place !== 'string') return null
  const name = place.trim()
  if (!name) return null
  if (CITY_LONGITUDE[name] != null) return CITY_LONGITUDE[name]
  // 「北京市」「乌鲁木齐市」这类写法
  const stripped = name.replace(/[市区县]$/, '')
  if (CITY_LONGITUDE[stripped] != null) return CITY_LONGITUDE[stripped]
  return null
}

/**
 * 把北京时间换算成真太阳时。
 *
 * ⚠️ 可能跨日：喀什 00:30 出生，减 176 分钟后是**前一天** 21:34。
 * 跨日会改变日柱，进而改变日主与全部十神，所以这里必须返回完整年月日，
 * 由调用方拿去重新排盘，绝不能只调整时分。
 *
 * @param {object} birth {year, month, day, hour, minute}
 * @param {number} longitude 东经度数（西经传负）
 * @returns {object} {year, month, day, hour, minute, offsetMinutes,
 *                    longitudeOffset, equationOfTime, crossedDay}
 */
function toTrueSolarTime(birth, longitude) {
  const { year, month, day, hour, minute = 0 } = birth

  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    throw Object.assign(new Error('经度必须是有限数值'), { code: 'INVALID_INPUT' })
  }
  if (longitude < -180 || longitude > 180) {
    throw Object.assign(new Error('经度须在 -180 到 180 之间'), { code: 'INVALID_INPUT' })
  }

  const longitudeOffset = (longitude - STANDARD_LONGITUDE) * 4

  // 均时差按当日计算。它一天内变化不足 0.3 分钟，
  // 故用北京时间折算的 UTC 小时取值即可，不必为此迭代。
  const eot = equationOfTime(year, month, day, hour - 8)

  const offsetMinutes = longitudeOffset + eot

  // 用 UTC 系列的 Date 做日期运算：本地时区参与运算会在跨月/跨年时引入
  // 时区偏移，而我们处理的是「挂历上的年月日」，与运行环境的时区无关。
  const base = Date.UTC(year, month - 1, day, hour, minute, 0)
  const shifted = new Date(base + Math.round(offsetMinutes) * 60000)

  const result = {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    offsetMinutes: Math.round(offsetMinutes),
    longitudeOffset: Math.round(longitudeOffset * 10) / 10,
    equationOfTime: Math.round(eot * 10) / 10
  }
  result.crossedDay = result.day !== day || result.month !== month || result.year !== year
  return result
}

/**
 * 从排盘入参里解析出经度。
 * 支持两种写法，都不传则返回 null（= 不做校正，保持默认关闭）。
 *   birth.longitude   直接给经度，优先
 *   birth.birthPlace  给城市名，查表
 * @returns {{longitude:number, source:string, place:string|null}|null}
 */
function resolveLongitude(birth) {
  if (!birth || typeof birth !== 'object') return null

  if (birth.longitude != null && birth.longitude !== '') {
    const lng = Number(birth.longitude)
    if (!Number.isFinite(lng)) {
      throw Object.assign(new Error('longitude 必须是数值'), { code: 'INVALID_INPUT' })
    }
    return { longitude: lng, source: 'longitude', place: birth.birthPlace || null }
  }

  if (birth.birthPlace) {
    const lng = lookupLongitude(birth.birthPlace)
    if (lng == null) {
      // 明确报错而不是静默忽略：用户填了出生地却没生效，
      // 会以为校正过了，比直接告诉他查不到更糟。
      throw Object.assign(
        new Error(`未收录出生地「${birth.birthPlace}」，可改填 longitude 经度数值`),
        { code: 'INVALID_INPUT' }
      )
    }
    return { longitude: lng, source: 'birthPlace', place: String(birth.birthPlace).trim() }
  }

  return null
}

module.exports = {
  equationOfTime,
  toTrueSolarTime,
  lookupLongitude,
  resolveLongitude,
  CITY_LONGITUDE,
  STANDARD_LONGITUDE
}
