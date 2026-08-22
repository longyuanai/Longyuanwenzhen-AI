// routes/user.js - 用户路由
const Router = require('koa-router')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const config = require('../config')
const logger = require('../utils/logger')
const { authRequired } = require('../middleware/auth')

// 微信开放接口超时（毫秒）。宁可快速失败让用户重试，也不要挂着不返回。
const WX_HTTP_TIMEOUT_MS = 5000

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

    // 调用微信接口换取 openid。
    // 必须显式设 timeout：axios 默认 timeout=0（永不超时），微信接口一旦不通
    // 就会一直挂在 TCP 上，把登录请求拖成假死（与 analysis.js 的 AI 网关同类问题）。
    const wxResponse = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      timeout: WX_HTTP_TIMEOUT_MS,
      params: {
        appid: config.weixin.appId,
        secret: config.weixin.appSecret,
        js_code: code,
        grant_type: 'authorization_code'
      }
    })

    // session_key 是解密手机号等敏感信息用的，当前没有该功能，故不接收也不落库
    // （存了反而是无谓的泄露面）。需要时再从这里取。
    const { openid, unionid, errcode, errmsg } = wxResponse.data

    if (!openid) {
      // 把微信侧错误码记进日志，否则「登录失败」四个字排查不动
      // （40013=appid 无效，40125=secret 无效，40029=code 无效或已用过）
      logger.warn(`微信 jscode2session 未返回 openid: errcode=${errcode} errmsg=${errmsg}`)
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

    // 生成JWT令牌。role 取库里的值（默认 user），middleware/access.js 据此
    // 做角色门槛与 admin 绕过 —— 不带 role 的话那些分支永远走不到。
    const token = jwt.sign(
      {
        userId: user._id,
        openid: user.openid,
        role: user.role || 'user'
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
