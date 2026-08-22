// utils/__tests__/paipan-parity.test.js - 前后端排盘一致性
//
// 为什么要有这个测试：
//   小程序离线兜底用 miniprogram/utils/bazi.js，联网时用后端 utils/bazi.js
//   （lunar-javascript）。两者一旦分歧，用户就会看到「展示的盘」与「解读依据的盘」
//   不是同一个 —— 对命理产品这是最严重的一类错误。
//
//   2026-07-25 修复前的实测：随机抽 4 盘，四柱 4/4 不一致（月柱按日历月切分、
//   晚子时时干用当日日干），起运年龄 3/4 不一致（写死 1 岁）。
//
//   现在小程序侧的节气边界来自 miniprogram/utils/solarTerms.js，
//   而那张表由 backend/scripts/gen-solar-terms.js 从 lunar-javascript 预生成，
//   因此两端是按构造对齐的。本测试逐日校验这个不变量。
//
// 改了任一侧的排盘逻辑、或重新生成节气表后，这个测试必须仍然全绿。

const serverBazi = require('../bazi')
const localBazi = require('../../../miniprogram/utils/bazi')

function pillarsOf(r) {
  return ['year', 'month', 'day', 'hour']
    .map((k) => r[k + 'Pillar'].gan + r[k + 'Pillar'].zhi)
    .join(' ')
}

function bothPaipan(y, m, d, h, gender, minute = 0, extra = {}) {
  const args = { year: y, month: m, day: d, hour: h, minute, gender, ...extra }
  return {
    server: serverBazi.paipan(args),
    local: localBazi.paipan(args)
  }
}

describe('前后端排盘一致性 - 十神与藏干', () => {
  // 这组测试补的是一个长期缺口：此前 parity 只比四柱与大运，从不比十神，
  // 于是本地把**地支**直接喂给了只吃天干的 getShiShen()——
  // TIANGAN.indexOf('亥') === -1，-1 % 2 === -1 永不等于日干的 0/1，
  // sameYinYang 恒为 false，四个地支十神一律落到「异性」那一档。
  // 黄金基准盘（机主本人盘）上 3/4 地支十神是错的，四柱却完全正确，
  // 所以旧测试一路绿灯。地支十神须按藏干本气论。
  const CASES = [
    [2002, 11, 20, 10, 'male'],    // 黄金基准：机主本人盘
    [1901, 3, 15, 4, 'female'],
    [1960, 7, 1, 13, 'male'],
    [1984, 2, 4, 23, 'female'],
    [2024, 12, 31, 0, 'male'],
    [2099, 6, 6, 18, 'female']
  ]

  test.each(CASES)('%i-%i-%i %i时 %s：十神八项全一致', (y, m, d, h, gender) => {
    const { server, local } = bothPaipan(y, m, d, h, gender)
    expect(local.tenGods).toEqual(server.tenGods)
  })

  test.each(CASES)('%i-%i-%i %i时 %s：藏干一致', (y, m, d, h, gender) => {
    const { server, local } = bothPaipan(y, m, d, h, gender)
    expect(local.cangGan).toEqual(server.cangGan)
  })

  test('逐日扫描 1988 年：十神两端完全一致', () => {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        const { server, local } = bothPaipan(1988, m, d, 9, 'male')
        expect(local.tenGods).toEqual(server.tenGods)
      }
    }
  })

  test('getShiShen 收到地支时抛错，不再静默算错', () => {
    expect(() => localBazi.getShiShen('壬', '亥')).toThrow(/只接受天干/)
    expect(localBazi.getShiShenOfZhi('壬', '亥')).toBe('比肩')  // 亥藏本气壬，同为阳水
  })
})

