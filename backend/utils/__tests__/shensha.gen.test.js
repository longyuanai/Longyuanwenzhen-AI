// 小程序神煞模块是生成物，这里守住「改了后端忘了重新生成」
//
// 比 trueSolarTime 那份更要紧一点：这个生成脚本会把 geju.js 的禄神/羊刃表
// 内联进去。改了 geju.js 而不重新生成，小程序侧就会拿着旧表算神煞，
// 于是「羊刃格」和「羊刃神煞」对同一个盘各说各话——而且只在离线时暴露。

const fs = require('fs')
const { build, DEST } = require('../../scripts/gen-shensha')
const { LU, YANG_REN } = require('../geju')
const be = require('../shensha')
const { paipan } = require('../bazi')

describe('miniprogram/utils/shensha.js 生成物', () => {
  test('与后端源文件同步（不同步请跑 npm run gen:shensha）', () => {
    expect(fs.existsSync(DEST)).toBe(true)
    expect(fs.readFileSync(DEST, 'utf-8')).toBe(build())
  })

  test('生成物不含 require，小程序侧自包含', () => {
    const content = fs.readFileSync(DEST, 'utf-8')
    expect(content).not.toMatch(/require\(/)
    expect(content).toMatch(/请勿手改/)
  })

  test('内联的禄神/羊刃表与 geju.js 逐项一致', () => {
    const mp = require(DEST)
    // 通过行为反查：日主禄在何支，两边必须一样
    for (const [gan, zhi] of Object.entries(LU)) {
      expect(build()).toContain(`${gan}: '${zhi}'`)
    }
    for (const [gan, zhi] of Object.entries(YANG_REN)) {
      expect(build()).toContain(`${gan}: '${zhi}'`)
    }
    expect(typeof mp.analyzeShenSha).toBe('function')
  })

  test('同一批盘上两端结果逐字节相同', () => {
    const mp = require(DEST)
    for (let i = 0; i < 120; i++) {
      const year = 1900 + ((i * 53) % 201)
      const pp = paipan({
        year, month: (i % 12) + 1, day: (i % 28) + 1,
        hour: i % 24, minute: 0, gender: i % 2 ? 'male' : 'female'
      })
      expect(mp.analyzeShenSha(pp)).toEqual(be.analyzeShenSha(pp))
      expect(mp.computePalaces(pp)).toEqual(be.computePalaces(pp))
    }
  })

  test('geju.js 改了表却没重新生成时会被发现', () => {
    // 模拟：把源表改一个值，生成物就应该与磁盘上的不同
    const current = fs.readFileSync(DEST, 'utf-8')
    expect(current).toContain("甲: '寅'")     // 甲禄在寅
    // 若有人把 geju.js 的甲禄改成别的支而不重新生成，
    // 上面的「与后端源文件同步」用例会立刻红——这里只是把依赖关系写明。
    expect(LU['甲']).toBe('寅')
  })
})
