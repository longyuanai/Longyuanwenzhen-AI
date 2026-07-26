// utils/__tests__/promptBuilder.en.test.js - 英文提示词构造
//
// 英文链路的核心风险不是"翻译得美不美"，而是三件会直接毁掉专业度的事：
//   1. 术语查表漏了 → 提示词里出现 undefined
//   2. 确定性结论没传到位 → AI 自己重新推导，与系统结论打架
//   3. 中文残留 → 输出里混进汉字，或模型被中文带偏用中文作答
// 这里逐条锁死。

const { paipan } = require('../bazi')
const { analyzeMingju } = require('../mingju')
const T = require('../i18n/baziTerms')
const {
  buildBasicPromptEn,
  buildDeepPromptEn,
  formatMingliFactsEn,
  formatKnowledgeContextEn
} = require('../promptBuilder.en')

function chartOf(y, m, d, h, gender) {
  const pp = paipan({ year: y, month: m, day: d, hour: h, minute: 0, gender })
  return {
    pp,
    mingju: analyzeMingju(pp),
    baziStr: ['year', 'month', 'day', 'hour'].map((k) => pp[k + 'Pillar'].gan + pp[k + 'Pillar'].zhi).join(' '),
    dayunStr: pp.daYun.daYunList.map((x) => x.ganZhi).join(' ')
  }
}

describe('baziTerms - 术语映射', () => {
  test('天干地支五行全部有译法，无遗漏', () => {
    '甲乙丙丁戊己庚辛壬癸'.split('').forEach((g) => {
      expect(T.gan(g)).toMatch(/^[A-Z][a-z]+ \((Yin|Yang) (Wood|Fire|Earth|Metal|Water)\)$/)
    })
    '子丑寅卯辰巳午未申酉戌亥'.split('').forEach((z) => {
      expect(T.zhi(z)).toMatch(/^[A-Z][a-z]+ \([A-Z][a-z]+\)$/)
    })
    '木火土金水'.split('').forEach((e) => {
      expect(['Wood', 'Fire', 'Earth', 'Metal', 'Water']).toContain(T.element(e))
    })
  })

  // 回归：术语表最初只按印象列了几个身强弱档和格局，漏了 偏强/中和/偏弱 与
  // 羊刃格/普通格，结果这些盘的英文正文里混进中文。术语表必须穷尽算法的全部
  // 取值 —— 这里直接对着算法源码的取值清单校验，改了算法这条会红。
  test('身强弱 5 档全部有译法（对齐 wangShuai.js 的分档表）', () => {
    const ALL_LABELS = ['身强', '偏强', '中和', '偏弱', '身弱']
    ALL_LABELS.forEach((label) => {
      const en = T.strength(label)
      expect(en).not.toBe(label)          // 必须被翻译，不是回退原文
      expect(en).not.toMatch(/[一-龥]/)
    })
  })

  test('格局 13 种全部有译法（对齐 geju.js 的返回值）', () => {
    const ALL_GEJU = [
      '正官格', '七杀格', '正印格', '偏印格', '正财格', '偏财格',
      '食神格', '伤官格', '建禄格', '羊刃格', '从强格', '从弱格', '普通格'
    ]
    ALL_GEJU.forEach((name) => {
      const en = T.geju(name)
      expect(en).not.toMatch(/[一-龥]/)
      expect(en).not.toContain('classical structure') // 那是查不到时的兜底
    })
  })

  test('十神用英文八字圈通行译名', () => {
    expect(T.tenGod('七杀')).toBe('Seven Killings')
    expect(T.tenGod('食神')).toBe('Eating God')
    expect(T.tenGod('劫财')).toBe('Rob Wealth')
    expect(T.tenGod('伤官')).toBe('Hurting Officer')
  })

  test('一柱翻译成"干-支(阴阳五行 over 生肖)"', () => {
    expect(T.pillar('壬午')).toBe('Ren-Wu (Yang Water over Horse)')
    expect(T.pillar('辛亥')).toBe('Xin-Hai (Yin Metal over Pig)')
  })

  test('查不到的词回退原文，绝不产生 undefined', () => {
    expect(T.element('紫')).toBe('紫')
    expect(T.gan('X')).toBe('X')
    expect(T.pillar('无效')).toBe('无效')
    expect(T.geju('某某格')).toBe('某某格 (classical structure)')
    expect(T.elements([])).toBe('none')
    expect(T.elements(null)).toBe('none')
    ;[T.element, T.gan, T.zhi, T.pillar, T.strength, T.season, T.tenGod, T.geju]
      .forEach((fn) => expect(String(fn('不存在'))).not.toContain('undefined'))
  })
})

