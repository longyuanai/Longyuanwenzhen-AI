// utils/__tests__/promptBuilder.test.js - AI 提示词构造测试（不依赖网络）
const { paipan } = require('../bazi')
const { analyzeMingju } = require('../mingju')
const {
  buildBasicPrompt, buildDeepPrompt,
  formatMingliFacts, formatKnowledgeContext
} = require('../promptBuilder')

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

describe('promptBuilder - RAG 知识库接入（可选）', () => {
  const mockKc = [
    { content: '壬水生于亥月，建禄格，当以食伤泄秀为用。', source: '《滴天髓阐微》', score: 0.92 },
    { content: '金水太旺，喜木火土平衡命局。', source: '《穷通宝鉴》', score: 0.85 }
  ]

  test('有 knowledgeContext → basic prompt 含【古籍依据】区块', () => {
    const p = buildBasicPrompt('壬午 辛亥 壬辰 乙巳', mingju, mockKc)
    expect(p).toContain('【古籍依据】')
    expect(p).toContain('《滴天髓阐微》')
    expect(p).toContain('建禄格')
    expect(p).toContain('相关度 0.92')
    expect(p).toContain('《穷通宝鉴》')
  })

  test('有 knowledgeContext → deep prompt 同样注入', () => {
    const p = buildDeepPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju, mockKc)
    expect(p).toContain('【古籍依据】')
    expect(p).toContain('《滴天髓阐微》')
  })

  test('knowledgeContext 为空数组 → 区块不出现（优雅降级）', () => {
    const p1 = buildBasicPrompt('壬午 辛亥 壬辰 乙巳', mingju, [])
    expect(p1).not.toContain('【古籍依据】')

    const p2 = buildDeepPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju, [])
    expect(p2).not.toContain('【古籍依据】')
  })

  test('knowledgeContext 缺省 → 区块不出现（向后兼容）', () => {
    const p = buildBasicPrompt('壬午 辛亥 壬辰 乙巳', mingju)
    expect(p).not.toContain('【古籍依据】')
  })

  test('古籍区块优先级：声明"以【已确定结论】为准"，防 LLM 偏听古籍', () => {
    const p = buildBasicPrompt('壬午 辛亥 壬辰 乙巳', mingju, mockKc)
    // 必须包含冲突仲裁声明
    expect(p).toMatch(/与【已确定结论】冲突.*以【已确定结论】为准/)
  })

  test('formatKnowledgeContext 单元：缺省/null/非数组 → 返回 null', () => {
    expect(formatKnowledgeContext(undefined)).toBeNull()
    expect(formatKnowledgeContext(null)).toBeNull()
    expect(formatKnowledgeContext('string')).toBeNull()
    expect(formatKnowledgeContext([])).toBeNull()
  })

  test('formatKnowledgeContext 单元：缺 source/score 字段不报错', () => {
    const r = formatKnowledgeContext([{ content: '片段无源' }])
    expect(r).toContain('片段无源')
    expect(r).toContain('【古籍依据】')
  })
})