// utils/__tests__/localFallback.en.test.js - 英文本地降级模板
//
// 降级模板是 AI 挂掉时用户唯一看到的东西，比正常路径更需要保护 ——
// 它平时不跑，坏了没人发现，等真出故障那天才暴露。
//
// 重点锁：
//   1. 不渗中文（除刻意保留的技术依据附录）
//   2. 不渗 undefined / NaN
//   3. conflicts 分支（少数盘才触发，最容易腐坏）
//   4. 非绝对化措辞、不混西方占星词汇 —— 与 promptBuilder.en 同一套调性

const { paipan } = require('../bazi')
const { analyzeMingju } = require('../mingju')
const {
  buildBasicFallbackEn,
  buildDeepFallbackEn,
  DISCLAIMER_EN,
  LOCAL_TAG
} = require('../localFallback.en')

function chartOf(y, m, d, h, gender = 'male') {
  const pp = paipan({ year: y, month: m, day: d, hour: h, minute: 0, gender })
  return {
    mingju: analyzeMingju(pp),
    baziStr: ['year', 'month', 'day', 'hour'].map((k) => pp[k + 'Pillar'].gan + pp[k + 'Pillar'].zhi).join(' '),
    dayunStr: pp.daYun.daYunList.map((x) => x.ganZhi).join(' ')
  }
}

// 正文（不含刻意保留中文原文的技术依据附录）
function bodyOf(text) {
  return text.split('Technical derivation')[0]
}

const NORMAL = chartOf(2002, 11, 20, 10, 'male')
// 该盘 yongShen.conflicts 非空（调候需火但火是扶抑忌神）
const WITH_CONFLICT = chartOf(1981, 1, 15, 2, 'male')

describe('英文降级模板 - 基本形态', () => {
  test('开头标注是模板而非 AI，不假装', () => {
    const out = buildBasicFallbackEn(NORMAL)
    expect(out.startsWith(LOCAL_TAG.trim().slice(0, 20))).toBe(true)
    expect(out).toContain('Offline template')
    expect(out).toContain('temporarily unavailable')
  })

  test('末尾附免责声明，定位为自我认知工具', () => {
    const basic = buildBasicFallbackEn(NORMAL)
    const deep = buildDeepFallbackEn(NORMAL)
    ;[basic, deep].forEach((out) => {
      expect(out).toContain(DISCLAIMER_EN)
      expect(out).toContain('not fortune-telling')
    })
  })

  test('三段 / 五段结构齐全', () => {
    const basic = buildBasicFallbackEn(NORMAL)
    expect(basic).toContain('1. Favorable elements')
    expect(basic).toContain('2. Chart character')
    expect(basic).toContain('3. Personality tendencies')

    const deep = buildDeepFallbackEn(NORMAL)
    ;['1. Overall reading', '2. Career and wealth', '3. Relationships',
      '4. Health areas worth attention', '5. Practical guidance']
      .forEach((s) => expect(deep).toContain(s))
  })

  test('确定性结论如实呈现，与 mingju 一致', () => {
    const out = buildBasicFallbackEn(NORMAL)
    expect(out).toContain('Ren (Yang Water)')
    expect(out).toContain('Strong Day Master')
    expect(out).toContain('Favorable elements: Wood, Fire, Earth')
    expect(out).toContain('Unfavorable elements: Metal, Water')
    expect(out).toContain('Jian Lu')
  })

  test('深度版带四柱与大运，且逐段翻译', () => {
    const out = buildDeepFallbackEn(NORMAL)
    expect(out).toContain('Ren-Wu (Yang Water over Horse)')
    expect(out).toContain('Ren-Zi (Yang Water over Rat)')
    expect(out).toContain('→')
  })
})

describe('英文降级模板 - 不渗漏', () => {
  test('正文无中文（技术依据附录除外）', () => {
    ;[buildBasicFallbackEn(NORMAL), buildDeepFallbackEn(NORMAL)].forEach((out) => {
      expect(bodyOf(out)).not.toMatch(/[一-龥]/)
    })
  })

  test('技术依据附录刻意保留中文原文，并标注语言', () => {
    const out = buildBasicFallbackEn(NORMAL)
    expect(out).toContain('Technical derivation')
    expect(out).toContain('in Chinese')
    expect(out).toContain(NORMAL.mingju.basis[0])
  })

  test('无 undefined / NaN', () => {
    ;[buildBasicFallbackEn(NORMAL), buildDeepFallbackEn(NORMAL),
      buildBasicFallbackEn(WITH_CONFLICT), buildDeepFallbackEn(WITH_CONFLICT)]
      .forEach((out) => expect(out).not.toMatch(/undefined|NaN/))
  })

  test('不出现字符串拼接语法残留（曾把 + 写进模板字符串里）', () => {
    ;[buildBasicFallbackEn(WITH_CONFLICT), buildDeepFallbackEn(WITH_CONFLICT)]
      .forEach((out) => {
        expect(out).not.toMatch(/'\s*\+\s*'/)
      })
  })
})

describe('英文降级模板 - conflicts 分支', () => {
  test('该盘确实带 conflicts（夹具前提）', () => {
    expect(WITH_CONFLICT.mingju.yongShen.conflicts.length).toBeGreaterThan(0)
  })

  test('冲突提示出现，且五行已译成英文', () => {
    const out = buildBasicFallbackEn(WITH_CONFLICT)
    expect(out).toContain('flagged tension')
    expect(out).toMatch(/requirement over: (Wood|Fire|Earth|Metal|Water)/)
    // 不能把 "火" 原样吐进正文
    expect(bodyOf(out)).not.toContain('火')
  })

  test('无冲突的盘不出现该提示', () => {
    expect(NORMAL.mingju.yongShen.conflicts).toHaveLength(0)
    expect(buildBasicFallbackEn(NORMAL)).not.toContain('flagged tension')
  })
})

describe('英文降级模板 - 调性对齐 promptBuilder.en', () => {
  const out = buildDeepFallbackEn(NORMAL)

  test('用非绝对化措辞，不打包票', () => {
    expect(out).toMatch(/tends to|may be|tend to/)
    expect(out).not.toMatch(/will definitely|is destined|guaranteed/i)
  })

  test('不混用西方占星词汇', () => {
    expect(out).not.toMatch(/\bsun sign\b|\bhoroscope\b|\bretrograde\b|\bzodiac house\b/i)
  })

  test('健康小节明确不是医疗建议', () => {
    expect(out).toContain('not medical advice')
  })
})

describe('英文降级模板 - 多样命盘不炸', () => {
  test.each([
    [1985, 3, 15, 14, 'female'],
    [1970, 7, 7, 6, 'male'],
    [2010, 12, 31, 23, 'female'],
    [1900, 1, 1, 0, 'male'],
    [2100, 12, 31, 23, 'female']
  ])('%i-%i-%i %i时 %s', (y, m, d, h, g) => {
    const c = chartOf(y, m, d, h, g)
    ;[buildBasicFallbackEn(c), buildDeepFallbackEn(c)].forEach((out) => {
      expect(out.length).toBeGreaterThan(400)
      expect(out).not.toMatch(/undefined|NaN/)
      expect(bodyOf(out)).not.toMatch(/[一-龥]/)
      expect(out).toContain(DISCLAIMER_EN)
    })
  })
})
