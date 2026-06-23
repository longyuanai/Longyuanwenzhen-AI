// utils/__tests__/mingju.test.js - 命局论断编排器测试
const { paipan } = require('../bazi')
const { analyzeMingju, DISCLAIMER } = require('../mingju')

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

describe('analyzeMingju - 完整命局论断', () => {
  test('机主盘综合论断（最高权威基准，对齐 CLAUDE.md：身强/喜木火土/忌金水）', () => {
    const r = analyzeMingju(paipan(JIZHU))
    expect(r.dayMaster).toEqual({ gan: '壬', element: '水' })
    expect(r.strength.lean).toBe('强')
    expect(r.yongShen.xiShen).toEqual(expect.arrayContaining(['木', '火', '土']))
    expect(r.yongShen.jiShen).toEqual(expect.arrayContaining(['金', '水']))
    expect(r.geju.name).toBe('建禄格')
  })

  test('输出结构完整：含五行分、强弱、用神、格局、依据、免责声明', () => {
    const r = analyzeMingju(paipan(JIZHU))
    expect(r.wuxingScore).toHaveProperty('水')
    expect(r.strength).toHaveProperty('ratio')
    expect(r.yongShen.tiaoHou).toHaveProperty('season')
    expect(r.geju).toHaveProperty('name')
    expect(r.basis.length).toBeGreaterThan(3)
    expect(r.disclaimer).toBe(DISCLAIMER)
  })

  test('确定性：同盘多次论断完全一致（命理 APP 可信度根基）', () => {
    const a = analyzeMingju(paipan(JIZHU))
    const b = analyzeMingju(paipan(JIZHU))
    expect(a).toEqual(b)
  })

  test('带免责声明，不做绝对化断言（对齐 CLAUDE.md 玄学红线）', () => {
    const r = analyzeMingju(paipan(JIZHU))
    expect(r.disclaimer).toContain('非绝对')
  })
})
