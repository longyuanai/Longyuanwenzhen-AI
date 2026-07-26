// pages/profile/profile.js
//
// 排盘历史有两个来源，这里合并展示：
//   - 服务端 /bazi/history：登录用户的记录，跨设备可见（权威）
//   - 本地 storage：匿名时排的盘、以及离线兜底的盘，只在本机可见
// 同一个盘（出生信息相同）两边都有时以服务端为准，避免列表里出现重复项。
//
// 服务端记录只存出生信息，不存完整命盘 —— 点开时拿 birth 重新排一次即可
// （排盘是纯函数，服务端重算保证与解读依据的盘一致）。

// 内测期反馈收口：走客服微信，不做站内工单系统（熟人 50 人量级用不上）。
// 与 pages/four-school/four-school.js 的 CONTACT_WECHAT 保持一致，正式上线前替换。
const CONTACT_WECHAT = 'bazi-help-2026'

const { getBaziHistory, clearBaziHistory, showConfirm, showSuccess } = require('../../utils/util')
const { request } = require('../../utils/request')
const { buildBirthPayload } = require('../../utils/bazi')

function pad(n) {
  return String(n).padStart(2, '0')
}

// 出生信息指纹，用于两个来源去重
function birthKey(b) {
  return `${b.year}-${b.month}-${b.day}-${b.hour}-${b.minute || 0}-${b.gender}`
}

function pillarsOf(result) {
  if (!result || !result.yearPillar) return ''
  return ['year', 'month', 'day', 'hour']
    .map((k) => result[k + 'Pillar'].gan + result[k + 'Pillar'].zhi)
    .join(' ')
}

// 本地完整命盘 → 列表项（带 result，点开无需重算）
function fromLocal(record) {
  const birth = buildBirthPayload(record)
  if (!birth) return null
  return {
    key: birthKey(birth),
    birth: birth,
    birthDate: record.birthDate || `${birth.year}-${pad(birth.month)}-${pad(birth.day)}`,
    birthTime: record.birthTime || `${pad(birth.hour)}:${pad(birth.minute)}`,
    gender: birth.gender,
    baziStr: pillarsOf(record),
    label: '',        // 备注名只在云端记录上有，本机记录同步后才能起名
    id: null,
    fromServer: false,
    result: record
  }
}

// 服务端记录 → 列表项（只有出生信息，点开时再排盘）
function fromServer(rec) {
  const b = rec.birth || {}
  return {
    key: birthKey(b),
    birth: b,
    birthDate: `${b.year}-${pad(b.month)}-${pad(b.day)}`,
    birthTime: `${pad(b.hour)}:${pad(b.minute || 0)}`,
    gender: b.gender,
    baziStr: rec.baziStr || '',
    label: rec.label || '',
    id: rec.id,       // 改备注名要用
    fromServer: true,
    result: null
  }
}

