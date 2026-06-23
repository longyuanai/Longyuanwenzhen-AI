// pages/result/result.js
const bazi = require('../../utils/bazi')

Page({
  data: {
    result: null,
    pillars: []
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
      pillars: pillars
    })
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
      path: '/pages/index/index',
      imageUrl: '/assets/images/share.png'
    }
  }
})
