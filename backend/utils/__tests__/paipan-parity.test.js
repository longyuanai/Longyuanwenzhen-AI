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

function bothPaipan(y, m, d, h, gender, minute = 0) {
  return {
    server: serverBazi.paipan({ year: y, month: m, day: d, hour: h, minute, gender }),
    local: localBazi.paipan({ year: y, month: m, day: d, hour: h, minute, gender })
  }
}

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

  test('晚子时：23 点出生时干按次日日干起遁，两端一致', () => {
    const { server, local } = bothPaipan(2010, 12, 31, 23, 'female')
    expect(pillarsOf(local)).toBe(pillarsOf(server))
    // 乙卯日 23 点：日柱不变，时柱用次日(丙辰日)的丙起遁 → 戊子
    expect(server.dayPillar.gan + server.dayPillar.zhi).toBe('乙卯')
    expect(server.hourPillar.gan + server.hourPillar.zhi).toBe('戊子')
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
