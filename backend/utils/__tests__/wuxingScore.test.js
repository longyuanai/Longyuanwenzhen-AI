// utils/__tests__/wuxingScore.test.js - 五行力量打分测试
const { paipan } = require('../bazi')
const { scoreWuxing, partyOf, ELEMENTS } = require('../wuxingScore')

// 机主本人盘：壬午 辛亥 壬辰 乙巳，日主壬水（最高权威基准）
const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

describe('scoreWuxing - 五行力量打分', () => {
  test('返回五行齐全的分数与明细', () => {
    const { scores, breakdown } = scoreWuxing(paipan(JIZHU))
    for (const el of ELEMENTS) {
      expect(typeof scores[el]).toBe('number')
      expect(scores[el]).toBeGreaterThanOrEqual(0)
    }
    expect(Array.isArray(breakdown)).toBe(true)
    expect(breakdown.length).toBeGreaterThan(0)
  })

  test('日主天干本身不计入帮扶（明细中无 day干）', () => {
    const { breakdown } = scoreWuxing(paipan(JIZHU))
    expect(breakdown.some((b) => b.source === 'day干')).toBe(false)
    // 但日支藏干要计入
    expect(breakdown.some((b) => b.source === 'day支藏')).toBe(true)
  })

  test('机主盘月令亥水当令，水的得分应明显偏高', () => {
    const { scores } = scoreWuxing(paipan(JIZHU))
    // 亥月本气壬水权重最大，水分应为五行中较高者
    expect(scores['水']).toBeGreaterThan(scores['金'])
  })

  test('确定性：同盘多次打分结果完全一致', () => {
    const a = scoreWuxing(paipan(JIZHU)).scores
    const b = scoreWuxing(paipan(JIZHU)).scores
    expect(a).toEqual(b)
  })
})

describe('partyOf - 十神党派判定', () => {
  test('壬水日主：水比劫、金印、木食伤、火财、土官杀', () => {
    expect(partyOf('水', '水')).toBe('比劫')
    expect(partyOf('金', '水')).toBe('印')
    expect(partyOf('木', '水')).toBe('食伤')
    expect(partyOf('火', '水')).toBe('财')
    expect(partyOf('土', '水')).toBe('官杀')
  })
})
