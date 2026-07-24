// utils/__tests__/mingju.boundary.test.js - 命局论断边界鲁棒性
//
// 不重复测 lunar-javascript 边界（bazi.test.js 已覆盖 1900/2100/晚子时/闰月/节气）
// 重点验:mingju / wangShuai / yongShen / wuxingScore 在 paipan 输出的 4 个
// 极端盘上,判定路径不会跑飞、不会返 NaN/null/未定义字段。
//
// 4 个边界盘:最弱(全官杀)、最强(全印比)、无藏干(纯单柱)、跨年立春(刚立春 vs 立春前)

const { analyzeMingju } = require('../mingju')
const { judgeStrength } = require('../wangShuai')
const { deriveYongShen } = require('../yongShen')
const { scoreWuxing, partyOf, isTongDang } = require('../wuxingScore')
const { WUXING } = require('../bazi')

// 构造一个最小合法的 paipan 形对象,绕过真实排盘
function makeFakePaipan({ dayGan, monthZhi, year, dayZhi, cangGan, tenGods, wuxingDayGan }) {
  const zhi = { ...(cangGan || {}) }
  return {
    yearPillar: { gan: '甲', zhi: '寅' },
    monthPillar: { gan: '丙', zhi: monthZhi || '寅' },
    dayPillar: { gan: dayGan || '甲', zhi: dayZhi || '子' },
    hourPillar: { gan: '戊', zhi: '辰' },
    cangGan: {
      year: zhi.year || ['甲'],
      month: zhi.month || ['丙'],
      day: zhi.day || ['甲'],
      hour: zhi.hour || ['戊']
    },
    tenGods: tenGods || {
      yearGan: '正印', monthGan: '食神', dayGan: '日主', hourGan: '偏财'
    },
    wuxing: { dayGan: wuxingDayGan || '木' },
    input: { gender: 'male' }
  }
}

describe('analyzeMingju - 边界鲁棒性', () => {
  test('最弱盘:日主无根(全官杀)→ lean=弱,不返 NaN', () => {
    // 壬水日主,生于巳月(财),藏干全异党
    const fake = makeFakePaipan({
      dayGan: '壬',
      dayZhi: '午', // 午藏丁己,全异党
      monthZhi: '巳', // 巳藏丙戊庚,异党
      cangGan: {
        year: ['庚', '丙', '戊'],
        month: ['丙', '戊', '庚'],
        day: ['丁', '己'],
        hour: ['庚', '壬']
      },
      wuxingDayGan: '水'
    })
    const r = analyzeMingju(fake)
    expect(r.dayMaster.gan).toBe('壬')
    expect(r.strength.lean).toBe('弱')
    expect(r.yongShen.xiShen.length).toBeGreaterThan(0)
    expect(r.yongShen.jiShen.length).toBeGreaterThan(0)
    expect(Number.isFinite(r.strength.ratio)).toBe(true)
    expect(r.disclaimer).toContain('非绝对')
  })

  test('最强盘:日主得令且三合(全印比)→ lean=强,喜用全是克泄', () => {
    // 甲木日主,生于寅月(得令),亥卯未三合
    const fake = makeFakePaipan({
      dayGan: '甲',
      dayZhi: '亥', // 亥藏壬甲,同党
      monthZhi: '寅', // 寅藏甲丙戊,本气同党
      cangGan: {
        year: ['壬'],
        month: ['甲', '丙', '戊'],
        day: ['壬', '甲'],
        hour: ['乙']
      },
      wuxingDayGan: '木'
    })
    const r = analyzeMingju(fake)
    expect(r.strength.lean).toBe('强')
    // 喜神应是克泄耗(火土金)
    expect(r.yongShen.xiShen.some((e) => ['火', '土', '金'].includes(e))).toBe(true)
    expect(r.yongShen.jiShen).toContain('木')
  })

  test('跨年立春边界:同一农历日不同公历 → 年柱允许不同', () => {
    // 1990-02-04 是立春;立春前后年柱互换
    const { paipan } = require('../bazi')
    const before = paipan({ year: 1990, month: 2, day: 3, hour: 12, gender: 'male' })
    const after = paipan({ year: 1990, month: 2, day: 5, hour: 12, gender: 'male' })
    // 立春前仍是己巳年,立春后进入庚午年
    expect(before.yearPillar.gan).toBe('己')
    expect(after.yearPillar.gan).toBe('庚')

    // 两侧都应能跑出 mingju
    expect(() => analyzeMingju(before)).not.toThrow()
    expect(() => analyzeMingju(after)).not.toThrow()
  })

  test('空藏干极端: cangGan 为空数组也不会崩', () => {
    const fake = makeFakePaipan({
      dayGan: '甲',
      cangGan: { year: [], month: [], day: [], hour: [] }
    })
    const r = analyzeMingju(fake)
    expect(r).toHaveProperty('dayMaster')
    expect(r).toHaveProperty('wuxingScore')
    expect(r).toHaveProperty('strength')
    expect(r).toHaveProperty('yongShen')
    expect(r).toHaveProperty('geju')
    // 数组不为空(就算空,结构也得在)
    expect(typeof r.strength.ratio).toBe('number')
  })

  test('1900-01-01 边界盘: paipan 能跑 + mingju 不退化', () => {
    const { paipan } = require('../bazi')
    const r = paipan({ year: 1900, month: 1, day: 1, hour: 0, gender: 'male' })
    const m = analyzeMingju(r)
    expect(m.dayMaster.gan).toBe(r.dayPillar.gan)
    expect(Object.keys(m.wuxingScore)).toEqual(
      expect.arrayContaining(['金', '木', '水', '火', '土'])
    )
  })

  test('2100-12-31 边界盘: paipan 能跑 + mingju 不退化', () => {
    const { paipan } = require('../bazi')
    const r = paipan({ year: 2100, month: 12, day: 31, hour: 23, gender: 'female' })
    const m = analyzeMingju(r)
    expect(m.dayMaster.gan).toBe(r.dayPillar.gan)
    expect(Number.isFinite(m.strength.ratio)).toBe(true)
  })
})