describe('前后端排盘一致性 - 真太阳时', () => {
  // 小程序侧的 trueSolarTime.js 是后端同一文件的生成物，所以「一致」是
  // 按构造成立的。这里验的是接线：两侧都真的把校正接进了排盘主流程，
  // 而不是有一侧引了模块却没用。
  const CITIES = ['喀什', '乌鲁木齐', '拉萨', '成都', '北京', '哈尔滨', '上海']

  test.each(CITIES)('%s：校正后四柱与大运两端一致', (city) => {
    const { server, local } = bothPaipan(1990, 8, 8, 6, 'male', 15, { birthPlace: city })
    expect(pillarsOf(local)).toBe(pillarsOf(server))
    expect(local.daYun.startAge).toBe(server.daYun.startAge)
    expect(local.trueSolarTime.offsetMinutes).toBe(server.trueSolarTime.offsetMinutes)
  })

  test('跨日校正两端一致（含日柱与十神）', () => {
    const { server, local } = bothPaipan(2000, 6, 15, 0, 'male', 30, { birthPlace: '喀什' })
    expect(server.trueSolarTime.crossedDay).toBe(true)
    expect(pillarsOf(local)).toBe(pillarsOf(server))
    expect(local.dayPillar.gan).toBe(server.dayPillar.gan)
    expect(local.tenGods).toEqual(server.tenGods)
  })

  test('不传出生地时两端都不校正，且与加真太阳时之前的结论相同', () => {
    const { server, local } = bothPaipan(2000, 6, 15, 0, 'male', 30)
    expect(server.trueSolarTime).toBeNull()
    expect(local.trueSolarTime).toBeNull()
    expect(pillarsOf(server)).toBe('庚辰 壬午 甲辰 甲子')
    expect(pillarsOf(local)).toBe(pillarsOf(server))
  })

  test('两端 input 都保留钟表时间，不被校正改写', () => {
    const { server, local } = bothPaipan(2000, 6, 15, 0, 'male', 30, { birthPlace: '喀什' })
    for (const r of [server, local]) {
      expect(r.input.day).toBe(15)
      expect(r.input.hour).toBe(0)
      expect(r.input.minute).toBe(30)
    }
  })

  test('随机抽样：多城市多时点全部一致', () => {
    let checked = 0
    for (const city of CITIES) {
      for (const hour of [0, 5, 11, 17, 23]) {
        for (const [y, m, d] of [[1955, 3, 7], [1988, 11, 3], [2024, 2, 11]]) {
          const { server, local } = bothPaipan(y, m, d, hour, 'female', 40, { birthPlace: city })
          expect(pillarsOf(local)).toBe(pillarsOf(server))
          checked++
        }
      }
    }
    expect(checked).toBe(CITIES.length * 5 * 3)
  })
})

describe('前后端排盘一致性 - 四柱', () => {
  test('黄金基准盘（机主本人 2002-11-20 巳时男）两端一致', () => {
    const { server, local } = bothPaipan(2002, 11, 20, 10, 'male')
    expect(pillarsOf(local)).toBe(pillarsOf(server))
    expect(pillarsOf(server)).toBe('壬午 辛亥 壬辰 乙巳')
  })

  test('节气分月：立冬前后同月出生，月柱应不同且两端一致', () => {
    // 2002 立冬 = 11-07 22:21，前后各取一天
    const before = bothPaipan(2002, 11, 6, 10, 'male')
    const after = bothPaipan(2002, 11, 8, 10, 'male')

    expect(before.local.monthPillar.zhi).toBe(before.server.monthPillar.zhi)
    expect(after.local.monthPillar.zhi).toBe(after.server.monthPillar.zhi)
    // 跨了节，月支必须变（戌 → 亥）
    expect(before.server.monthPillar.zhi).not.toBe(after.server.monthPillar.zhi)
  })

  test('立春分年：立春前出生年柱归上一年，两端一致', () => {
    // 2002 立春 = 02-04 08:24
    const before = bothPaipan(2002, 1, 15, 10, 'male')
    const after = bothPaipan(2002, 3, 15, 10, 'male')

    expect(pillarsOf(before.local)).toBe(pillarsOf(before.server))
    expect(before.server.yearPillar.gan + before.server.yearPillar.zhi).toBe('辛巳')
    expect(after.server.yearPillar.gan + after.server.yearPillar.zhi).toBe('壬午')
  })

  test('立春当日跨越交接时刻：08:24 前后年柱不同，两端一致', () => {
    const before = bothPaipan(2002, 2, 4, 7, 'male')
    const after = bothPaipan(2002, 2, 4, 9, 'male')

    expect(pillarsOf(before.local)).toBe(pillarsOf(before.server))
    expect(pillarsOf(after.local)).toBe(pillarsOf(after.server))
    expect(before.server.yearPillar.zhi).not.toBe(after.server.yearPillar.zhi)
  })

  test('晚子时：23 点日柱进次日，时柱由该日干起遁，两端一致', () => {
    const { server, local } = bothPaipan(2010, 12, 31, 23, 'female')
    expect(pillarsOf(local)).toBe(pillarsOf(server))
    // 流派 1（默认）：23 点即进次日 → 日柱由乙卯进为丙辰，
    // 时柱按丙起遁得戊子。日柱与时柱同源，盘面自洽。
    expect(server.dayPillar.gan + server.dayPillar.zhi).toBe('丙辰')
    expect(server.hourPillar.gan + server.hourPillar.zhi).toBe('戊子')
  })

  // 这条锁的是「盘面自洽」这个性质本身，而不是某个具体干支。
  // 旧的流派 2 排出过 日柱=辛亥 + 时柱=庚子（庚子是从次日日干壬推的，
  // 辛日的子时本应是戊子），导致时干十神以错误的日主计算，
  // 进而污染身强弱/喜忌/格局。由 scripts/diff-paipan.js 与 tyme4ts 差分发现。
  test('晚子时：时柱必须能由盘面日主按五鼠遁推回（不允许矛盾盘）', () => {
    // 五鼠遁：甲己起甲子、乙庚起丙子、丙辛起戊子、丁壬起庚子、戊癸起壬子
    const ZI_START = { 甲: '甲', 己: '甲', 乙: '丙', 庚: '丙', 丙: '戊', 辛: '戊', 丁: '庚', 壬: '庚', 戊: '壬', 癸: '壬' }

    // 连续 40 天覆盖完整一轮日干，且横跨月界与年界
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(1965, 11, 10 + i))
      const { server, local } = bothPaipan(
        d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 'male')

      expect(pillarsOf(local)).toBe(pillarsOf(server))
      expect(server.hourPillar.zhi).toBe('子')
      expect(server.hourPillar.gan).toBe(ZI_START[server.dayPillar.gan])
    }
  })

  test('元旦前后（当年小寒未到，归上一年子月）两端一致', () => {
    const { server, local } = bothPaipan(2003, 1, 2, 10, 'male')
    expect(pillarsOf(local)).toBe(pillarsOf(server))
  })
})

