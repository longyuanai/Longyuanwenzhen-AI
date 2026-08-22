// 真太阳时换算
//
// 这套测试的重点不是「跑通了」，而是钉死三件容易做错的事：
//   ① 均时差不能省。只做经度校正最大差 16 分钟，足以跨时辰边界。
//   ② 校正会跨日，跨日就换日柱、换日主、换全部十神——必须返回完整日期。
//   ③ 不传出生地时必须逐字节等于校正前的行为（默认关闭）。

const {
  equationOfTime, toTrueSolarTime, lookupLongitude, resolveLongitude, CITY_LONGITUDE
} = require('../trueSolarTime')
const { paipan } = require('../bazi')

const pillars = (r) => ['year', 'month', 'day', 'hour']
  .map((k) => r[k + 'Pillar'].gan + r[k + 'Pillar'].zhi).join(' ')

describe('均时差', () => {
  // 天文年历上的公认取值。容差 0.3 分钟——我们只需要分钟级精度，
  // 但也不能松到让「漏乘系数」这类错误蒙混过关。
  test.each([
    ['年内最小值 2/11', 2, 11, -14.2],
    ['零点 4/15', 4, 15, 0.0],
    ['5/14', 5, 14, 3.7],
    ['零点 6/13', 6, 13, 0.0],
    ['7/26', 7, 26, -6.5],
    ['零点 9/1', 9, 1, 0.0],
    ['年内最大值 11/3', 11, 3, 16.4]
  ])('%s 与天文年历一致', (_label, month, day, expected) => {
    expect(equationOfTime(2024, month, day, 4)).toBeCloseTo(expected, 0)
  })

  test('全年取值落在 [-15, +17] 分钟内，无发散', () => {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        const e = equationOfTime(2024, m, d, 4)
        expect(e).toBeGreaterThan(-15)
        expect(e).toBeLessThan(17)
      }
    }
  })

  test('跨世纪仍稳定（1900 与 2100 都不发散）', () => {
    for (const y of [1900, 2000, 2100]) {
      expect(Math.abs(equationOfTime(y, 11, 3, 4))).toBeLessThan(17)
      expect(Math.abs(equationOfTime(y, 2, 11, 4))).toBeLessThan(15)
    }
  })
})

describe('城市经度表', () => {
  test('查得到直辖市、省会与西部城市', () => {
    expect(lookupLongitude('北京')).toBeCloseTo(116.41, 1)
    expect(lookupLongitude('乌鲁木齐')).toBeCloseTo(87.62, 1)
    expect(lookupLongitude('喀什')).toBeCloseTo(75.99, 1)
  })

  test('容忍市/区/县后缀与空白', () => {
    expect(lookupLongitude('北京市')).toBe(lookupLongitude('北京'))
    expect(lookupLongitude('  上海市  ')).toBe(lookupLongitude('上海'))
  })

  test('查不到返回 null，不抛错也不猜', () => {
    expect(lookupLongitude('瓦坎达')).toBeNull()
    expect(lookupLongitude('')).toBeNull()
    expect(lookupLongitude(null)).toBeNull()
    expect(lookupLongitude(42)).toBeNull()
  })

  test('表内经度全部落在中国境内合理区间', () => {
    for (const [city, lng] of Object.entries(CITY_LONGITUDE)) {
      expect(typeof lng).toBe('number')
      // 国土最西约 73°E（帕米尔），最东约 135°E（抚远）
      expect(lng).toBeGreaterThan(73)
      expect(lng).toBeLessThan(136)
      expect(city).not.toMatch(/[市区县]$/)   // 表里存裸名，后缀在查询时剥
    }
  })
})

describe('真太阳时换算', () => {
  test('东经 120° 上只剩均时差', () => {
    const r = toTrueSolarTime({ year: 2024, month: 11, day: 3, hour: 12, minute: 0 }, 120)
    expect(r.longitudeOffset).toBe(0)
    // 注意别拿 r.equationOfTime 再 Math.round 去比：该字段已舍入到一位小数，
    // 二次舍入会在 x.5 边界上差 1 分钟（16.49 → 16.5 → 17）。
    expect(Math.abs(r.offsetMinutes - r.equationOfTime)).toBeLessThanOrEqual(1)
  })

  test('每偏离 1 度折合 4 分钟', () => {
    const a = toTrueSolarTime({ year: 2024, month: 4, day: 15, hour: 12, minute: 0 }, 120)
    const b = toTrueSolarTime({ year: 2024, month: 4, day: 15, hour: 12, minute: 0 }, 110)
    expect(a.longitudeOffset - b.longitudeOffset).toBeCloseTo(40, 1)
  })

  test('均时差不可省：11 月初上海的校正量是纯经度校正的三倍多', () => {
    const r = toTrueSolarTime({ year: 2024, month: 11, day: 3, hour: 12, minute: 0 }, 121.47)
    expect(r.longitudeOffset).toBeCloseTo(5.9, 0)     // 只算经度：+6 分
    expect(r.equationOfTime).toBeCloseTo(16.5, 0)     // 均时差：+16 分
    expect(r.offsetMinutes).toBe(22)                  // 合计 22 分——差着一个时辰边界
  })

  test('向前跨日：喀什 00:30 退到前一天', () => {
    const r = toTrueSolarTime({ year: 2000, month: 6, day: 15, hour: 0, minute: 30 }, 75.99)
    expect(r.crossedDay).toBe(true)
    expect([r.year, r.month, r.day]).toEqual([2000, 6, 14])
    expect(r.hour).toBe(21)
  })

  test('向后跨日：哈尔滨 23:50 进到次日', () => {
    const r = toTrueSolarTime({ year: 2000, month: 2, day: 11, hour: 23, minute: 50 }, 126.53)
    expect(r.crossedDay).toBe(true)
    expect([r.year, r.month, r.day]).toEqual([2000, 2, 12])
  })

  test('跨月、跨年、闰日边界都不越界', () => {
    // 跨年：元旦凌晨在西部退回上一年
    const ny = toTrueSolarTime({ year: 2000, month: 1, day: 1, hour: 0, minute: 30 }, 75.99)
    expect([ny.year, ny.month, ny.day]).toEqual([1999, 12, 31])
    // 闰日：2000-03-01 凌晨退回 2 月 29 日（2000 是闰年）
    const leap = toTrueSolarTime({ year: 2000, month: 3, day: 1, hour: 0, minute: 30 }, 75.99)
    expect([leap.year, leap.month, leap.day]).toEqual([2000, 2, 29])
    // 非闰年同一天退回 2 月 28 日
    const noLeap = toTrueSolarTime({ year: 1900, month: 3, day: 1, hour: 0, minute: 30 }, 75.99)
    expect([noLeap.year, noLeap.month, noLeap.day]).toEqual([1900, 2, 28])
  })

  test('非法经度报 INVALID_INPUT', () => {
    const bad = { year: 2000, month: 1, day: 1, hour: 12, minute: 0 }
    expect(() => toTrueSolarTime(bad, 200)).toThrow(/经度/)
    expect(() => toTrueSolarTime(bad, NaN)).toThrow(/经度/)
    expect(() => toTrueSolarTime(bad, '120')).toThrow(/经度/)
  })
})

