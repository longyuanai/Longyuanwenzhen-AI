// routes/bazi.js - 八字排盘路由
const Router = require('koa-router')
const logger = require('../utils/logger')
const { paipan } = require('../utils/bazi')

const router = new Router()

// 性别归一化：兼容前端可能传入的多种写法
const GENDER_MAP = {
  male: 'male', female: 'female',
  男: 'male', 女: 'female',
  1: 'male', 0: 'female', '1': 'male', '0': 'female'
}

/**
 * 解析 birthDate(YYYY-MM-DD)+ birthTime(HH:mm) 为整数字段
 * @returns {{year,month,day,hour,minute}|null} 解析失败返回 null
 */
function parseBirth(birthDate, birthTime) {
  const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(birthDate).trim())
  const tm = /^(\d{1,2}):(\d{1,2})$/.exec(String(birthTime).trim())
  if (!dm || !tm) return null
  return {
    year: +dm[1], month: +dm[2], day: +dm[3],
    hour: +tm[1], minute: +tm[2]
  }
}

/**
 * 八字排盘
 * POST /api/v1/bazi/paipan
 */
router.post('/paipan', async (ctx) => {
  try {
    const { birthDate, birthTime, gender } = ctx.request.body

    // 参数验证
    if (!birthDate || !birthTime || !gender) {
      ctx.status = 400
      ctx.body = {
        code: 400,
        message: '缺少必要参数',
        data: null,
        timestamp: Date.now()
      }
      return
    }

    const normGender = GENDER_MAP[gender]
    if (!normGender) {
      ctx.status = 400
      ctx.body = { code: 400, message: "性别参数错误（male/female）", data: null, timestamp: Date.now() }
      return
    }

    const birth = parseBirth(birthDate, birthTime)
    if (!birth) {
      ctx.status = 400
      ctx.body = { code: 400, message: '日期或时间格式错误（YYYY-MM-DD / HH:mm）', data: null, timestamp: Date.now() }
      return
    }

    // 后端权威排盘（对齐 spec 5.2.2：排盘以后端计算为准）
    const result = paipan({ ...birth, gender: normGender })

    logger.info(`排盘成功: ${birthDate} ${birthTime} ${normGender} -> ${result.dayPillar.gan}${result.dayPillar.zhi}日`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        baziId: `bazi_${Date.now()}`,
        ...result
      },
      timestamp: Date.now()
    }
  } catch (err) {
    // 引擎校验失败 → 400；其余 → 500
    if (err.code === 'INVALID_INPUT') {
      ctx.status = 400
      ctx.body = { code: 400, message: err.message, data: null, timestamp: Date.now() }
      return
    }
    logger.error('排盘错误:', err)
    ctx.status = 500
    ctx.body = {
      code: 500,
      message: '排盘失败',
      data: null,
      timestamp: Date.now()
    }
  }
})

/**
 * 获取排盘历史
 * GET /api/v1/bazi/history
 */
router.get('/history', async (ctx) => {
  try {
    const userId = ctx.state.user?.userId

    if (!userId) {
      ctx.status = 401
      ctx.body = {
        code: 401,
        message: '未授权',
        data: null,
        timestamp: Date.now()
      }
      return
    }

    // 这里应该从数据库查询用户的排盘历史
    // 简化处理，返回空数组

    ctx.body = {
      code: 200,
      message: 'success',
      data: [],
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('获取排盘历史错误:', err)
    ctx.status = 500
    ctx.body = {
      code: 500,
      message: '获取排盘历史失败',
      data: null,
      timestamp: Date.now()
    }
  }
})

module.exports = router