describe('前后端排盘一致性 - 大运', () => {
  test('起运年龄两端一致，且不是此前写死的 1 岁', () => {
    const { server, local } = bothPaipan(2002, 11, 20, 10, 'male')
    expect(local.daYun.startAge).toBe(server.daYun.startAge)
    expect(server.daYun.startAge).toBe(7)
  })

  // 回归：节气表范围若不比排盘支持范围两端各多一年，年初/年末出生者算起运时
  // 要查的相邻年份节落在表外，本地会退回保守值 1 岁而与后端不一致。
  test('表边界：1900 年初与 2100 年末出生者起运年龄仍与后端一致', () => {
    const headOfRange = bothPaipan(1900, 1, 1, 0, 'male')
    expect(headOfRange.local.daYun.startAge).toBe(headOfRange.server.daYun.startAge)
    expect(headOfRange.local.daYun.startAge).not.toBe(1) // 不能是兜底值

    const tailOfRange = bothPaipan(2100, 12, 31, 23, 'female')
    expect(tailOfRange.local.daYun.startAge).toBe(tailOfRange.server.daYun.startAge)
  })

  test('顺逆与前若干步大运干支、年龄区间两端一致', () => {
    const cases = [
      [2002, 11, 20, 10, 'male'],
      [1985, 3, 15, 14, 'female'],
      [1970, 7, 7, 6, 'male'],
      [2010, 12, 31, 23, 'female'],
      [1900, 1, 1, 0, 'male'],      // 表下界
      [2100, 12, 31, 23, 'female']  // 表上界
    ]
    cases.forEach(([y, m, d, h, g]) => {
      const { server, local } = bothPaipan(y, m, d, h, g)
      const label = `${y}-${m}-${d} ${h}时 ${g}`
      expect(`${label}: ${local.daYun.isForward}`).toBe(`${label}: ${server.daYun.isForward}`)
      expect(`${label}: ${local.daYun.startAge}`).toBe(`${label}: ${server.daYun.startAge}`)
      for (let i = 0; i < 6; i++) {
        const ls = local.daYun.daYunList[i]
        const ss = server.daYun.daYunList[i]
        expect(`${label} 第${i + 1}步: ${ls.gan}${ls.zhi} ${ls.ageRange}`)
          .toBe(`${label} 第${i + 1}步: ${ss.gan}${ss.zhi} ${ss.ageRange}`)
      }
    })
  })
})

describe('前后端排盘一致性 - 逐日扫描', () => {
  // 抽样扫描而非全量：覆盖闰年、世纪边界、各节气交界月份
  function scanYear(year, gender) {
    const mismatches = []
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = new Date(year, month, 0).getDate()
      for (let day = 1; day <= daysInMonth; day++) {
        for (const hour of [0, 10, 23]) {
          const { server, local } = bothPaipan(year, month, day, hour, gender)
          const sp = pillarsOf(server)
          const lp = pillarsOf(local)
          if (sp !== lp) {
            mismatches.push(`${year}-${month}-${day} ${hour}时: 服务端 ${sp} / 本地 ${lp}`)
          }
        }
      }
    }
    return mismatches
  }

  test.each([
    [1900, 'male'],   // 表下界
    [1988, 'female'], // 闰年
    [2000, 'male'],   // 世纪闰年
    [2002, 'male'],   // 黄金基准年
    [2024, 'female'],
    [2100, 'male']    // 表上界
  ])('%i 年全年逐日四柱两端完全一致', (year, gender) => {
    const mismatches = scanYear(year, gender)
    expect(mismatches.slice(0, 10)).toEqual([])
    expect(mismatches).toHaveLength(0)
  })
})
