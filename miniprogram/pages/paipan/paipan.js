// pages/paipan/paipan.js
const bazi = require('../../utils/bazi')
const { saveBaziRecord } = require('../../utils/util')

Page({
  data: {
    // 表单数据
    birthDate: '',
    birthTime: '',
    gender: 'male',

    // 日期选择器
    minDate: new Date(1900, 0, 1).getTime(),
    maxDate: new Date(2100, 11, 31).getTime(),
    currentDate: new Date().getTime(),

    // 时间选择器
    currentHour: 12,
    currentMinute: 0,

    // 性别选项
    genderOptions: [
      { label: '男', value: 'male' },
      { label: '女', value: 'female' }
    ],

    // 加载状态
    isLoading: false
  },

  onLoad() {
    // 设置默认日期为今天
    const today = new Date()
    this.setData({
      birthDate: this.formatDate(today),
      currentDate: today.getTime()
    })
  },

  // 格式化日期
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 日期选择
  onDateChange(e) {
    const timestamp = e.detail
    const date = new Date(timestamp)
    const formattedDate = this.formatDate(date)

    this.setData({
      currentDate: timestamp,
      birthDate: formattedDate
    })
  },

  // 时间选择
  onTimeChange(e) {
    const time = e.detail.value
    this.setData({
      birthTime: time,
      currentHour: parseInt(time.split(':')[0]),
      currentMinute: parseInt(time.split(':')[1])
    })
  },

  // 性别选择
  onGenderChange(e) {
    this.setData({
      gender: e.detail.value
    })
  },

  // 表单验证
  validateForm() {
    if (!this.data.birthDate) {
      wx.showToast({
        title: '请选择出生日期',
        icon: 'none'
      })
      return false
    }

    if (!this.data.birthTime) {
      wx.showToast({
        title: '请选择出生时间',
        icon: 'none'
      })
      return false
    }

    return true
  },

  // 开始排盘
  startPaipan() {
    if (!this.validateForm()) {
      return
    }

    this.setData({ isLoading: true })

    try {
      // 解析日期
      const [year, month, day] = this.data.birthDate.split('-').map(Number)
      const hour = this.data.currentHour

      // 执行排盘
      const result = bazi.paipan({
        year: year,
        month: month,
        day: day,
        hour: hour,
        gender: this.data.gender
      })

      // 添加额外信息
      result.birthDate = this.data.birthDate
      result.birthTime = this.data.birthTime
      result.gender = this.data.gender

      // 保存到本地
      saveBaziRecord(result)

      // 保存到全局数据
      const app = getApp()
      app.currentBaziResult = result

      // 跳转到结果页
      wx.navigateTo({
        url: '/pages/result/result'
      })
    } catch (err) {
      console.error('排盘失败:', err)
      wx.showToast({
        title: '排盘失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ isLoading: false })
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
