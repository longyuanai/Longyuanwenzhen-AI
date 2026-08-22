// utils/baziRecordStore.js - 排盘记录存储层
//
// 沿用 utils/entitlementRegistry.js 立下的约定：有 Mongo 走 Mongo（权威），
// 无 Mongo 走进程内内存，让「没数据库也能完整演示」这条路继续成立。
// 写失败一律不抛错 —— 排盘本身是免费主功能，绝不能因为存历史失败就整个 500。
//
// 幂等：同一用户重复排同一个盘只留一条，更新 updatedAt 而不是堆叠新记录。

const mongoose = require('mongoose')
const BaziRecord = require('../models/BaziRecord')
const logger = require('./logger')

// 无 Mongo 时的内存表：userId -> [record]
const memory = new Map()
// 单用户内存记录上限，防止长跑进程无限增长
const MEMORY_LIMIT = 50
// 备注名长度上限，超出截断（用户直接输入，不设限会被塞进超长字符串）
const LABEL_MAX_LEN = 20
// 单次批量同步的条数上限，防止客户端一次塞太多
const SYNC_MAX_ITEMS = 50

function hasMongo() {
  return mongoose.connection.readyState === 1
}

// 归一化 birth，作为幂等键与存储值
//
// birthPlace 必须一起存：/history 的契约是「拿 birth 重新调 /paipan 即可」，
// 排盘是纯函数所以只存入参不存结论。但真太阳时校正也依赖出生地——
// 漏存出生地，回放历史就会得到另一个盘（喀什的盘能差出一整个日柱）。
function normalizeBirth(birth) {
  const b = {
    year: Number(birth.year),
    month: Number(birth.month),
    day: Number(birth.day),
    hour: Number(birth.hour),
    minute: Number(birth.minute || 0),
    gender: birth.gender
  }
  // 只在有值时落字段：老记录没有这两项，补 undefined 会让幂等键与存量记录错开
  const place = birth.birthPlace == null ? '' : String(birth.birthPlace).trim()
  if (place) b.birthPlace = place
  if (birth.longitude != null && birth.longitude !== '' && Number.isFinite(Number(birth.longitude))) {
    b.longitude = Number(birth.longitude)
  }
  return b
}

// 幂等键要带出生地：同一时刻、不同出生地是两个不同的盘，
// 不带的话第二个盘会覆盖掉第一个。
function birthKey(b) {
  const geo = b.birthPlace || (b.longitude != null ? `@${b.longitude}` : '')
  return `${b.year}-${b.month}-${b.day}-${b.hour}-${b.minute}-${b.gender}-${geo}`
}

// 内存记录必须深拷贝后再交出去：浅拷贝会把嵌套的 birth 原样共享出去，
// 调用方一改就污染了存储里的那一份。
function cloneRecord(r) {
  return { ...r, birth: { ...r.birth } }
}

// 备注名归一：用户直接输入，去空白并截断
function normalizeLabel(label) {
  return String(label == null ? '' : label).trim().slice(0, LABEL_MAX_LEN)
}

/**
 * 保存一条排盘记录（幂等：同用户同出生信息只留一条）。
 * @returns {Promise<object|null>} 记录（含 id）；存储不可用时返回 null
 */
