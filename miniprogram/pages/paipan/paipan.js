// pages/paipan/paipan.js
const bazi = require('../../utils/bazi')
const { CITY_LONGITUDE } = require('../../utils/trueSolarTime')
const { request } = require('../../utils/request')
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

    // 出生地（可选）。不选则不做真太阳时校正 —— 默认关闭，
    // 与后端一致：历史记录里没有出生地，静默启用会改掉用户看过的盘。
    cityOptions: [],       // 第 0 项是「不指定」
    cityIndex: 0,
    birthPlace: '',

    // 加载状态
    isLoading: false
  },

  onLoad() {
    // 设置默认日期为今天
    const today = new Date()
    this.setData({
      birthDate: this.formatDate(today),
      currentDate: today.getTime(),
      cityOptions: this.buildCityOptions()
    })
  },

  // 城市列表取自 utils/trueSolarTime.js（后端生成物），
  // 不在页面里另存一份，免得与算法侧的表对不上。
  buildCityOptions() {
    const names = Object.keys(CITY_LONGITUDE).sort((a, b) => a.localeCompare(b, 'zh'))
    return ['不指定（按北京时间）'].concat(names)
  },

  onCityChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      cityIndex: index,
      // 第 0 项是「不指定」，对应空出生地 = 不校正
      birthPlace: index > 0 ? this.data.cityOptions[index] : ''
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
  //
  // 排盘权威在后端：/bazi/paipan 基于 lunar-javascript，节气分月、立春分年、
  // 晚子时、起运年龄与顺逆全部按真实节气推算。本地 utils/bazi.js 是简化实现
  // （起运年龄写死 1 岁，大运年龄区间会整体偏移若干年），只在后端不可达时兜底，
  // 并在结果里打 isLocalFallback 标记，让结果页能提示用户。
  //
  // 这一点很重要：解读接口同样由后端重新排盘，若展示用本地盘、解读用服务端盘，
  // 用户会看到「盘是这个、解读讲的是另一个」。
  async startPaipan() {
    if (!this.validateForm()) {
      return
    }

    this.setData({ isLoading: true })

    try {
      const result = await this.requestPaipan()

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
        title: (err && err.message) || '排盘失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ isLoading: false })
    }
  },

  // 优先服务端排盘，网络不可达时降级本地算法
  async requestPaipan() {
    try {
      const res = await request({
        url: '/bazi/paipan',
        method: 'POST',
        loadingText: '排盘中...',
        data: {
          birthDate: this.data.birthDate,
          birthTime: this.data.birthTime,
          gender: this.data.gender,
          // 空串表示不指定；后端对空值按「不校正」处理
          birthPlace: this.data.birthPlace || undefined
        }
      })
      return res
    } catch (err) {
      // 后端明确判定输入不合法（如超出 1900-2100）时不该兜底：
      // 本地算法只会算出一个同样无效的盘，反而掩盖问题，直接把错误抛给用户。
      if (err && err.code === 400) {
        throw new Error(err.message || '出生信息不在支持范围内')
      }

      console.warn('服务端排盘不可用，降级本地算法:', err)
      const [year, month, day] = this.data.birthDate.split('-').map(Number)
      const result = bazi.paipan({
        year: year,
        month: month,
        day: day,
        hour: this.data.currentHour,
        // 分钟要带上：立春交年的交接精确到分钟，起运年龄也按分钟推。
        // 写死 0 会让兜底盘与服务端盘在边界样本上不一致。
        minute: this.data.currentMinute || 0,
        gender: this.data.gender,
        birthPlace: this.data.birthPlace || undefined
      })
      result.isLocalFallback = true
      return result
    }
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
