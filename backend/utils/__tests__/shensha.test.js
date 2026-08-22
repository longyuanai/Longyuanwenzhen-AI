// 神煞查表与命中逻辑
//
// 命宫身宫有第三方可差分（shensha.diff.test.js），神煞没有——tyme4ts 不暴露。
// 所以这里只能对着口诀逐条验表，外加几张有独立出处的实盘。
// 依据：bazi-skill-dist/core/梁湘润神煞探原通读笔记.md

const {
  analyzeShenSha, xunKong, TIAN_YI, TIAN_DE, YUE_DE, WEN_CHANG, CATEGORY, MEANINGS
} = require('../shensha')
const { paipan } = require('../bazi')

const chart = (y, m, d, h, gender = 'male', minute = 0) =>
  paipan({ year: y, month: m, day: d, hour: h, minute, gender })

const namesOf = (r) => r.list.map((s) => s.name)

describe('查表对口诀', () => {
  test('天乙贵人：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎', () => {
    for (const g of ['甲', '戊', '庚']) expect(TIAN_YI[g]).toEqual(['丑', '未'])
    for (const g of ['乙', '己']) expect(TIAN_YI[g]).toEqual(['子', '申'])
    for (const g of ['丙', '丁']) expect(TIAN_YI[g]).toEqual(['亥', '酉'])
    for (const g of ['壬', '癸']) expect(TIAN_YI[g]).toEqual(['卯', '巳'])
    expect(TIAN_YI['辛']).toEqual(['午', '寅'])
    expect(Object.keys(TIAN_YI)).toHaveLength(10)   // 十干无遗漏
  })

  test('月德贵人按三合局取阳干：寅午戌丙、申子辰壬、亥卯未甲、巳酉丑庚', () => {
    for (const z of ['寅', '午', '戌']) expect(YUE_DE[z]).toBe('丙')
    for (const z of ['申', '子', '辰']) expect(YUE_DE[z]).toBe('壬')
    for (const z of ['亥', '卯', '未']) expect(YUE_DE[z]).toBe('甲')
    for (const z of ['巳', '酉', '丑']) expect(YUE_DE[z]).toBe('庚')
    expect(Object.keys(YUE_DE)).toHaveLength(12)
  })

  test('天德贵人取值有干有支，这是它本来的样子（不是表写错了）', () => {
    expect(TIAN_DE['寅']).toBe('丁')   // 天干
    expect(TIAN_DE['卯']).toBe('申')   // 地支
    expect(Object.keys(TIAN_DE)).toHaveLength(12)
  })

  test('文昌贵人十干齐备', () => {
    expect(WEN_CHANG).toEqual({
      甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申',
      己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯'
    })
  })

  test('每个神煞都有释义与类别，不会在前端显示成空白', () => {
    for (const name of Object.keys(CATEGORY)) {
      expect(MEANINGS[name]).toBeTruthy()
      expect(['auspicious', 'neutral']).toContain(CATEGORY[name])
    }
    expect(Object.keys(MEANINGS).sort()).toEqual(Object.keys(CATEGORY).sort())
  })
})

describe('空亡（旬空）', () => {
  test('六旬各自的空亡', () => {
    expect(xunKong('甲', '子')).toEqual(['戌', '亥'])
    expect(xunKong('甲', '戌')).toEqual(['申', '酉'])
    expect(xunKong('甲', '申')).toEqual(['午', '未'])
    expect(xunKong('甲', '午')).toEqual(['辰', '巳'])
    expect(xunKong('甲', '辰')).toEqual(['寅', '卯'])
    expect(xunKong('甲', '寅')).toEqual(['子', '丑'])
  })

  test('同旬内任一日柱得到同一组空亡', () => {
    // 甲子旬：甲子 乙丑 丙寅 丁卯 戊辰 己巳 庚午 辛未 壬申 癸酉
    const xun = [['甲', '子'], ['乙', '丑'], ['丙', '寅'], ['丁', '卯'], ['戊', '辰'],
      ['己', '巳'], ['庚', '午'], ['辛', '未'], ['壬', '申'], ['癸', '酉']]
    for (const [g, z] of xun) expect(xunKong(g, z)).toEqual(['戌', '亥'])
  })

  test('非法入参抛错而不是静默返回错值', () => {
    expect(() => xunKong('甲', '子时')).toThrow(/空亡入参非法/)
    expect(() => xunKong('X', '子')).toThrow(/空亡入参非法/)
  })
})

