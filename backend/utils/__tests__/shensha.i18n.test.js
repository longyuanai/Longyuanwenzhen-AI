// 神煞英文术语表的穷尽性
//
// 项目在这件事上栽过两次：STRENGTH 漏了 3 档、GEJU 漏了 2 种，
// 结果是那些盘的英文正文里混进中文，而所有测试都是绿的。
// 根因是「表」和「算法取值清单」两处各自维护，谁也不知道对方变了。
//
// 这里直接拿算法侧的 CATEGORY 当唯一真相去校验译表，
// 加一个神煞而忘了补英文，这条测试立刻红。

const { CATEGORY, MEANINGS, analyzeShenSha } = require('../shensha')
const terms = require('../i18n/baziTerms')
const { paipan } = require('../bazi')

describe('神煞译表穷尽性', () => {
  test('SHEN_SHA 的键集与算法侧 CATEGORY 完全一致', () => {
    expect(Object.keys(terms.SHEN_SHA).sort()).toEqual(Object.keys(CATEGORY).sort())
  })

  test('每条译文都是英文，不含中文残留', () => {
    for (const [zh, en] of Object.entries(terms.SHEN_SHA)) {
      expect(en).toBeTruthy()
      expect(en).not.toMatch(/[一-龥]/)
      expect(en).not.toBe(zh)
    }
  })

  test('shenSha() 查得到全部取值；查不到时回退原文而非 undefined', () => {
    for (const name of Object.keys(CATEGORY)) {
      const en = terms.shenSha(name)
      expect(en).not.toMatch(/[一-龥]/)
      expect(en).not.toBe('undefined')
    }
    expect(terms.shenSha('莫须有煞')).toBe('莫须有煞')
  })

  test('柱名与宫名也有英文', () => {
    for (const k of ['year', 'month', 'day', 'hour']) {
      expect(terms.pillarName(k)).not.toMatch(/[一-龥]/)
    }
    for (const k of ['mingGong', 'shenGong']) {
      expect(terms.PALACE[k]).not.toMatch(/[一-龥]/)
    }
  })

  test('实盘抽样：任一盘算出的神煞都能全部译成英文', () => {
    for (let i = 0; i < 200; i++) {
      const year = 1900 + ((i * 41) % 201)
      const pp = paipan({
        year, month: (i % 12) + 1, day: (i % 28) + 1,
        hour: i % 24, minute: 0, gender: i % 2 ? 'male' : 'female'
      })
      for (const s of analyzeShenSha(pp).list) {
        expect(terms.shenSha(s.name)).not.toMatch(/[一-龥]/)
      }
    }
  })

  test('中文释义同样覆盖全部取值（中文侧也不能有空白）', () => {
    expect(Object.keys(MEANINGS).sort()).toEqual(Object.keys(CATEGORY).sort())
  })
})
