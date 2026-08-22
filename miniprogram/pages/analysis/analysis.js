// pages/analysis/analysis.js - 命理解读页面
//
// 请求约定（易踩坑，两条）：
//   1. request.js 的 BASE_URL 已含 /api/v1，这里的 url 只写 /analysis/xxx，
//      不要再带 /api/v1，否则会打到 /api/v1/api/v1/... 全部 404。
//   2. 解读类接口收的是 birth 出生信息，后端据此自行排盘（服务端权威）；
//      客户端算出的四柱/五行不作为入参，用 buildBirthPayload() 统一构造。
const { request } = require('../../utils/request')
const { buildBirthPayload } = require('../../utils/bazi')

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
      const birth = buildBirthPayload(result)
      if (!birth) {
        // 出生信息不全，后端无法排盘，直接走本地降级
        this.generateLocalAnalysis()
        return
      }

      // 请求后端API
      const res = await request({
        url: '/analysis/basic',
        method: 'POST',
        data: {
          baziId: result.baziId || `local_${Date.now()}`,
          birth: birth
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
      const birth = buildBirthPayload(result)
      if (!birth) {
        wx.showToast({ title: '出生信息不完整，请重新排盘', icon: 'none' })
        this.setData({ isLoading: false, activeTab: 'basic' })
        return
      }

      // 请求深度报告
      const res = await request({
        url: '/analysis/deep',
        method: 'POST',
        data: {
          baziId: result.baziId || `local_${Date.now()}`,
          birth: birth
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
      // 创建订单（金额由服务端价格表决定，客户端不传 amount —— 传了也会被忽略）
      const orderRes = await request({
        url: '/order/create',
        method: 'POST',
        data: {
          productType: 'deep_report'
        }
      })

      // 获取支付参数
      const payRes = await request({
        url: `/order/${orderRes.orderId}/pay`,
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

      // 轮询订单状态。注意 /confirm 是只读查询：客户端无权把订单置为已支付，
      // paid 只能由微信异步回调验签后写入，所以这里等回调落库再解锁。
      const paid = await this.pollOrderPaid(orderRes.orderId)
      if (!paid) {
        wx.showToast({ title: '支付确认中，稍后可在「我的」查看', icon: 'none' })
        return
      }

      wx.showToast({
        title: '支付成功',
        icon: 'success'
      })
      this.setData({ isPaid: true })

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

  // 轮询订单是否已支付（微信回调是异步的，下单成功 ≠ 立即 paid）
  // 最多 attempts 次、每次间隔 intervalMs，任一次拿到 paid 即返回 true
  async pollOrderPaid(orderId, { attempts = 5, intervalMs = 1200 } = {}) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await request({
          url: `/order/${orderId}/confirm`,
          method: 'POST',
          showLoading: i === 0
        })
        if (res && res.status === 'paid') return true
      } catch (err) {
        console.error('查询订单状态失败:', err)
      }
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    }
    return false
  },

  // 跳转到四家并列解读页(产品差异化卖点)
  goFourSchool() {
    wx.navigateTo({
      url: '/pages/four-school/four-school'
    })
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
      path: '/pages/index/index'
      // imageUrl 暂不指定：assets/images/share.svg 是设计稿，微信分享图只认
      // png/jpg。补出 1200x630 的 share.png 后在此填 '/assets/images/share.png'，
      // 未指定时微信自动截取页面上部，不会出现加载不到的空白图。
    }
  }
})
