// 晚子时流派开关（BAZI_LATE_ZI_SECT）
//
// 背景见 utils/bazi.js 的 LATE_ZI_SECT 注释：默认流派 1（23 点进次日），
// 保留切回流派 2 的口子给坚持该派的命理师。
//
// 这里要锁两件事：
//   ① 开关真的生效（不是写了个读不到的环境变量）
//   ② 默认值是 1 —— 默认值一旦被人改回 2，所有 23 点出生的盘会静默
//      退回矛盾态（时柱推不回日主），且没有任何测试会红。

const SUBJECT = { year: 1965, month: 12, day: 23, hour: 23, minute: 45, gender: 'male' }

function paipanWithSect(sect) {
  jest.resetModules()
  const prev = process.env.BAZI_LATE_ZI_SECT
  if (sect === undefined) delete process.env.BAZI_LATE_ZI_SECT
  else process.env.BAZI_LATE_ZI_SECT = sect
  try {
    return require('../bazi').paipan(SUBJECT)
  } finally {
    if (prev === undefined) delete process.env.BAZI_LATE_ZI_SECT
    else process.env.BAZI_LATE_ZI_SECT = prev
  }
}

const gz = (p) => p.gan + p.zhi

describe('晚子时流派开关', () => {
  afterAll(() => jest.resetModules())

  test('未设环境变量时默认流派 1：日柱进次日', () => {
    const r = paipanWithSect(undefined)
    expect(gz(r.dayPillar)).toBe('壬子')
    expect(gz(r.hourPillar)).toBe('庚子')
    // 壬日起庚子——时柱由盘面日主推得，自洽
  })

  test('BAZI_LATE_ZI_SECT=2 切回流派 2：日柱留在当日', () => {
    const r = paipanWithSect('2')
    expect(gz(r.dayPillar)).toBe('辛亥')
    // 时柱不变，仍按次日日干起遁——这正是流派 2 的矛盾之处：
    // 辛日的子时本应是戊子，这里却是庚子
    expect(gz(r.hourPillar)).toBe('庚子')
  })

  test('流派差异会级联到时干十神（这才是它值得上锁的原因）', () => {
    const s1 = paipanWithSect('1')
    const s2 = paipanWithSect('2')
    expect(s1.tenGods.hourGan).toBe('偏印')   // 庚 对 壬
    expect(s2.tenGods.hourGan).toBe('劫财')   // 庚 对 辛
    expect(s1.tenGods.hourGan).not.toBe(s2.tenGods.hourGan)
  })

  test('非 23 点的盘不受流派影响', () => {
    jest.resetModules()
    const { paipan } = require('../bazi')
    const noon = { ...SUBJECT, hour: 12 }
    const a = paipan(noon)
    process.env.BAZI_LATE_ZI_SECT = '2'
    jest.resetModules()
    const b = require('../bazi').paipan(noon)
    delete process.env.BAZI_LATE_ZI_SECT
    expect(gz(a.dayPillar)).toBe(gz(b.dayPillar))
    expect(gz(a.hourPillar)).toBe(gz(b.hourPillar))
  })

  test('无法识别的取值退回默认流派 1，不抛错', () => {
    expect(gz(paipanWithSect('banana').dayPillar)).toBe('壬子')
    expect(gz(paipanWithSect('').dayPillar)).toBe('壬子')
  })
})
