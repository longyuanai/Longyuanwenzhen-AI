// pages/analysis/analysis.js - 命理解读页面
const { request } = require('../../utils/request')

Page({
  data: {
    result: null,
    analysisContent: '',
    isLoading: true,
    activeTab: 'basic', // basic | deep
    isPaid: false,
    deepContent: '',
    showPayModal: false
  },

  onLoad(options) {
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

    this.setData({ result: result })

    // 自动请求基础解读
    this.loadBasicAnalysis()
  },

  // 加载基础解读
  async loadBasicAnalysis() {
    this.setData({ isLoading: true, activeTab: 'basic' })

    try {
      const result = this.data.result

      // 构建八字字符串
      const baziStr = `${result.yearPillar.gan}${result.yearPillar.zhi}年 ${result.monthPillar.gan}${result.monthPillar.zhi}月 ${result.dayPillar.gan}${result.dayPillar.zhi}日 ${result.hourPillar.gan}${result.hourPillar.zhi}时`

      // 请求后端API
      const res = await request({
        url: '/api/v1/analysis/basic',
        method: 'POST',
        data: {
          baziId: result.baziId || `local_${Date.now()}`,
          bazi: baziStr,
          dayGan: result.dayPillar.gan,
          wuxing: result.wuxing
        }
      })

      this.setData({
        analysisContent: res.content,
        isLoading: false
      })
    } catch (err) {
      console.error('加载解读失败:', err)
      // 使用本地解读作为降级方案
      this.generateLocalAnalysis()
    }
  },

  // 本地生成基础解读（降级方案）
  generateLocalAnalysis() {
    const result = this.data.result
    const dayGan = result.dayPillar.gan
    const dayZhi = result.dayPillar.zhi

    // 简单的本地解读逻辑
    const wuxing = result.wuxing.dayGan
    const wuxingMap = {
      '木': '仁慈、正直、有上进心',
      '火': '热情、开朗、有领导力',
      '土': '稳重、踏实、有责任心',
      '金': '果断、坚毅、有正义感',
      '水': '智慧、灵活、有洞察力'
    }

    const content = `## 命局分析

### 日主特征
您的日主为**${dayGan}${dayZhi}**，五行属**${wuxing}**。

${wuxingMap[wuxing] || '性格特点需综合命局分析'}

### 十神配置
- 年柱：${result.tenGods.yearGan}（天干）、${result.tenGods.yearZhi}（地支）
- 月柱：${result.tenGods.monthGan}（天干）、${result.tenGods.monthZhi}（地支）
- 时柱：${result.tenGods.hourGan}（天干）、${result.tenGods.hourZhi}（地支）

### 大运走势
${result.daYun.isForward ? '大运顺行' : '大运逆行'}，起运年龄约${result.daYun.startAge}岁。

当前大运：${result.daYun.daYunList[0].gan}${result.daYun.daYunList[0].zhi}（${result.daYun.daYunList[0].ageRange}）

---
*此为基础解读，如需详细分析请查看深度报告*`

    this.setData({
      analysisContent: content,
      isLoading: false
    })
  },

  // 切换到深度报告
  async switchToDeep() {
    if (this.data.activeTab === 'deep') return

    // 检查是否已付费
    if (!this.data.isPaid) {
      this.setData({ showPayModal: true })
      return
    }

    this.setData({ activeTab: 'deep', isLoading: true })

    try {
      const result = this.data.result

      // 构建八字字符串
      const baziStr = `${result.yearPillar.gan}${result.yearPillar.zhi}年 ${result.monthPillar.gan}${result.monthPillar.zhi}月 ${result.dayPillar.gan}${result.dayPillar.zhi}日 ${result.hourPillar.gan}${result.hourPillar.zhi}时`

      // 请求深度报告
      const res = await request({
        url: '/api/v1/analysis/deep',
        method: 'POST',
        data: {
          baziId: result.baziId || `local_${Date.now()}`,
          bazi: baziStr,
          dayGan: result.dayPillar.gan,
          wuxing: result.wuxing,
          dayun: result.daYun
        }
      })

      this.setData({
        deepContent: res.content,
        isLoading: false
      })
    } catch (err) {
      console.error('加载深度报告失败:', err)
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
      this.setData({ isLoading: false, activeTab: 'basic' })
    }
  },

  // 关闭付费弹窗
  closePayModal() {
    this.setData({ showPayModal: false })
  },

  // 发起支付
  async doPayment() {
    this.setData({ showPayModal: false })

    try {
      // 创建订单
      const orderRes = await request({
        url: '/api/v1/order/create',
        method: 'POST',
        data: {
          productType: 'deep_report',
          amount: 99.00
        }
      })

      // 获取支付参数
      const payRes = await request({
        url: `/api/v1/order/${orderRes.orderId}/pay`,
        method: 'POST'
      })

      // 调起微信支付
      await wx.requestPayment({
        timeStamp: payRes.timeStamp,
        nonceStr: payRes.nonceStr,
        package: payRes.package,
        signType: payRes.signType,
        paySign: payRes.paySign
      })

      // 支付成功
      wx.showToast({
        title: '支付成功',
        icon: 'success'
      })

      this.setData({ isPaid: true })

      // 确认支付
      await request({
        url: `/api/v1/order/${orderRes.orderId}/confirm`,
        method: 'POST'
      })

      // 加载深度报告
      this.switchToDeep()
    } catch (err) {
      console.error('支付失败:', err)
      if (err.errMsg !== 'requestPayment:fail cancel') {
        wx.showToast({
          title: '支付失败，请重试',
          icon: 'none'
        })
      }
    }
  },

  // 返回排盘结果
  goBack() {
    wx.navigateBack()
  },

  // 分享
  onShareAppMessage() {
    const result = this.data.result
    return {
      title: `八字命理解读 - ${result.dayPillar.gan}${result.dayPillar.zhi}日主`,
      path: '/pages/index/index',
      imageUrl: '/assets/images/share.png'
    }
  }
})
