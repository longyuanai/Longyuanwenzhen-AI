// 命宫 / 身宫 与第三方实现差分
//
// 命宫身宫的公式是我从 tyme4ts 的 getOwnSign()/getBodySign() 反推出来的：
//   命宫支 = (5 − 月支序 − 时支序) mod 12
//   身宫支 = (月支序 + 时支序 + 1) mod 12
//   天干由年干按五虎遁起
//
// 反推来的规律必须逐盘验回去，否则「我看了 20 个样本觉得是这样」和
// 「它就是这样」之间的差距，会以线上错盘的形式暴露。
//
// 为什么不直接用 tyme4ts：它是 devDependency，只做校验不进生产；
// 而且小程序离线兜底也要有一份纯 JS 实现，不可能打包 tyme4ts 进去。

const { computePalaces, ganOfBranchByYear } = require('../shensha')
const { paipan } = require('../bazi')
const { SolarTime, ChildLimit, LunarSect1ChildLimitProvider } = require('tyme4ts')

ChildLimit.provider = new LunarSect1ChildLimitProvider()

function reference(y, m, d, h, mi) {
  const ec = SolarTime.fromYmdHms(y, m, d, h, mi, 0).getLunarHour().getEightChar()
  return { mingGong: ec.getOwnSign().getName(), shenGong: ec.getBodySign().getName() }
}

function ours(y, m, d, h, mi, gender) {
  const pp = paipan({ year: y, month: m, day: d, hour: h, minute: mi, gender })
  const p = computePalaces(pp)
  return {
    mingGong: p.mingGong.gan + p.mingGong.zhi,
    shenGong: p.shenGong.gan + p.shenGong.zhi
  }
}

function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('命宫身宫与 tyme4ts 差分', () => {
  test('黄金基准盘', () => {
    expect(ours(2002, 11, 20, 10, 0, 'male')).toEqual(reference(2002, 11, 20, 10, 0))
  })

  // 这里只做快速冒烟。上万盘的全量差分在 scripts/diff-paipan.js 里，
  // 走 npm run diff:paipan —— 跑三千盘要二十多秒，放进 npm test 会把
  // 每次改代码的反馈循环从 10 秒拖到 45 秒，最后的结果是没人愿意跑测试。
  test('随机 300 盘全部一致（全量见 npm run diff:paipan）', () => {
    const rnd = makeRng(20260822)
    const pick = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
    const mismatches = []

    for (let i = 0; i < 300; i++) {
      const year = pick(1900, 2100)
      const month = pick(1, 12)
      const day = pick(1, new Date(year, month, 0).getDate())
      const hour = pick(0, 23)
      const minute = pick(0, 59)
      const gender = rnd() < 0.5 ? 'male' : 'female'

      const a = ours(year, month, day, hour, minute, gender)
      const b = reference(year, month, day, hour, minute)
      if (a.mingGong !== b.mingGong || a.shenGong !== b.shenGong) {
        mismatches.push({ when: `${year}-${month}-${day} ${hour}:${minute}`, ours: a, ref: b })
      }
    }

    expect(mismatches.slice(0, 5)).toEqual([])
    expect(mismatches).toHaveLength(0)
  })

  // 立春前后年干会换，而两宫的天干由年干起——这里最容易错
  test('立春交接前后：年干换，宫干跟着换', () => {
    for (const [h, label] of [[7, '立春前'], [9, '立春后']]) {
      const a = ours(2002, 2, 4, h, 0, 'male')
      const b = reference(2002, 2, 4, h, 0)
      expect({ label, ...a }).toEqual({ label, ...b })
    }
    // 确实跨过了年柱边界，否则这条测试等于没测
    expect(ours(2002, 2, 4, 7, 0, 'male').mingGong)
      .not.toBe(ours(2002, 2, 4, 9, 0, 'male').mingGong)
  })

  // 月支 × 时支 共 144 种组合，是命宫身宫公式的完整定义域。
  // 逐日扫描全年不会覆盖到更多组合，只会多花时间。
  test('覆盖全部 12×12 月支时支组合', () => {
    const seen = new Set()
    for (let m = 1; m <= 12; m++) {
      for (const d of [5, 20]) {          // 同月取两天，确保跨过节气分月
        for (let h = 0; h <= 23; h++) {
          const pp = paipan({ year: 1984, month: m, day: d, hour: h, minute: 0, gender: 'male' })
          seen.add(pp.monthPillar.zhi + pp.hourPillar.zhi)
          expect(ours(1984, m, d, h, 0, 'male')).toEqual(reference(1984, m, d, h, 0))
        }
      }
    }
    expect(seen.size).toBe(144)
  })
})

describe('五虎遁', () => {
  test('对齐口诀：甲己丙作首、乙庚戊为头、丙辛寻庚起、丁壬壬位、戊癸甲寅', () => {
    expect(ganOfBranchByYear('甲', '寅')).toBe('丙')
    expect(ganOfBranchByYear('己', '寅')).toBe('丙')
    expect(ganOfBranchByYear('乙', '寅')).toBe('戊')
    expect(ganOfBranchByYear('庚', '寅')).toBe('戊')
    expect(ganOfBranchByYear('丙', '寅')).toBe('庚')
    expect(ganOfBranchByYear('辛', '寅')).toBe('庚')
    expect(ganOfBranchByYear('丁', '寅')).toBe('壬')
    expect(ganOfBranchByYear('壬', '寅')).toBe('壬')
    expect(ganOfBranchByYear('戊', '寅')).toBe('甲')
    expect(ganOfBranchByYear('癸', '寅')).toBe('甲')
  })

  test('从寅顺行推其余地支', () => {
    // 辛年寅起庚：寅庚 卯辛 辰壬 巳癸 …
    expect(ganOfBranchByYear('辛', '卯')).toBe('辛')
    expect(ganOfBranchByYear('辛', '辰')).toBe('壬')
    expect(ganOfBranchByYear('辛', '巳')).toBe('癸')
    // 丑是十二月，从寅**顺行 11 步**，不是「寅退一位」——
    // 12 个月配 10 个天干不整除，按退一位去想会错。
    // 实盘印证：2002-01-20 为辛巳年辛丑月。
    expect(ganOfBranchByYear('辛', '丑')).toBe('辛')
    expect(ganOfBranchByYear('辛', '子')).toBe('庚')
  })

  test('与月柱天干推法一致（同一套五虎遁）', () => {
    for (const [y, m, d] of [[2002, 11, 20], [1984, 6, 6], [1955, 3, 7], [2077, 9, 9]]) {
      const pp = paipan({ year: y, month: m, day: d, hour: 10, minute: 0, gender: 'male' })
      expect(ganOfBranchByYear(pp.yearPillar.gan, pp.monthPillar.zhi))
        .toBe(pp.monthPillar.gan)
    }
  })
})
