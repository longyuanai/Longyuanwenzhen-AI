// routes/user.js - 用户路由
const Router = require('koa-router')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const config = require('../config')
const logger = require('../utils/logger')
const { authRequired } = require('../middleware/auth')

const router = new Router()

/**
 * 微信登录
 * POST /api/v1/user/wx-login
 */
router.post('/wx-login', async (ctx) => {
  try {
    const { code, userInfo } = ctx.request.body

    if (!code) {
      ctx.status = 400
      ctx.body = {
        code: 400,
        message: '缺少登录凭证',
        data: null,
        timestamp: Date.now()
      }
      return
    }

    // 调用微信接口获取openid和session_key
    const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: config.weixin.appId,
        secret: config.weixin.appSecret,
        js_code: code,
        grant_type: 'authorization_code'
      }
    })

    const { openid, session_key, unionid } = wxResponse.data

    if (!openid) {
      ctx.status = 400
      ctx.body = {
        code: 400,
        message: '微信登录失败',
        data: null,
        timestamp: Date.now()
      }
      return
    }

    // 查找或创建用户
    const user = await User.findOrCreateByOpenid(openid, {
      nickName: userInfo?.nickName,
      avatarUrl: userInfo?.avatarUrl,
      unionid: unionid
    })

    // 生成JWT令牌
    const token = jwt.sign(
      {
        userId: user._id,
        openid: user.openid
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    )

    logger.info(`用户登录成功: ${user.nickName} (${openid})`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        token: token,
        openid: openid,
        userInfo: {
          nickName: user.nickName,
          avatarUrl: user.avatarUrl,
          vipLevel: user.vipLevel
        }
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('微信登录错误:', err)
    ctx.status = 500
    ctx.body = {
      code: 500,
      message: '登录失败',
      data: null,
      timestamp: Date.now()
    }
  }
})

/**
 * 获取用户信息
 * GET /api/v1/user/profile
 */
router.get('/profile', authRequired, async (ctx) => {
  try {
    const userId = ctx.state.user.userId
    const user = await User.findById(userId)

    if (!user) {
      ctx.status = 404
      ctx.body = {
        code: 404,
        message: '用户不存在',
        data: null,
        timestamp: Date.now()
      }
      return
    }

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        vipLevel: user.vipLevel,
        vipExpireAt: user.vipExpireAt
      },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('获取用户信息错误:', err)
    ctx.status = 500
    ctx.body = {
      code: 500,
      message: '获取用户信息失败',
      data: null,
      timestamp: Date.now()
    }
  }
})

module.exports = router
