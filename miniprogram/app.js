// app.js
App({
  globalData: {
    userInfo: null,
    token: null,
    openid: null
  },

  onLaunch() {
    // 检查登录状态
    this.checkLoginStatus()
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