describe('命中逻辑', () => {
  // 黄金基准盘：2002-11-20 巳时男 → 壬午 辛亥 壬辰 乙巳
  const golden = chart(2002, 11, 20, 10)

  test('黄金基准盘：天乙贵人落在时支巳（壬癸兔蛇藏）', () => {
    const r = analyzeShenSha(golden)
    const ty = r.list.find((s) => s.name === '天乙贵人')
    expect(ty).toBeDefined()
    expect(ty.pillars).toContain('hour')       // 时支为巳
    expect(golden.hourPillar.zhi).toBe('巳')
  })

  test('黄金基准盘：禄神落在日主壬之亥（壬禄在亥）', () => {
    const r = analyzeShenSha(golden)
    const lu = r.list.find((s) => s.name === '禄神')
    expect(lu).toBeDefined()
    expect(lu.pillars).toContain('month')      // 月支为亥
    expect(golden.monthPillar.zhi).toBe('亥')
  })

  test('日柱自身不论空亡', () => {
    // 构造一个日支恰好等于自身空亡的情形不可能发生（空亡按日柱推，
    // 必不含日支），这里验的是 day 从不出现在空亡命中里
    for (const [y, m, d, h] of [[1984, 3, 3, 5], [2001, 7, 7, 14], [1960, 12, 1, 22]]) {
      const r = analyzeShenSha(chart(y, m, d, h))
      const kw = r.list.find((s) => s.name === '空亡')
      if (kw) expect(kw.pillars).not.toContain('day')
    }
  })

  test('阴干日主不出羊刃（阴干不论刃，与 geju.js 同一套表）', () => {
    let yinCharts = 0
    for (let d = 1; d <= 20; d++) {
      const pp = chart(1990, 6, d, 12)
      if (['乙', '丁', '己', '辛', '癸'].includes(pp.dayPillar.gan)) {
        yinCharts++
        expect(namesOf(analyzeShenSha(pp))).not.toContain('羊刃')
      }
    }
    expect(yinCharts).toBeGreaterThan(5)   // 确实抽到过阴干盘，否则这条等于没测
  })

  test('byPillar 与 list 互相自洽', () => {
    const r = analyzeShenSha(golden)
    for (const s of r.list) {
      for (const p of s.pillars) {
        expect(r.byPillar[p]).toContain(s.name)
      }
    }
    for (const [pillar, names] of Object.entries(r.byPillar)) {
      for (const n of names) {
        expect(r.list.find((s) => s.name === n).pillars).toContain(pillar)
      }
    }
  })

  test('吉神排在中性煞之前', () => {
    for (const [y, m, d, h] of [[2002, 11, 20, 10], [1984, 2, 4, 23], [1955, 8, 8, 6]]) {
      const list = analyzeShenSha(chart(y, m, d, h)).list
      const firstNeutral = list.findIndex((s) => s.category === 'neutral')
      const lastAusp = list.map((s) => s.category).lastIndexOf('auspicious')
      if (firstNeutral !== -1 && lastAusp !== -1) expect(lastAusp).toBeLessThan(firstNeutral)
    }
  })

  test('pillarLabels 与 pillars 同序（都按年月日时）', () => {
    // 曾经 pillars 排过序而 pillarLabels 用的是命中顺序，
    // 前端就显示成「时柱/日柱」这种倒序。
    const ORDER = ['年柱', '月柱', '日柱', '时柱']
    for (let d = 1; d <= 30; d++) {
      for (const s of analyzeShenSha(chart(1984, 2, d, 23, 'female')).list) {
        expect(s.pillarLabels).toHaveLength(s.pillars.length)
        const idx = s.pillarLabels.map((l) => ORDER.indexOf(l))
        expect(idx).toEqual([...idx].sort((a, b) => a - b))
      }
    }
  })

  test('不重复计入同一柱（天乙查日干与年干两次也只记一次）', () => {
    for (let d = 1; d <= 30; d++) {
      const r = analyzeShenSha(chart(1993, 4, d, 8))
      for (const s of r.list) {
        expect(new Set(s.pillars).size).toBe(s.pillars.length)
      }
    }
  })
})

describe('刻意不实现的凶煞', () => {
  // 《神煞探原》里有大量凶煞，我们不算也不显：对用户有实际伤害，
  // 且命理类目审核最先盯的就是恐吓性内容。
  // 这条测试是防止日后有人「顺手」加回来而没人注意。
  const FORBIDDEN = ['自缢杀', '冲天杀', '戳肢杀', '天屠杀', '挂剑杀', '死病符', '天火杀', '电灵狂杀']

  test('全域抽样中都不出现死亡/伤残类凶煞', () => {
    for (let i = 0; i < 200; i++) {
      const y = 1900 + ((i * 37) % 201)
      const r = analyzeShenSha(chart(y, (i % 12) + 1, (i % 28) + 1, i % 24))
      for (const s of r.list) expect(FORBIDDEN).not.toContain(s.name)
    }
  })

  test('释义里不含吉凶断语式的恐吓措辞', () => {
    for (const text of Object.values(MEANINGS)) {
      expect(text).not.toMatch(/死|亡故|残|绝症|夭/)
    }
  })

  test('结果带免责说明', () => {
    expect(analyzeShenSha(chart(2002, 11, 20, 10)).note).toMatch(/不作主要断法/)
  })
})
