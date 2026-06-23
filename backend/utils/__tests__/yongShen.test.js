// utils/__tests__/yongShen.test.js - 用神推导测试
const { paipan } = require('../bazi')
const { scoreWuxing } = require('../wuxingScore')
const { judgeStrength } = require('../wangShuai')
const { deriveYongShen, deriveFuYi } = require('../yongShen')

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }
// 身弱木日主（1986-7-10 16时 男，未月木弱，财土旺）——用于 spec 验收
const WEAK_WOOD = { year: 1986, month: 7, day: 10, hour: 16, minute: 0, gender: 'male' }

function fullYongShen(p) {
  const pp = paipan(p)
  const scores = scoreWuxing(pp).scores
  const strength = judgeStrength(pp, { scores })
  return deriveYongShen(pp, strength, scores)
}

describe('deriveFuYi - 扶抑用神映射（确定性规则）', () => {
  test('壬水身强 → 喜木火土（食财官）、忌金水（印比）——对齐 CLAUDE.md 机主喜忌', () => {
    const r = deriveFuYi('水', '强')
    expect(r.xi.sort()).toEqual(['土', '木', '火'].sort())
    expect(r.ji.sort()).toEqual(['水', '金'].sort())
  })

  test('spec 5.2.1 验收：日主身弱 → 喜印比、忌食财官', () => {
    // 木日主身弱：印=水、比劫=木为喜；食伤=火、财=土、官杀=金为忌
    const r = deriveFuYi('木', '弱')
    expect(r.xi.sort()).toEqual(['水', '木'].sort()) // 印比
    expect(r.ji.sort()).toEqual(['土', '火', '金'].sort()) // 食财官
  })
})

describe('deriveYongShen - 完整用神（扶抑+调候）', () => {
  test('机主盘：喜神含木火土，忌神含金水', () => {
    const r = fullYongShen(JIZHU)
    expect(r.xiShen).toEqual(expect.arrayContaining(['木', '火', '土']))
    expect(r.jiShen).toEqual(expect.arrayContaining(['金', '水']))
  })

  test('机主盘：生亥月，调候季节为冬、需火暖局', () => {
    const r = fullYongShen(JIZHU)
    expect(r.tiaoHou.season).toBe('冬')
    expect(r.tiaoHou.need).toContain('火')
  })

  test('spec 验收：身弱财旺盘 → 喜神含印比、忌神含财', () => {
    const r = fullYongShen(WEAK_WOOD)
    expect(r.lean).toBe('弱')
    // 木日主身弱：喜印(水)比(木)
    expect(r.xiShen).toEqual(expect.arrayContaining(['水', '木']))
    // 财(土)为忌
    expect(r.jiShen).toContain('土')
  })

  test('确定性：同盘多次推导喜忌一致', () => {
    const a = fullYongShen(JIZHU)
    const b = fullYongShen(JIZHU)
    expect(a.xiShen).toEqual(b.xiShen)
    expect(a.jiShen).toEqual(b.jiShen)
  })
})