Page({
  data: {
    userInfo: null,
    hasUserInfo: false,
    historyList: [],
    isSyncing: false
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

  // 加载历史记录：先渲染本地（立即可见），再上传本机记录、拉服务端合并
  async loadHistory() {
    const local = getBaziHistory().map(fromLocal).filter(Boolean)
    this.setData({ historyList: local })

    if (!wx.getStorageSync('token')) return // 未登录，只有本地记录

    this.setData({ isSyncing: true })
    try {
      // 先把本机记录推上去（匿名时排的盘登录后才有归属），再拉全量。
      // 顺序不能反：先拉后推的话，这一轮列表里本机记录还是「本机」标签。
      await this.uploadLocalRecords(local)

      const remote = await request({
        url: '/bazi/history',
        method: 'GET',
        showLoading: false
      })
      const serverItems = (remote || []).map(fromServer)

      // 服务端优先：同一个盘只保留服务端那条
      const seen = {}
      const merged = []
      serverItems.forEach((item) => {
        if (seen[item.key]) return
        seen[item.key] = true
        merged.push(item)
      })
      local.forEach((item) => {
        if (seen[item.key]) return
        seen[item.key] = true
        merged.push(item)
      })

      this.setData({ historyList: merged })
    } catch (err) {
      // 拉取失败不影响本地记录展示
      console.warn('同步服务端排盘历史失败:', err)
    } finally {
      this.setData({ isSyncing: false })
    }
  },

  // 把本机记录同步到云端。失败不影响后续拉取（本地记录仍在，下次进页面重试）。
  async uploadLocalRecords(local) {
    if (!local.length) return
    try {
      await request({
        url: '/bazi/history/sync',
        method: 'POST',
        showLoading: false,
        data: {
          items: local.map((item) => ({
            birth: item.birth,
            baziStr: item.baziStr,
            label: item.label
          }))
        }
      })
    } catch (err) {
      console.warn('同步本机排盘记录失败:', err)
    }
  },

  // 给记录起备注名（区分「我自己」/「老王」）。仅云端记录支持，本机记录先同步再改。
  async renameRecord(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.historyList[index]
    if (!item) return

    if (!item.fromServer) {
      wx.showToast({ title: '登录后可为记录起名', icon: 'none' })
      return
    }

    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '备注名',
        editable: true,
        placeholderText: '如：我自己、老王',
        content: item.label || '',
        success: resolve,
        fail: () => resolve({ confirm: false })
      })
    })
    if (!res.confirm) return

    try {
      await request({
        url: `/bazi/history/${item.id}`,
        method: 'PUT',
        showLoading: false,
        data: { label: res.content || '' }
      })
      this.loadHistory()
    } catch (err) {
      console.error('修改备注失败:', err)
      wx.showToast({ title: '修改失败，请重试', icon: 'none' })
    }
  },

  // 查看历史记录
  async viewHistory(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.historyList[index]
    if (!item) return

    const app = getApp()

    // 本地记录带完整命盘，直接用
    if (item.result) {
      app.currentBaziResult = item.result
      wx.navigateTo({ url: '/pages/result/result' })
      return
    }

    // 服务端记录只有出生信息，重新排一次盘
    try {
      const b = item.birth
      const result = await request({
        url: '/bazi/paipan',
        method: 'POST',
        loadingText: '加载中...',
        data: {
          birthDate: `${b.year}-${pad(b.month)}-${pad(b.day)}`,
          birthTime: `${pad(b.hour)}:${pad(b.minute || 0)}`,
          gender: b.gender
        }
      })
      result.birthDate = item.birthDate
      result.birthTime = item.birthTime
      result.gender = item.gender

      app.currentBaziResult = result
      wx.navigateTo({ url: '/pages/result/result' })
    } catch (err) {
      console.error('加载历史命盘失败:', err)
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
    }
  },

  // 清除历史：本地与服务端一起清，只清一边的话下次进页面又回来了
  async clearHistory() {
    const confirmed = await showConfirm('确认清除', '确定要清除所有排盘历史吗？')
    if (!confirmed) return

    clearBaziHistory()

    if (wx.getStorageSync('token')) {
      try {
        await request({ url: '/bazi/history', method: 'DELETE', showLoading: false })
      } catch (err) {
        console.error('清除服务端排盘历史失败:', err)
        this.loadHistory()
        wx.showToast({ title: '云端记录清除失败，请重试', icon: 'none' })
        return
      }
    }

    this.setData({ historyList: [] })
    showSuccess('清除成功')
  },

  // 意见反馈：复制客服微信号，引导加微信反馈
  showFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: `内测期间遇到问题或有建议，请加微信反馈：\n${CONTACT_WECHAT}`,
      confirmText: '复制微信号',
      success: (res) => {
        if (!res.confirm) return
        wx.setClipboardData({
          data: CONTACT_WECHAT,
          success: () => wx.showToast({ title: '微信号已复制', icon: 'success' })
        })
      }
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
