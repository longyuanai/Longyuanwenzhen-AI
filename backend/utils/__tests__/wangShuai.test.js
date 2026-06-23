// utils/__tests__/wangShuai.test.js - 身强弱判定测试
const { paipan } = require('../bazi')
const { judgeStrength } = require('../wangShuai')

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

describe('judgeStrength - 身强弱判定', () => {
  test('机主盘（壬水生亥月，建禄得令）→ 身强（最高权威基准，对齐 CLAUDE.md）', () => {
    const r = judgeStrength(paipan(JIZHU))
    expect(r.dayElement).toBe('水')
    expect(r.lean).toBe('强')
    expect(['身强', '偏强']).toContain(r.strength)
    expect(r.tongDang).toBeGreaterThan(r.yiDang)
  })

  test('机主盘三大要素：得令、得地、得势均成立', () => {
    const r = judgeStrength(paipan(JIZHU))
    expect(r.deLing).toBe(true) // 生亥月，建禄
    expect(r.deDi).toBe(true) // 通根亥、辰癸
    expect(r.deShi).toBe(true) // 壬(比)辛(印)两个帮扶天干
  })

  test('basis 给出可读的命理依据', () => {
    const r = judgeStrength(paipan(JIZHU))
    expect(Array.isArray(r.basis)).toBe(true)
    expect(r.basis.join('')).toContain('得令')
  })

  test('确定性：同盘多次判定结果一致', () => {
    const a = judgeStrength(paipan(JIZHU))
    const b = judgeStrength(paipan(JIZHU))
    expect(a.ratio).toBe(b.ratio)
    expect(a.strength).toBe(b.strength)
  })
})
