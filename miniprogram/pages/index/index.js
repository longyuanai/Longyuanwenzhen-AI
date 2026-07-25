// pages/index/index.js
const { post } = require('../../utils/request')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    canIUseGetUserProfile: false,
    isLoading: false
  },

  onLoad() {
    // 检查是否支持getUserProfile
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      })
    }

    // 检查登录状态
    this.checkLoginStatus()
  },

  onShow() {
    this.checkLoginStatus()
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true
      })
    }
  },

  // 获取用户信息
  getUserProfile() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        console.log('获取用户信息成功:', res.userInfo)
        this.login(res.userInfo)
      },
      fail: (err) => {
        console.log('获取用户信息失败:', err)
        wx.showToast({
          title: '授权失败',
          icon: 'none'
        })
      }
    })
  },

  // 登录
  async login(userInfo) {
    this.setData({ isLoading: true })

    try {
      // 获取登录凭证
      const { code } = await wx.login()

      // 发送到后端验证
      const result = await post('/user/wx-login', {
        code: code,
        userInfo: {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl
        }
      })

      // 保存登录信息
      wx.setStorageSync('token', result.token)
      wx.setStorageSync('userInfo', result.userInfo)

      // 更新全局数据
      const app = getApp()
      app.setUserInfo(result.userInfo)
      app.setToken(result.token)

      this.setData({
        userInfo: result.userInfo,
        hasUserInfo: true,
        isLoading: false
      })

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })
    } catch (err) {
      console.error('登录失败:', err)
      this.setData({ isLoading: false })

      // 即使登录失败，也允许使用基础功能
      this.setData({
        userInfo: userInfo,
        hasUserInfo: true
      })
    }
  },

  // 跳转到排盘页面
  goToPaipan() {
    wx.navigateTo({
      url: '/pages/paipan/paipan'
    })
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '智能八字排盘 - 专业的命理分析工具',
      path: '/pages/index/index'
      // imageUrl 暂不指定：assets/images/share.svg 是设计稿，微信分享图只认
      // png/jpg。补出 1200x630 的 share.png 后在此填 '/assets/images/share.png'，
      // 未指定时微信自动截取页面上部，不会出现加载不到的空白图。
    }
  }
})
