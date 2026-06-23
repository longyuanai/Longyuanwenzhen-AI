// utils/__tests__/geju.test.js - 格局判定测试
const { paipan } = require('../bazi')
const { judgeGeju } = require('../geju')

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

describe('judgeGeju - 格局判定（保守取格）', () => {
  test('机主盘：月支亥为壬禄 → 建禄格', () => {
    const r = judgeGeju(paipan(JIZHU))
    expect(r.geju).toBe('建禄格')
    expect(r.isSpecial).toBe(false)
  })

  test('1981 壬申日辰月：本气戊土七杀 → 七杀格（未透，格不纯）', () => {
    const r = judgeGeju(paipan({ year: 1981, month: 4, day: 24, hour: 12, minute: 0, gender: 'female' }))
    expect(r.geju).toBe('七杀格')
    expect(r.isPure).toBe(false)
  })

  test('1990-8-15：月令本气偏印透干 → 偏印格（格清纯）', () => {
    const r = judgeGeju(paipan({ year: 1990, month: 8, day: 15, hour: 14, minute: 0, gender: 'male' }))
    expect(r.geju).toBe('偏印格')
    expect(r.isPure).toBe(true)
  })

  test('输出结构完整且确定', () => {
    const a = judgeGeju(paipan(JIZHU))
    const b = judgeGeju(paipan(JIZHU))
    expect(typeof a.geju).toBe('string')
    expect(typeof a.isPure).toBe('boolean')
    expect(Array.isArray(a.basis)).toBe(true)
    expect(a.geju).toBe(b.geju)
  })
})
