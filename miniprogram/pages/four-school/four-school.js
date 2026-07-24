// pages/four-school/four-school.js - 四家并列解读页
//
// 零成本试水版(2026-07-24)：
//   - 调后端 /api/v1/analysis/four-school 拿四家内容 + AI 综合
//   - 付费入口:显示客服微信号,用户加微信后手动开权限
//   - 不接 wx.requestPayment（避免上架审核,体验版/调试版够用）
//
// 设计动机:四家解读是产品差异化护城河(徐乐吾/梁湘润/袁树珊/韦千里
// 四派并列),先把内容做出来,付费闭环后续等日均单量再优化。
const { request } = require('../../utils/request')

// 客服微信号(占位,正式上线前替换)
const CONTACT_WECHAT = 'bazi-help-2026'

Page({
  data: {
    isLoading: true,
    content: '',
    schools: [],
    sources: null,        // { xu, liang, yuan, wei, total }
    baziInfo: null,       // 命盘四柱字符串
    errorMsg: '',
    showContact: false,   // 是否显示客服付费弹窗
    contactWechat: CONTACT_WECHAT
  },

  onLoad() {
    const app = getApp()
    const result = app && app.currentBaziResult
    if (!result) {
      this.setData({ isLoading: false, errorMsg: '未找到排盘结果,请先排盘' })
      return
    }

    // 小程序 bazi.js 的 result 结构：{ yearPillar, ..., input: { year, month, day, hour, gender } }
    // 后端 /api/v1/analysis/four-school 收 birth: { year, month, day, hour, minute?, gender }
    const input = result.input || {}
    const birth = {
      year: input.year,
      month: input.month,
      day: input.day,
      hour: input.hour,
      minute: 0,
      gender: input.gender || 'male'
    }

    const baziInfo = [
      result.yearPillar.gan + result.yearPillar.zhi,
      result.monthPillar.gan + result.monthPillar.zhi,
      result.dayPillar.gan + result.dayPillar.zhi,
      result.hourPillar.gan + result.hourPillar.zhi
    ].join(' ')

    this.setData({ baziInfo })
    // 记住 birth,retry 时用
    this._birth = birth

    this.loadFourSchool(birth)
  },

  async loadFourSchool(birth) {
    try {
      const res = await request({
        url: '/api/v1/analysis/four-school',
        method: 'POST',
        data: { baziId: `local_${Date.now()}`, birth }
      })
      this.setData({
        isLoading: false,
        content: res.content,
        schools: res.schools,
        sources: res.sources,
        errorMsg: ''
      })
    } catch (err) {
      console.error('四家解读加载失败:', err)
      this.setData({
        isLoading: false,
        errorMsg: (err && err.message) || '加载失败,请重试'
      })
    }
  },

  // 显示付费联系弹窗(零成本路径:复制微信号 → 引导加微信)
  showContactModal() {
    this.setData({ showContact: true })
  },

  closeContactModal() {
    this.setData({ showContact: false })
  },

  copyWechat() {
    wx.setClipboardData({
      data: this.data.contactWechat,
      success: () => {
        wx.showToast({ title: '微信号已复制', icon: 'success' })
      }
    })
  },

  retry() {
    this.setData({ isLoading: true, errorMsg: '' })
    if (this._birth) {
      this.loadFourSchool(this._birth)
    }
  },

  // 分享:这是产品拉新最关键的入口,标题要够吸引
  onShareAppMessage() {
    const info = this.data.baziInfo || ''
    return {
      title: `四家命理大师并列解读我的盘${info ? ' · ' + info : ''}`,
      path: '/pages/index/index',
      imageUrl: '/assets/images/share.png'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '徐乐吾/梁湘润/袁树珊/韦千里 4 派同时解我的命盘',
      query: ''
    }
  }
})