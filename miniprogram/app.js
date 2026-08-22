// app.js
const appConfig = require('./config')

App({
  globalData: {
    userInfo: null,
    token: null,
    openid: null
  },

  onLaunch() {
    // 配置自检：API 地址、客服微信号这类值漏改不会让任何测试变红，
    // 只会在熟人真机上表现为"打不通接口"或"加不到客服"。启动时喊一嗓子。
    this.checkConfig()
    // 检查登录状态
    this.checkLoginStatus()
  },

  // 只告警不阻断：本机开发时这些值本来就是占位的，拦住反而碍事
  checkConfig() {
    const issues = appConfig.checkConfig()
    if (!issues.length) return
    console.warn(
      '[配置自检] 发现 ' + issues.length + ' 项待处理（本机开发可忽略，真机/上线前必须解决）：'
    )
    issues.forEach((msg, i) => console.warn(`  ${i + 1}. ${msg}`))
    console.warn('  → 全部改在 miniprogram/config.js，文件末尾有上线检查清单')
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')

    if (token && userInfo) {
      this.globalData.token = token
      this.globalData.userInfo = userInfo
      console.log('用户已登录:', userInfo)
    } else {
      console.log('用户未登录')
    }
  },

  // 设置用户信息
  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
  },

  // 设置token
  setToken(token) {
    this.globalData.token = token
    wx.setStorageSync('token', token)
  },

  // 清除登录信息
  clearLoginInfo() {
    this.globalData.userInfo = null
    this.globalData.token = null
    this.globalData.openid = null
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('token')
  }
})
