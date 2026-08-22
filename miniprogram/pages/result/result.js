// pages/result/result.js
const bazi = require('../../utils/bazi')

Page({
  data: {
    result: null,
    pillars: [],
    isLocalFallback: false
  },

  onLoad() {
    // 从全局数据获取排盘结果
    const app = getApp()
    const result = app.currentBaziResult

    if (!result) {
      wx.showToast({
        title: '未找到排盘结果',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    // 组装四柱数据
    const pillars = [
      {
        name: '年柱',
        gan: result.yearPillar.gan,
        zhi: result.yearPillar.zhi,
        ganShiShen: result.tenGods.yearGan,
        zhiShiShen: result.tenGods.yearZhi,
        cangGan: result.cangGan.year
      },
      {
        name: '月柱',
        gan: result.monthPillar.gan,
        zhi: result.monthPillar.zhi,
        ganShiShen: result.tenGods.monthGan,
        zhiShiShen: result.tenGods.monthZhi,
        cangGan: result.cangGan.month
      },
      {
        name: '日柱',
        gan: result.dayPillar.gan,
        zhi: result.dayPillar.zhi,
        ganShiShen: '日主',
        zhiShiShen: result.tenGods.dayZhi,
        cangGan: result.cangGan.day
      },
      {
        name: '时柱',
        gan: result.hourPillar.gan,
        zhi: result.hourPillar.zhi,
        ganShiShen: result.tenGods.hourGan,
        zhiShiShen: result.tenGods.hourZhi,
        cangGan: result.cangGan.hour
      }
    ]

    this.setData({
      result: result,
      pillars: pillars,
      // 服务端排盘不可达时用了本地简化算法（起运年龄/大运区间会有偏差），
      // 明确告知用户，避免把降级结果当成权威结论
      isLocalFallback: !!result.isLocalFallback,
      trueSolarTime: this.buildTrueSolarTimeTip(result)
    })
  },

  // 真太阳时提示条。没启用校正就返回 null（不填出生地的用户看不到任何变化）。
  //
  // 展示这个不是炫技：跨日校正会连日柱一起改，用户如果记得自己「以前算出来是
  // X 日」，得让他知道差异从何而来，否则会以为我们算错了。
  buildTrueSolarTimeTip(result) {
    const t = result && result.trueSolarTime
    if (!t || !t.enabled) return null

    const sign = t.offsetMinutes >= 0 ? '+' : '−'
    const abs = Math.abs(t.offsetMinutes)
    const pad = (n) => String(n).padStart(2, '0')
    const s = t.solarTime
    return {
      place: t.place || (t.longitude + '°E'),
      offsetText: `${sign}${abs} 分钟`,
      solarTimeText: `${s.year}-${pad(s.month)}-${pad(s.day)} ${pad(s.hour)}:${pad(s.minute)}`,
      crossedDay: !!t.crossedDay
    }
  },

  // 查看解读
  goToAnalysis() {
    wx.navigateTo({
      url: '/pages/analysis/analysis'
    })
  },

  // 重新排盘
  rePaipan() {
    wx.navigateBack()
  },

  // 分享
  onShareAppMessage() {
    const result = this.data.result
    return {
      title: `我的八字：${result.yearPillar.gan}${result.yearPillar.zhi}年 ${result.monthPillar.gan}${result.monthPillar.zhi}月 ${result.dayPillar.gan}${result.dayPillar.zhi}日 ${result.hourPillar.gan}${result.hourPillar.zhi}时`,
      path: '/pages/index/index'
      // imageUrl 暂不指定：assets/images/share.svg 是设计稿，微信分享图只认
      // png/jpg。补出 1200x630 的 share.png 后在此填 '/assets/images/share.png'，
      // 未指定时微信自动截取页面上部，不会出现加载不到的空白图。
    }
  }
})
