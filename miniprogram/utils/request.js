// utils/request.js - 网络请求封装
//
// ⚠️ url 传参约定：BASE_URL 已经包含 /api/v1，各页面只写 '/analysis/basic'
// 这样的业务路径。曾有页面写成 '/api/v1/analysis/basic'，拼出
// /api/v1/api/v1/analysis/basic 全部 404，且被上层 catch 静默降级掩盖了很久。
// normalizePath() 会剥掉重复前缀并告警，属兜底，不是让你继续写全路径的许可。
//
// 地址与超时改在 miniprogram/config.js，不要在这里写死。

const appConfig = require('../config')

const API_PREFIX = appConfig.API_PREFIX
const BASE_URL = appConfig.API_BASE

// 剥掉误带的 /api/v1 前缀，避免与 BASE_URL 拼成双前缀
function normalizePath(url) {
  let path = url || ''
  if (path.indexOf(API_PREFIX + '/') === 0) {
    path = path.slice(API_PREFIX.length)
    console.warn(
      `[request] url 不要带 ${API_PREFIX} 前缀（BASE_URL 已包含），已自动修正: ${url} -> ${path}`
    )
  }
  return path
}

/**
 * 网络请求封装
 * @param {object} options - 请求配置
 * @returns {Promise} 请求Promise
 */
function request(options) {
  return new Promise((resolve, reject) => {
    // 获取token
    const token = wx.getStorageSync('token')

    // 显示加载提示
    if (options.showLoading !== false) {
      wx.showLoading({
        title: options.loadingText || '加载中...',
        mask: true
      })
    }

    wx.request({
      url: BASE_URL + normalizePath(options.url),
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header
      },
      timeout: options.timeout || appConfig.REQUEST_TIMEOUT,
      success: (res) => {
        // 隐藏加载提示
        if (options.showLoading !== false) {
          wx.hideLoading()
        }

        console.log('请求成功:', options.url, res.data)

        if (res.statusCode === 200) {
          if (res.data.code === 200) {
            // 请求成功
            resolve(res.data.data)
          } else if (res.data.code === 401) {
            // token失效，需要重新登录
            console.log('token失效，需要重新登录')
            wx.removeStorageSync('token')
            wx.removeStorageSync('userInfo')

            // 跳转到首页重新登录
            wx.switchTab({
              url: '/pages/index/index'
            })

            reject(res.data)
          } else {
            // 业务错误
            wx.showToast({
              title: res.data.message || '请求失败',
              icon: 'none',
              duration: 2000
            })
            reject(res.data)
          }
        } else {
          // HTTP错误
          wx.showToast({
            title: `网络错误: ${res.statusCode}`,
            icon: 'none',
            duration: 2000
          })
          reject(res)
        }
      },
      fail: (err) => {
        // 隐藏加载提示
        if (options.showLoading !== false) {
          wx.hideLoading()
        }

        console.error('请求失败:', options.url, err)

        wx.showToast({
          title: '网络连接失败',
          icon: 'none',
          duration: 2000
        })

        reject(err)
      }
    })
  })
}

/**
 * GET请求
 */
function get(url, data, options = {}) {
  return request({
    url,
    method: 'GET',
    data,
    ...options
  })
}

/**
 * POST请求
 */
function post(url, data, options = {}) {
  return request({
    url,
    method: 'POST',
    data,
    ...options
  })
}

/**
 * PUT请求
 */
function put(url, data, options = {}) {
  return request({
    url,
    method: 'PUT',
    data,
    ...options
  })
}

/**
 * DELETE请求
 */
function del(url, data, options = {}) {
  return request({
    url,
    method: 'DELETE',
    data,
    ...options
  })
}

module.exports = {
  request,
  get,
  post,
  put,
  del,
  BASE_URL
}
