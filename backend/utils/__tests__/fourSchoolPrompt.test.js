// utils/__tests__/fourSchoolPrompt.test.js - 四家并列解读 prompt 模板测试
//
// 测试目标：
//   1. 四家 query 构造差异(否则失去并列视角价值)
//   2. 完整 prompt 注入确定结论 + 4 段标题 + 4 段提示语 + 综合
//   3. 优雅降级:知识缺失/缺省/部分家不可用

const { paipan } = require('../bazi')
const { analyzeMingju } = require('../mingju')
const {
  buildFourSchoolPrompt,
  buildFourSchoolQueries,
  formatSchoolSection
} = require('../fourSchoolPrompt')

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }
const mingju = analyzeMingju(paipan(JIZHU))

describe('buildFourSchoolQueries - 四家查询语差异化', () => {
  test('四家都有:返回 xu/liang/yuan/wei 四个键', () => {
    const q = buildFourSchoolQueries(mingju)
    expect(Object.keys(q).sort()).toEqual(['liang', 'wei', 'xu', 'yuan'])
    for (const k of Object.keys(q)) {
      expect(typeof q[k]).toBe('string')
      expect(q[k].length).toBeGreaterThan(20)
    }
  })

  test('四家必须提到不同的方法论焦点(否则并列价值消失)', () => {
    const q = buildFourSchoolQueries(mingju)
    expect(q.xu).toContain('徐乐吾')
    expect(q.xu).toMatch(/格局|调候|体用/)
    expect(q.liang).toContain('梁湘润')
    expect(q.liang).toMatch(/神煞|三轨|金不换/)
    expect(q.yuan).toContain('袁树珊')
    expect(q.yuan).toMatch(/命宫|小限|纳音/)
    expect(q.wei).toContain('韦千里')
    expect(q.wei).toMatch(/八步|千里命稿/)
  })

  test('机主盘(壬水建禄)四家 query 都包含核心命理事实', () => {
    const q = buildFourSchoolQueries(mingju)
    for (const k of Object.keys(q)) {
      expect(q[k]).toContain('壬水')
      expect(q[k]).toContain('建禄格')
    }
  })

  test('徐家 query 提喜忌(因为徐讲造化元钥用神链),韦家 query 也提(因为韦八步法要喜忌)', () => {
    const q = buildFourSchoolQueries(mingju)
    expect(q.xu).toContain('喜用神')
    expect(q.xu).toContain('忌神')
    expect(q.wei).toContain('喜用神')
  })
})

describe('buildFourSchoolPrompt - 完整 prompt 注入', () => {
  test('确定性结论优先注入(身强弱/喜忌/格局)', () => {
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju)
    expect(p).toContain('不得修改')
    expect(p).toContain('壬水')
    expect(p).toContain('身强')
    expect(p).toContain('建禄格')
    expect(p).toContain('喜用神')
  })

  test('四家标题全出现', () => {
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju)
    expect(p).toContain('【徐乐吾派】')
    expect(p).toContain('【梁湘润派】')
    expect(p).toContain('【袁树珊派】')
    expect(p).toContain('【韦千里派】')
  })

  test('每家提示语(query)都被注入,不被遗漏', () => {
    const q = buildFourSchoolQueries(mingju)
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju)
    // 四段 query 的关键短语都应该进 prompt
    expect(p).toContain(q.xu.slice(0, 30))  // 至少前 30 字符
    expect(p).toContain(q.liang.slice(0, 30))
    expect(p).toContain(q.yuan.slice(0, 30))
    expect(p).toContain(q.wei.slice(0, 30))
  })

  test('AI 综合段必须存在,且要求"不混用方法论"', () => {
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju)
    expect(p).toContain('AI 综合')
    expect(p).toContain('共识')
    expect(p).toContain('分歧')
    expect(p).toContain('四家方法论边界')
    expect(p).toContain('不得混用')
  })

  test('大运注入', () => {
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯 丙辰', mingju)
    expect(p).toContain('大运：甲寅 乙卯 丙辰')
  })
})