async function save(userId, birth, baziStr, label) {
  const b = normalizeBirth(birth)
  const uid = String(userId)

  if (hasMongo()) {
    try {
      const doc = await BaziRecord.findOneAndUpdate(
        {
          userId: uid,
          'birth.year': b.year,
          'birth.month': b.month,
          'birth.day': b.day,
          'birth.hour': b.hour,
          'birth.minute': b.minute,
          'birth.gender': b.gender,
          // 与 uniq_user_birth_v2 的键集保持一致；未填出生地的记录该字段不存在，
          // 查询侧显式用 null 才能命中（Mongo 里缺失字段等价于 null）
          'birth.birthPlace': b.birthPlace == null ? null : b.birthPlace,
          'birth.longitude': b.longitude == null ? null : b.longitude
        },
        {
          $set: { baziStr, updatedAt: new Date(), ...(label ? { label: normalizeLabel(label) } : {}) },
          $setOnInsert: { userId: uid, birth: b, createdAt: new Date() }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      return toView(doc)
    } catch (err) {
      // 唯一键并发冲突等：记录历史失败不影响排盘本身
      logger.warn(`排盘记录写入失败(用户 ${uid}): ${err.message}`)
      return null
    }
  }

  // 无 Mongo：内存兜底
  const list = memory.get(uid) || []
  const key = birthKey(b)
  const existing = list.find((r) => birthKey(r.birth) === key)
  const now = new Date()
  if (existing) {
    existing.baziStr = baziStr
    existing.updatedAt = now
    if (label) existing.label = normalizeLabel(label)
    return cloneRecord(existing)
  }
  const record = {
    id: `mem_${uid}_${key}`,
    birth: b,
    baziStr,
    label: normalizeLabel(label),
    createdAt: now,
    updatedAt: now
  }
  list.unshift(record)
  if (list.length > MEMORY_LIMIT) list.length = MEMORY_LIMIT
  memory.set(uid, list)
  return cloneRecord(record)
}

/**
 * 列出某用户的排盘历史，按时间倒序。
 * @returns {Promise<Array>} 存储不可用时返回空数组
 */
async function list(userId, limit = 20) {
  const uid = String(userId)

  if (hasMongo()) {
    try {
      const docs = await BaziRecord.find({ userId: uid })
        .sort({ createdAt: -1 })
        .limit(limit)
      return docs.map(toView)
    } catch (err) {
      logger.warn(`排盘历史查询失败(用户 ${uid}): ${err.message}`)
      return []
    }
  }

  const records = memory.get(uid) || []
  return records
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map(cloneRecord)
}

/**
 * 修改某条记录的备注名。
 *
 * @returns {Promise<object|null>} 更新后的记录；记录不存在或不属于该用户时返回 null
 */
async function setLabel(userId, id, label) {
  const uid = String(userId)
  const text = normalizeLabel(label)

  if (hasMongo()) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) return null
    try {
      // 条件里带 userId：别人的记录改不动，不需要先查再判
      const doc = await BaziRecord.findOneAndUpdate(
        { _id: id, userId: uid },
        { $set: { label: text, updatedAt: new Date() } },
        { new: true }
      )
      return toView(doc)
    } catch (err) {
      logger.warn(`排盘记录改名失败(用户 ${uid}, 记录 ${id}): ${err.message}`)
      return null
    }
  }

  const record = (memory.get(uid) || []).find((r) => r.id === id)
  if (!record) return null
  record.label = text
  record.updatedAt = new Date()
  return cloneRecord(record)
}

/**
 * 批量保存排盘记录。
 *
 * 给小程序「登录后把本机记录同步到云端」用：匿名时排的盘存在本地 storage，
 * 登录后一次性传上来，换设备也能看到。逐条走 save() 的幂等逻辑，
 * 已存在的盘只会更新不会重复。
 *
 * @param {Array} items [{ birth, baziStr?, label? }]
 * @returns {Promise<{saved:number, skipped:number}>}
 */
async function saveMany(userId, items) {
  let saved = 0
  let skipped = 0
  for (const item of Array.isArray(items) ? items : []) {
    const rec = await save(userId, item.birth, item.baziStr || '', item.label)
    if (rec) saved++
    else skipped++
  }
  return { saved, skipped }
}

/**
 * 清空某用户的全部排盘记录。
 *
 * 小程序「清除历史」需要它：只清本地 storage 的话，下次 onShow 拉服务端
 * 历史又全回来了，用户会以为清除没生效。
 *
 * @returns {Promise<number>} 删除条数；存储不可用时返回 0
 */
async function clear(userId) {
  const uid = String(userId)

  if (hasMongo()) {
    try {
      const res = await BaziRecord.deleteMany({ userId: uid })
      return res.deletedCount || 0
    } catch (err) {
      logger.warn(`排盘历史清除失败(用户 ${uid}): ${err.message}`)
      return 0
    }
  }

  const n = (memory.get(uid) || []).length
  memory.delete(uid)
  return n
}

// Mongo 文档 → 对外视图（不直接吐 _id/__v）
function toView(doc) {
  if (!doc) return null
  const b = doc.birth || {}
  return {
    id: String(doc._id),
    birth: {
      year: b.year, month: b.month, day: b.day,
      hour: b.hour, minute: b.minute, gender: b.gender
    },
    baziStr: doc.baziStr || '',
    label: doc.label || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

// 测试用
function _reset() {
  memory.clear()
}

module.exports = {
  save,
  saveMany,
  list,
  setLabel,
  clear,
  _reset,
  MEMORY_LIMIT,
  LABEL_MAX_LEN,
  SYNC_MAX_ITEMS
}