describe('英文提示词 - 确定性结论注入', () => {
  const { mingju, baziStr, dayunStr } = chartOf(2002, 11, 20, 10, 'male')

  test('已知结论全部出现，且是英文形态', () => {
    const p = buildBasicPromptEn(baziStr, mingju)
    expect(p).toContain('Ren (Yang Water)')          // 日主
    expect(p).toContain('Strong Day Master')          // 身强
    expect(p).toContain('Jian Lu')                    // 建禄格
    expect(p).toContain('Favorable elements: Wood, Fire, Earth')
    expect(p).toContain('Unfavorable elements: Metal, Water')
    expect(p).toContain('Winter birth; needs Fire')   // 调候
  })

  test('四柱逐柱翻译，不是原样中文', () => {
    const p = buildBasicPromptEn(baziStr, mingju)
    expect(p).toContain('Ren-Wu (Yang Water over Horse)')
    expect(p).toContain('Xin-Hai (Yin Metal over Pig)')
  })

  test('明确禁止 AI 重新推导', () => {
    const facts = formatMingliFactsEn(mingju)
    expect(facts).toContain('MUST adopt them verbatim')
    expect(facts).toContain('Do NOT re-derive')
  })

  test('提示词里没有 undefined / null / NaN', () => {
    const basic = buildBasicPromptEn(baziStr, mingju)
    const deep = buildDeepPromptEn(baziStr, dayunStr, mingju)
    ;[basic, deep].forEach((p) => {
      expect(p).not.toMatch(/undefined|null|NaN/)
    })
  })

  test('深度报告带大运，且逐段翻译', () => {
    const p = buildDeepPromptEn(baziStr, dayunStr, mingju)
    expect(p).toContain('Luck Pillars')
    expect(p).toContain('Ren-Zi (Yang Water over Rat)')
    expect(p).toContain('→') // 段与段之间有顺序指示
  })
})

describe('英文提示词 - 面向英文读者的约束', () => {
  const { mingju, baziStr } = chartOf(2002, 11, 20, 10, 'male')
  const p = buildBasicPromptEn(baziStr, mingju)

  test('要求非绝对化表述', () => {
    expect(p).toContain('Use hedged language')
    expect(p).toMatch(/Never use[\s\S]*absolute claim/)
  })

  test('禁止混用西方占星词汇（两套体系，混用即露怯）', () => {
    expect(p).toContain('Do NOT borrow Western astrology vocabulary')
    expect(p).toContain('sun sign')
  })

  test('要求输出英文、不带汉字', () => {
    expect(p).toContain('No Chinese characters in the output')
  })

  test('定位为自我认知工具而非算命预测（对齐中文版免责基调）', () => {
    expect(p).toContain('self-reflection tool')
    expect(p).toContain('not')
  })
})

describe('英文提示词 - 中文判据与古籍原样透传', () => {
  const { mingju, baziStr } = chartOf(2002, 11, 20, 10, 'male')

  test('basis 中文原文注入，并说明要转述成英文', () => {
    const facts = formatMingliFactsEn(mingju)
    // 刻意不翻译 basis：改算法层风险高，交给模型转述
    expect(facts).toContain(mingju.basis[0])
    expect(facts).toContain('written in Chinese')
    expect(facts).toContain('restate their meaning')
  })

  test('RAG 文言片段原样注入，并声明冲突时以系统结论为准', () => {
    const refs = [
      { content: '冬水汪洋，非丙丁不能解其冻', source: '《穷通宝鉴》', score: 0.87 }
    ]
    const block = formatKnowledgeContextEn(refs)
    expect(block).toContain('冬水汪洋，非丙丁不能解其冻')
    expect(block).toContain('Classical Chinese')
    expect(block).toContain('the system conclusions win')
    expect(block).toContain('《穷通宝鉴》')
    expect(block).toContain('relevance 0.87')
  })

  test('无 RAG 结果时返回 null，调用方据此跳过区块', () => {
    expect(formatKnowledgeContextEn([])).toBeNull()
    expect(formatKnowledgeContextEn(undefined)).toBeNull()
    const p = buildBasicPromptEn(baziStr, mingju)
    expect(p).not.toContain('CLASSICAL SOURCES')
  })

  test('有 RAG 结果时区块被注入', () => {
    const p = buildBasicPromptEn(baziStr, mingju, [{ content: '古文片段', source: '书' }])
    expect(p).toContain('CLASSICAL SOURCES')
    expect(p).toContain('古文片段')
  })
})

describe('英文提示词 - 多样命盘不炸', () => {
  test.each([
    [1985, 3, 15, 14, 'female'],
    [1970, 7, 7, 6, 'male'],
    [2010, 12, 31, 23, 'female'],
    [1900, 1, 1, 0, 'male'],
    [2100, 12, 31, 23, 'female']
  ])('%i-%i-%i %i时 %s 能生成完整英文提示词', (y, m, d, h, g) => {
    const { mingju, baziStr, dayunStr } = chartOf(y, m, d, h, g)
    const basic = buildBasicPromptEn(baziStr, mingju)
    const deep = buildDeepPromptEn(baziStr, dayunStr, mingju)
    ;[basic, deep].forEach((p) => {
      expect(p.length).toBeGreaterThan(500)
      expect(p).not.toMatch(/undefined|NaN/)
      expect(p).toContain('Day Master:')
      expect(p).toContain('Favorable elements:')
    })
  })
})
