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

function hasMongo() {
  return mongoose.connection.readyState === 1
}

// 归一化 birth，作为幂等键与存储值
function normalizeBirth(birth) {
  return {
    year: Number(birth.year),
    month: Number(birth.month),
    day: Number(birth.day),
    hour: Number(birth.hour),
    minute: Number(birth.minute || 0),
    gender: birth.gender
  }
}

function birthKey(b) {
  return `${b.year}-${b.month}-${b.day}-${b.hour}-${b.minute}-${b.gender}`
}

// 内存记录必须深拷贝后再交出去：浅拷贝会把嵌套的 birth 原样共享出去，
// 调用方一改就污染了存储里的那一份。
function cloneRecord(r) {
  return { ...r, birth: { ...r.birth } }
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
          'birth.gender': b.gender
        },
        {
          $set: { baziStr, updatedAt: new Date(), ...(label ? { label } : {}) },
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
    if (label) existing.label = label
    return cloneRecord(existing)
  }
  const record = {
    id: `mem_${uid}_${key}`,
    birth: b,
    baziStr,
    label: label || '',
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

module.exports = { save, list, _reset, MEMORY_LIMIT }
