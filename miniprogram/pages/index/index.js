// pages/index/index.js
const { post } = require('../../utils/request')

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    isLoading: false,
    // 头像昵称填写：登录成功后才展示，且是可选项
    showProfileFill: false,
    draftAvatar: '',
    draftNick: ''
  },

  onLoad() {
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

  // ── 头像昵称填写能力 ────────────────────────────────────────────
  // 不再用 wx.getUserProfile：微信自 2022-10-25 起对该接口只返回匿名数据
  // （灰色头像 + "微信用户"），拿不到真实头像昵称。官方替代方案是
  // <button open-type="chooseAvatar"> + <input type="nickname">，
  // 由用户主动填写，无需 scope 授权弹窗。
  //
  // 登录本身只依赖 wx.login 换 code，与头像昵称完全解耦 ——
  // 用户不填也能正常用全部功能，不该把可选项挡在登录前面。

  onChooseAvatar(e) {
    this.setData({ draftAvatar: e.detail.avatarUrl })
  },

  onNickInput(e) {
    this.setData({ draftNick: e.detail.value || '' })
  },

  // 保存头像昵称到本地与全局。
  // 注意 chooseAvatar 给的是临时文件路径，重启后失效；要长期保留需上传到
  // 自己的存储再存 URL —— 内测阶段不值得为此加一套上传链路，先只存本地。
  saveProfile() {
    const nick = (this.data.draftNick || '').trim()
    const avatar = this.data.draftAvatar
    if (!nick && !avatar) {
      wx.showToast({ title: '填写头像或昵称后再保存', icon: 'none' })
      return
    }

    const app = getApp()
    const merged = Object.assign({}, this.data.userInfo || {}, {
      nickName: nick || (this.data.userInfo && this.data.userInfo.nickName) || '用户',
      avatarUrl: avatar || (this.data.userInfo && this.data.userInfo.avatarUrl) || ''
    })
    app.setUserInfo(merged)
    this.setData({ userInfo: merged, hasUserInfo: true, showProfileFill: false })
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  // 登录：只依赖 wx.login 换 code，不需要用户授权弹窗。
  // userInfo 是可选的（老调用方可能仍传），没有就让后端用默认昵称建号。
  async login(userInfo) {
    this.setData({ isLoading: true })

    try {
      // 获取登录凭证
      const { code } = await wx.login()

      // 发送到后端验证
      const result = await post('/user/wx-login', {
        code: code,
        userInfo: userInfo ? {
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl
        } : undefined
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
        isLoading: false,
        // 登录成功后再邀请补充头像昵称——纯可选，不填也能用全部功能
        showProfileFill: !result.userInfo || !result.userInfo.avatarUrl
      })

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })
    } catch (err) {
      console.error('登录失败:', err)
      this.setData({ isLoading: false })
      wx.showToast({ title: '登录失败，请重试', icon: 'none' })
      // 登录失败不再伪造已登录态：那会让用户以为记录已上云，
      // 实际没有 token，历史同步等接口全部 401。
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