describe('buildFourSchoolPrompt - 优雅降级(RAG 不可用)', () => {
  const mockRefs = {
    xu: [{ content: '测试徐家古籍片段', source: '《子平真诠》', score: 0.9 }],
    liang: [],  // 这家没命中
    yuan: [{ content: '袁家片段', source: '《命理探原》' }],
    // wei: 整个缺
  }

  test('knowledgeBySchool 缺省 → 4 家都降级,prompt 仍生成', () => {
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju)
    expect(p).toContain('【徐乐吾派】')
    // 无古籍区块(全部降级)
    expect(p).not.toContain('该派古籍依据')
  })

  test('knowledgeBySchool 部分家空数组 → 该家降级,其他家正常', () => {
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju, mockRefs)
    // 徐家有引文
    expect(p).toContain('测试徐家古籍片段')
    expect(p).toContain('《子平真诠》')
    // 袁家有引文
    expect(p).toContain('袁家片段')
    expect(p).toContain('《命理探原》')
    // 梁家空数组 → 不注入古籍,但标题还在
    expect(p).toContain('【梁湘润派】')
    // 韦家整个缺 → 标题还在,不注入古籍
    expect(p).toContain('【韦千里派】')
  })

  test('knowledgeBySchool 全有 → 4 家全部古籍注入', () => {
    const p = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju, {
      xu: [{ content: 'a', source: '《子平真诠》' }],
      liang: [{ content: 'b', source: '《梁氏讲义》' }],
      yuan: [{ content: 'c', source: '《命理探原》' }],
      wei: [{ content: 'd', source: '《千里命稿》' }]
    })
    expect(p).toContain('《子平真诠》')
    expect(p).toContain('《梁氏讲义》')
    expect(p).toContain('《命理探原》')
    expect(p).toContain('《千里命稿》')
  })

  test('knowledgeBySchool 是 null/undefined → 降级同缺省', () => {
    const p1 = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju, null)
    const p2 = buildFourSchoolPrompt('壬午 辛亥 壬辰 乙巳', '甲寅 乙卯', mingju, undefined)
    expect(p1).not.toContain('该派古籍依据')
    expect(p2).not.toContain('该派古籍依据')
  })
})

describe('formatSchoolSection - 单段单元', () => {
  const prompt = '示例:从格局展开...'
  test('有 refs → 含【该派古籍依据】+ 内容', () => {
    const refs = [
      { content: '片段 A', source: '《书甲》', score: 0.88 },
      { content: '片段 B', source: '《书乙》' }  // 无 score
    ]
    const s = formatSchoolSection('xu', prompt, refs)
    expect(s).toContain('【徐乐吾派】')
    expect(s).toContain('【该派古籍依据】')
    expect(s).toContain('片段 A')
    expect(s).toContain('片段 B')
    expect(s).toContain('《书甲》')
    expect(s).toContain('《书乙》')
    expect(s).toContain('相关度 0.88')
    expect(s).not.toContain('相关度 undefined')  // score 缺失时不输出残值
    expect(s).toContain(prompt)
  })

  test('无 refs / 空数组 → 不出古籍区块', () => {
    const s1 = formatSchoolSection('wei', prompt, [])
    const s2 = formatSchoolSection('wei', prompt, undefined)
    expect(s1).not.toContain('【该派古籍依据】')
    expect(s2).not.toContain('【该派古籍依据】')
    expect(s1).toContain('【韦千里派】')
    expect(s2).toContain('【韦千里派】')
    expect(s1).toContain(prompt)
  })

  test('未知 school 名 → 用原名作标题(不崩)', () => {
    const s = formatSchoolSection('unknown', prompt, [])
    expect(s).toContain('unknown')
    expect(s).toContain(prompt)
    expect(s).not.toContain('【该派古籍依据】')
  })
})
