// pages/profile/profile.js
const { getBaziHistory, clearBaziHistory, showConfirm, showSuccess } = require('../../utils/util')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    historyList: []
  },

  onLoad() {
    this.loadUserInfo()
    this.loadHistory()
  },

  onShow() {
    this.loadUserInfo()
    this.loadHistory()
  },

  // 加载用户信息
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    this.setData({
      userInfo: userInfo,
      hasUserInfo: !!userInfo
    })
  },

  // 加载历史记录
  loadHistory() {
    const history = getBaziHistory()
    this.setData({
      historyList: history
    })
  },

  // 查看历史记录
  viewHistory(e) {
    const index = e.currentTarget.dataset.index
    const record = this.data.historyList[index]

    // 保存到全局数据
    const app = getApp()
    app.currentBaziResult = record

    // 跳转到结果页
    wx.navigateTo({
      url: '/pages/result/result'
    })
  },

  // 清除历史
  async clearHistory() {
    const confirmed = await showConfirm('确认清除', '确定要清除所有排盘历史吗？')
    if (confirmed) {
      clearBaziHistory()
      this.loadHistory()
      showSuccess('清除成功')
    }
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '智能八字排盘 - 专业的命理分析工具',
      path: '/pages/index/index',
      imageUrl: '/assets/images/share.png'
    }
  }
})
