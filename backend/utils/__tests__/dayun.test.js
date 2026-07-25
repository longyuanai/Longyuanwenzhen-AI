// utils/__tests__/dayun.test.js - 大运段论断算法

const { paipan } = require('../bazi')
const { analyzeMingju } = require('../mingju')
const { scoreSegment, judgeSegmentLean, analyzeDayunSegment, analyzeDayunFull, currentDayun } = require('../dayun')

// 黄金盘:机主本人 2002-11-20 巳时男(8 步大运全段可解析)
const BIRTH = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

describe('scoreSegment', () => {
  test('日主甲木,见壬水大运 → 印星(帮扶)', () => {
    const s = scoreSegment('木', '壬', '子')
    expect(s.support).toBe(28)   // 8 + 20
    expect(s.drain).toBe(0)
    expect(s.tianGanShen).toBe('印')
    expect(s.diZhiShen).toBe('印')
    expect(s.ratio).toBe(1)
  })

  test('日主甲木,见庚金大运 → 官杀(克伐)', () => {
    const s = scoreSegment('木', '庚', '申')
    expect(s.support).toBe(0)
    expect(s.drain).toBe(28)
    expect(s.tianGanShen).toBe('官杀')
    expect(s.diZhiShen).toBe('官杀')
    expect(s.ratio).toBe(0)
  })

  test('天干帮扶 / 地支克伐 → 平段', () => {
    // 甲日主:丙火 = 食伤(克伐),寅木 = 比劫(帮扶)
    const s = scoreSegment('木', '丙', '寅')
    expect(s.support).toBe(20)
    expect(s.drain).toBe(8)
    expect(s.tianGanShen).toBe('食伤')
    expect(s.diZhiShen).toBe('比劫')
  })
})

describe('judgeSegmentLean', () => {
  test('身弱 + 该段帮扶 > 克伐 → 喜神段', () => {
    expect(judgeSegmentLean('weak', { support: 28, drain: 0, ratio: 1 })).toBe('xi')
  })
  test('身弱 + 该段克伐 > 帮扶 → 忌神段', () => {
    expect(judgeSegmentLean('weak', { support: 0, drain: 28, ratio: 0 })).toBe('ji')
  })
  test('身强 + 该段克伐 > 帮扶 → 喜神段', () => {
    expect(judgeSegmentLean('strong', { support: 0, drain: 28, ratio: 0 })).toBe('xi')
  })
  test('身强 + 该段帮扶 > 克伐 → 忌神段', () => {
    expect(judgeSegmentLean('strong', { support: 28, drain: 0, ratio: 1 })).toBe('ji')
  })
  test('帮扶 == 克伐 → 平段', () => {
    expect(judgeSegmentLean('weak', { support: 14, drain: 14, ratio: 0.5 })).toBe('ping')
    expect(judgeSegmentLean('strong', { support: 14, drain: 14, ratio: 0.5 })).toBe('ping')
  })
  test('balanced 原局 → 任何比例都判平', () => {
    expect(judgeSegmentLean('balanced', { support: 28, drain: 0, ratio: 1 })).toBe('ping')
  })
})

describe('analyzeDayunSegment - 集成', () => {
  const pp = paipan(BIRTH)
  const mj = analyzeMingju(pp)
  const list = pp.daYun.daYunList

  test('机主盘应有 8 段大运', () => {
    expect(list.length).toBe(8)
  })

  test('按 segmentIndex 选段 → 返回完整论断', () => {
    const seg = analyzeDayunSegment(pp, mj, { segmentIndex: 0 })
    expect(seg.segmentIndex).toBe(0)
    expect(seg.ganZhi).toBe(list[0].ganZhi)
    expect(seg.ageRange).toBe(list[0].ageRange)
    expect(['xi', 'ji', 'ping']).toContain(seg.lean)
    expect(seg.basis.length).toBeGreaterThanOrEqual(3)
  })

  test('按 targetYear 反查段', () => {
    const targetYear = list[2].startYear + 2  // 第 3 段中段
    const seg = analyzeDayunSegment(pp, mj, { targetYear })
    expect(seg.segmentIndex).toBe(2)
    expect(targetYear >= seg.startYear && targetYear <= seg.endYear).toBe(true)
  })

  test('segmentIndex 越界 → 抛错', () => {
    expect(() => analyzeDayunSegment(pp, mj, { segmentIndex: 8 })).toThrow(/越界/)
    expect(() => analyzeDayunSegment(pp, mj, { segmentIndex: -1 })).toThrow(/越界/)
  })

  test('targetYear 不在 8 段范围内 → 抛错', () => {
    expect(() => analyzeDayunSegment(pp, mj, { targetYear: 1800 })).toThrow(/不在/)
    expect(() => analyzeDayunSegment(pp, mj, { targetYear: 2200 })).toThrow(/不在/)
  })

  test('既无 segmentIndex 又无 targetYear → 抛错', () => {
    expect(() => analyzeDayunSegment(pp, mj, {})).toThrow(/必须传/)
  })
})

describe('analyzeDayunFull', () => {
  test('机主盘 8 段全卷', () => {
    const pp = paipan(BIRTH)
    const mj = analyzeMingju(pp)
    const full = analyzeDayunFull(pp, mj)
    expect(full.length).toBe(8)
    full.forEach((s, i) => {
      expect(s.segmentIndex).toBe(i)
      expect(['xi', 'ji', 'ping']).toContain(s.lean)
      expect(s.startYear).toBeGreaterThan(2000)
    })
  })
})

describe('currentDayun - /checkup 钩子', () => {
  test('按当前年返回当段', () => {
    const pp = paipan(BIRTH)
    const mj = analyzeMingju(pp)
    const cur = currentDayun(pp, mj, new Date('2026-07-25'))
    expect(cur).not.toBeNull()
    // 2026 应落入 startYear 在 2022-2031 的某段
    expect(cur.startYear <= 2026 && cur.endYear >= 2026).toBe(true)
  })

  test('出生 1800 → 远超 8 段 → null', () => {
    const pp = paipan({ year: 1980, month: 1, day: 1, hour: 0, gender: 'male' })
    const mj = analyzeMingju(pp)
    const cur = currentDayun(pp, mj, new Date('2200-01-01'))
    expect(cur).toBeNull()
  })
})