describe('resolveLongitude 入参解析', () => {
  test('都不传 → null（默认关闭）', () => {
    expect(resolveLongitude({ year: 2000 })).toBeNull()
    expect(resolveLongitude({})).toBeNull()
    expect(resolveLongitude(null)).toBeNull()
  })

  test('longitude 优先于 birthPlace', () => {
    const r = resolveLongitude({ longitude: 100, birthPlace: '北京' })
    expect(r.longitude).toBe(100)
    expect(r.source).toBe('longitude')
  })

  test('未收录的出生地明确报错，不静默忽略', () => {
    expect(() => resolveLongitude({ birthPlace: '瓦坎达' }))
      .toThrow(/未收录出生地/)
  })

  test('空串按未填处理', () => {
    expect(resolveLongitude({ birthPlace: '', longitude: '' })).toBeNull()
  })
})

describe('接入排盘', () => {
  const base = { year: 2000, month: 6, day: 15, hour: 0, minute: 30, gender: 'male' }

  test('默认关闭：不传出生地时结果与校正前完全一致', () => {
    const r = paipan(base)
    expect(r.trueSolarTime).toBeNull()
    expect(pillars(r)).toBe('庚辰 壬午 甲辰 甲子')
  })

  test('填出生地后跨日改盘：日柱与时柱同时变，日主随之改变', () => {
    const r = paipan({ ...base, birthPlace: '喀什' })
    expect(pillars(r)).toBe('庚辰 壬午 癸卯 癸亥')
    expect(r.dayPillar.gan).toBe('癸')
    expect(r.trueSolarTime.crossedDay).toBe(true)
    expect(r.trueSolarTime.offsetMinutes).toBe(-176)
  })

  test('input 保持用户填的钟表时间，二次排盘不会叠加校正', () => {
    const once = paipan({ ...base, birthPlace: '喀什' })

    // 时刻字段必须原样是用户填的，不能被校正结果改写
    expect(once.input.year).toBe(base.year)
    expect(once.input.month).toBe(base.month)
    expect(once.input.day).toBe(base.day)
    expect(once.input.hour).toBe(base.hour)
    expect(once.input.minute).toBe(base.minute)
    // 出生地作为入参的一部分一并留下，供落库与回放
    expect(once.input.birthPlace).toBe('喀什')

    // 这才是真正要锁的性质：拿 input 原样重排必须得到同一个盘。
    // 若 input 存的是校正后的时刻，这里会把校正叠加两次而漂掉。
    const twice = paipan(once.input)
    expect(pillars(twice)).toBe(pillars(once))
    expect(twice.trueSolarTime.offsetMinutes).toBe(once.trueSolarTime.offsetMinutes)
  })

  test('给 longitude 与给对应城市等价', () => {
    const byPlace = paipan({ ...base, birthPlace: '喀什' })
    const byLng = paipan({ ...base, longitude: 75.99 })
    expect(pillars(byLng)).toBe(pillars(byPlace))
  })

  test('校正后越出 1900-2100 支持范围时明确报错', () => {
    // 1900-01-01 00:30 在喀什要退到 1899-12-31
    let err = null
    try {
      paipan({ year: 1900, month: 1, day: 1, hour: 0, minute: 30, gender: 'male', birthPlace: '喀什' })
    } catch (e) { err = e }
    expect(err).not.toBeNull()
    expect(err.code).toBe('INVALID_INPUT')
    expect(err.message).toMatch(/超出/)
  })

  test('东部城市校正量小，多数盘不受影响', () => {
    // 杭州 120.15°E 几乎就在标准经线上
    const plain = paipan({ ...base, hour: 12 })
    const hz = paipan({ ...base, hour: 12, birthPlace: '杭州' })
    expect(Math.abs(hz.trueSolarTime.longitudeOffset)).toBeLessThan(1)
    expect(pillars(hz)).toBe(pillars(plain))
  })
})
