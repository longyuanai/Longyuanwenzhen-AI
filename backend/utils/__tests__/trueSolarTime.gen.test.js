// 小程序真太阳时模块是生成物，这里守住「改了后端忘了重新生成」
//
// 没有这道闸，后端加一个城市、修一处均时差系数，小程序侧会静默停留在旧版本，
// 于是同一个盘在「联网排盘」和「离线兜底」下给出不同的时柱——而且只在
// 断网时才暴露，最难复现的那一类。

const fs = require('fs')
const { build, DEST } = require('../../scripts/gen-true-solar-time')

describe('miniprogram/utils/trueSolarTime.js 生成物', () => {
  test('与后端源文件同步（不同步请跑 npm run gen:true-solar-time）', () => {
    expect(fs.existsSync(DEST)).toBe(true)
    expect(fs.readFileSync(DEST, 'utf-8')).toBe(build())
  })

  test('带「请勿手改」banner', () => {
    expect(fs.readFileSync(DEST, 'utf-8')).toMatch(/请勿手改/)
  })

  test('生成物可被直接 require，导出接口与后端一致', () => {
    const mp = require(DEST)
    const be = require('../trueSolarTime')
    expect(Object.keys(mp).sort()).toEqual(Object.keys(be).sort())
    // 抽样比对：同一入参必须得到同一结果
    const birth = { year: 2000, month: 11, day: 3, hour: 0, minute: 30 }
    expect(mp.toTrueSolarTime(birth, 75.99)).toEqual(be.toTrueSolarTime(birth, 75.99))
    expect(mp.lookupLongitude('乌鲁木齐')).toBe(be.lookupLongitude('乌鲁木齐'))
  })
})
