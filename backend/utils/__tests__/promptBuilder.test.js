// utils/__tests__/promptBuilder.test.js - AI 提示词构造测试（不依赖网络）
const { paipan } = require('../bazi')
const { analyzeMingju } = require('../mingju')
const { buildBasicPrompt, buildDeepPrompt, formatMingliFacts } = require('../promptBuilder')

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }
const mingju = analyzeMingju(paipan(JIZHU))

describe('promptBuilder - 确定性结论注入', () => {
  test('facts 区块含日主/身强弱/喜忌/格局，并声明不得修改', () => {
    const facts = formatMingliFacts(mingju)
    expect(facts).toContain('不得修改')
    expect(facts).toContain('壬水')
    expect(facts).toContain('身强')
    expect(facts).toContain('喜用神')
    expect(facts).toContain('建禄格')
  })

  test('basic 提示词注入确定喜忌（木火土 / 金水），并含禁绝对化约束', () => {
    const p = buildBasicPrompt('壬午 辛亥 壬辰 乙巳', mingju)
    // 喜用神木火土、忌神金水须出现在注入事实中
    expect(p).toContain('喜用神（五行）：木、火、土')
    expect(p).toContain('忌神（五行）：金、水')
    expect(p).toContain('禁止"必定""一定"')
    expect(p).toContain('不得改动')
  })

  test('deep 提示词含大运与五维分析框架', () => {
    const p = buildDeepPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju)
    expect(p).toContain('大运：甲寅 乙卯')
    expect(p).toContain('事业财运')
    expect(p).toContain('建禄格')
  })

  test('确定性：同结论生成的提示词完全一致', () => {
    expect(buildBasicPrompt('x', mingju)).toBe(buildBasicPrompt('x', mingju))
  })
})
