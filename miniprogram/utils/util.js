// utils/util.js - 通用工具函数

/**
 * 格式化日期
 * @param {Date} date - 日期对象
 * @param {string} format - 格式字符串
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second)
}

/**
 * 格式化时间
 * @param {number} hour - 小时
 * @param {number} minute - 分钟
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 获取时辰名称
 * @param {number} hour - 小时 (0-23)
 * @returns {string} 时辰名称
 */
function getShiChenName(hour) {
  const shiChenMap = {
    0: '子时', 1: '子时',
    2: '丑时', 3: '丑时',
    4: '寅时', 5: '寅时',
    6: '卯时', 7: '卯时',
    8: '辰时', 9: '辰时',
    10: '巳时', 11: '巳时',
    12: '午时', 13: '午时',
    14: '未时', 15: '未时',
    16: '申时', 17: '申时',
    18: '酉时', 19: '酉时',
    20: '戌时', 21: '戌时',
    22: '亥时', 23: '亥时'
  }
  return shiChenMap[hour] || '未知'
}

/**
 * 防抖函数
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(fn, delay = 500) {
  let timer = null
  return function(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {Function} fn - 要节流的函数
 * @param {number} interval - 间隔时间（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(fn, interval = 500) {
  let last = 0
  return function(...args) {
    const now = Date.now()
    if (now - last >= interval) {
      last = now
      fn.apply(this, args)
    }
  }
}

/**
 * 深拷贝
 * @param {any} obj - 要拷贝的对象
 * @returns {any} 拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj)
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item))
  }

  if (obj instanceof Object) {
    const copy = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        copy[key] = deepClone(obj[key])
      }
    }
    return copy
  }

  return obj
}

/**
 * 显示成功提示
 * @param {string} title - 提示文字
 */
function showSuccess(title) {
  wx.showToast({
    title: title,
    icon: 'success',
    duration: 2000
  })
}

/**
 * 显示错误提示
 * @param {string} title - 提示文字
 */
function showError(title) {
  wx.showToast({
    title: title,
    icon: 'error',
    duration: 2000
  })
}

/**
 * 显示普通提示
 * @param {string} title - 提示文字
 */
function showInfo(title) {
  wx.showToast({
    title: title,
    icon: 'none',
    duration: 2000
  })
}

/**
 * 显示确认对话框
 * @param {string} title - 标题
 * @param {string} content - 内容
 * @returns {Promise} 用户选择结果
 */
function showConfirm(title, content) {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: title,
      content: content,
      success: (res) => {
        if (res.confirm) {
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail: (err) => {
        reject(err)
      }
    })
  })
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

/**
 * 保存排盘记录到本地
 * @param {object} record - 排盘记录
 */
function saveBaziRecord(record) {
  try {
    let history = wx.getStorageSync('bazi_history') || []

    // 添加新记录
    record.id = generateId()
    record.createTime = new Date().getTime()
    history.unshift(record)

    // 最多保存20条记录
    if (history.length > 20) {
      history = history.slice(0, 20)
    }

    wx.setStorageSync('bazi_history', history)
    return true
  } catch (err) {
    console.error('保存排盘记录失败:', err)
    return false
  }
}

/**
 * 获取排盘历史记录
 * @returns {array} 排盘历史记录
 */
function getBaziHistory() {
  try {
    return wx.getStorageSync('bazi_history') || []
  } catch (err) {
    console.error('获取排盘历史失败:', err)
    return []
  }
}

/**
 * 清除排盘历史记录
 */
function clearBaziHistory() {
  try {
    wx.removeStorageSync('bazi_history')
    return true
  } catch (err) {
    console.error('清除排盘历史失败:', err)
    return false
  }
}

module.exports = {
  formatDate,
  formatTime,
  getShiChenName,
  debounce,
  throttle,
  deepClone,
  showSuccess,
  showError,
  showInfo,
  showConfirm,
  generateId,
  saveBaziRecord,
  getBaziHistory,
  clearBaziHistory
}
