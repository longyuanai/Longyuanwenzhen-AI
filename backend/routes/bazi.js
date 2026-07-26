// routes/bazi.js - 八字排盘路由
const Router = require('koa-router')
const logger = require('../utils/logger')
const { paipan } = require('../utils/bazi')
const { authRequired, authOptional } = require('../middleware/auth')
const recordStore = require('../utils/baziRecordStore')

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
 *
 * 免登录可用（排盘是免费主功能）。带了合法 token 则额外把这一盘写进历史记录，
 * 供 GET /history 回看 —— 故用 authOptional 而非 authRequired。
 */
router.post('/paipan', authOptional, async (ctx) => {
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

    const baziStr = ['year', 'month', 'day', 'hour']
      .map((k) => result[k + 'Pillar'].gan + result[k + 'Pillar'].zhi)
      .join(' ')

    // 登录用户才落库。存储失败只告警不抛：排盘是免费主功能，
    // 不能因为写历史失败就把整个请求打成 500。
    let baziId = null
    const userId = ctx.state.user && ctx.state.user.userId
    if (userId) {
      const record = await recordStore.save(
        userId,
        { ...birth, gender: normGender },
        baziStr,
        ctx.request.body.label
      )
      if (record) baziId = record.id
    }

    logger.info(`排盘成功: ${birthDate} ${birthTime} ${normGender} -> ${result.dayPillar.gan}${result.dayPillar.zhi}日${baziId ? `, 已存记录 ${baziId}` : ''}`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: {
        // 登录且落库成功时是真实记录 id（可用于回看）；
        // 匿名或存储不可用时退回临时 id，仅作本次请求的关联标识。
        baziId: baziId || `bazi_${Date.now()}`,
        persisted: !!baziId,
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
 * GET /api/v1/bazi/history?limit=20
 *
 * 返回该用户存过的排盘记录（出生信息 + 四柱快照），按时间倒序。
 * 只返回排盘输入，不返回四柱以外的派生结果 —— 要完整命盘，
 * 拿 birth 重新调 /paipan 即可（排盘是纯函数，重算成本可忽略）。
 */
router.get('/history', authRequired, async (ctx) => {
  try {
    const limit = Math.min(Math.max(parseInt(ctx.query.limit, 10) || 20, 1), 100)
    const records = await recordStore.list(ctx.state.user.userId, limit)

    ctx.body = {
      code: 200,
      message: 'success',
      data: records,
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

/**
 * 批量同步本机排盘记录到云端
 * POST /api/v1/bazi/history/sync
 * body: { items: [{ birth:{...}, baziStr?, label? }] }
 *
 * 用户匿名时排的盘只在本机 storage 里，登录后调一次这个接口传上来，
 * 换设备也能看到。逐条走幂等 upsert，已存在的盘不会重复。
 *
 * 注意：必须声明在 /history/:id 之前，否则 'sync' 会被当成 id 吞掉。
 */
router.post('/history/sync', authRequired, async (ctx) => {
  try {
    const { items } = ctx.request.body || {}
    if (!Array.isArray(items)) {
      ctx.status = 400
      ctx.body = { code: 400, message: 'items 必须为数组', data: null, timestamp: Date.now() }
      return
    }
    if (items.length > recordStore.SYNC_MAX_ITEMS) {
      ctx.status = 400
      ctx.body = {
        code: 400,
        message: `单次最多同步 ${recordStore.SYNC_MAX_ITEMS} 条`,
        data: null,
        timestamp: Date.now()
      }
      return
    }

    // 逐条校验 birth：一条脏数据不该让整批失败，跳过并计入 invalid
    const valid = []
    let invalid = 0
    for (const item of items) {
      const b = item && item.birth
      if (!b || !GENDER_MAP[b.gender]) { invalid++; continue }
      const nums = [b.year, b.month, b.day, b.hour].map(Number)
      if (nums.some((n) => !Number.isInteger(n))) { invalid++; continue }
      // 复用排盘引擎的边界校验，超界的盘不入库
      try {
        paipan({
          year: nums[0], month: nums[1], day: nums[2], hour: nums[3],
          minute: Number(b.minute || 0), gender: GENDER_MAP[b.gender]
        })
      } catch (e) {
        invalid++
        continue
      }
      valid.push({
        birth: {
          year: nums[0], month: nums[1], day: nums[2], hour: nums[3],
          minute: Number(b.minute || 0), gender: GENDER_MAP[b.gender]
        },
        baziStr: item.baziStr,
        label: item.label
      })
    }

    const { saved, skipped } = await recordStore.saveMany(ctx.state.user.userId, valid)
    logger.info(`同步排盘记录: 用户 ${ctx.state.user.userId}, 收到 ${items.length} 条, 入库 ${saved} 条, 无效 ${invalid} 条`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: { received: items.length, saved, skipped, invalid },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('同步排盘记录错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '同步排盘记录失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 修改排盘记录备注名
 * PUT /api/v1/bazi/history/:id
 * body: { label }
 *
 * 用来区分多张盘（"我自己" / "老王"）。只能改自己的记录。
 *
 * 用 PUT 而非语义上更贴切的 PATCH：小程序的 wx.request 只支持
 * OPTIONS/GET/HEAD/POST/PUT/DELETE/TRACE/CONNECT，发不出 PATCH。
 */
router.put('/history/:id', authRequired, async (ctx) => {
  try {
    const { label } = ctx.request.body || {}
    if (typeof label !== 'string') {
      ctx.status = 400
      ctx.body = { code: 400, message: 'label 必须为字符串', data: null, timestamp: Date.now() }
      return
    }

    const record = await recordStore.setLabel(ctx.state.user.userId, ctx.params.id, label)
    if (!record) {
      // 记录不存在，或属于别人 —— 统一返 404，不泄露「存在但无权」
      ctx.status = 404
      ctx.body = { code: 404, message: '记录不存在', data: null, timestamp: Date.now() }
      return
    }

    ctx.body = { code: 200, message: 'success', data: record, timestamp: Date.now() }
  } catch (err) {
    logger.error('修改排盘记录备注错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '修改备注失败', data: null, timestamp: Date.now() }
  }
})

/**
 * 清空排盘历史
 * DELETE /api/v1/bazi/history
 *
 * 只删自己的记录。小程序「清除历史」会同时清本地 storage 与服务端记录 ——
 * 只清一边的话，下次进页面另一边的记录又回来了。
 */
router.delete('/history', authRequired, async (ctx) => {
  try {
    const deleted = await recordStore.clear(ctx.state.user.userId)
    logger.info(`清除排盘历史: 用户 ${ctx.state.user.userId}, ${deleted} 条`)

    ctx.body = {
      code: 200,
      message: 'success',
      data: { deleted },
      timestamp: Date.now()
    }
  } catch (err) {
    logger.error('清除排盘历史错误:', err)
    ctx.status = 500
    ctx.body = { code: 500, message: '清除排盘历史失败', data: null, timestamp: Date.now() }
  }
})

module.exports = router