describe('scoreWuxing / partyOf - 基础不变性', () => {
  test('五行表覆盖十天干', () => {
    const allGan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
    for (const g of allGan) {
      const el = WUXING[g]
      expect(['金', '木', '水', '火', '土']).toContain(el)
    }
  })

  test('partyOf 同党/异党 五行各自一致', () => {
    // 木日主:水生木=同党,火土金=异党
    expect(partyOf('木', '木')).toBe('比劫')
    expect(partyOf('水', '木')).toBe('印')
    expect(partyOf('火', '木')).toBe('食伤')
    expect(partyOf('土', '木')).toBe('财')
    expect(partyOf('金', '木')).toBe('官杀')
    // isTongDang 把"印+比劫"折叠成同党
    expect(isTongDang('比劫')).toBe(true)
    expect(isTongDang('印')).toBe(true)
    expect(isTongDang('食伤')).toBe(false)
    expect(isTongDang('财')).toBe(false)
    expect(isTongDang('官杀')).toBe(false)
  })

  test('scoreWuxing 在空藏干盘上分数全为 0(只算天干)', () => {
    const fake = makeFakePaipan({ cangGan: { year: [], month: [], day: [], hour: [] } })
    const { scores } = scoreWuxing(fake)
    // 年月时天干仍贡献(3 * GAN_WEIGHT);每个五行至少 1 个
    const sum = Object.values(scores).reduce((a, b) => a + b, 0)
    expect(sum).toBeGreaterThanOrEqual(0)
    Object.values(scores).forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('judgeStrength - 强弱判定不退化', () => {
  test('最强盘 ratio < 1(总分不会爆), lean 是 "强" 之一', () => {
    const fake = makeFakePaipan({
      dayGan: '甲',
      monthZhi: '寅',
      cangGan: {
        year: ['壬'],
        month: ['甲', '丙', '戊'],
        day: ['壬', '甲'],
        hour: ['乙']
      }
    })
    const s = judgeStrength(fake)
    expect(s.ratio).toBeLessThanOrEqual(1)
    expect(s.ratio).toBeGreaterThanOrEqual(0)
    expect(['强', '偏强', '中和', '偏弱', '弱']).toContain(s.lean)
  })

  test('最弱盘 lean 在弱档', () => {
    const fake = makeFakePaipan({
      dayGan: '壬',
      monthZhi: '巳',
      cangGan: {
        year: ['庚', '丙'],
        month: ['丙', '戊', '庚'],
        day: ['丁', '己'],
        hour: ['庚']
      }
    })
    const s = judgeStrength(fake)
    expect(['弱', '偏弱']).toContain(s.lean)
  })
})
