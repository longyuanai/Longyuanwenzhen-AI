// models/BaziRecord.js - 排盘记录
//
// 此前排盘结果完全不落库：baziId 是 `bazi_${Date.now()}` 用完即弃，
// 于是 /bazi/history 只能恒返空数组，付费报告无法重看，换设备记录全丢。
//
// 存什么：只存**出生信息**（排盘的输入），四柱/大运等派生结果不存。
//   - 排盘是纯函数，输入定则输出定，存派生结果只会带来一致性负担：
//     排盘引擎修一次 bug，库里的旧四柱就成了错数据。
//   - 读历史时按 birth 重新排盘即可，成本是微秒级。
// 另存一份 baziStr 快照仅供列表页展示与检索，不作为计算依据。

const mongoose = require('mongoose')
const Schema = mongoose.Schema

const BaziRecordSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // 排盘输入（权威数据，读历史时据此重新排盘）
  birth: {
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    day: { type: Number, required: true },
    hour: { type: Number, required: true },
    minute: { type: Number, default: 0 },
    gender: { type: String, required: true, enum: ['male', 'female'] },

    // 真太阳时校正的输入。可选：不填则不校正（默认关闭）。
    // 必须与出生时刻一起存——校正结果依赖它，漏存则回放历史会得到另一个盘。
    birthPlace: { type: String },
    longitude: { type: Number }
  },

  // 展示用快照，不参与计算
  baziStr: { type: String, default: '' },
  // 用户备注（"我自己"/"老王"），便于在列表里区分多张盘
  label: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

// 列表查询：按用户 + 时间倒序
BaziRecordSchema.index({ userId: 1, createdAt: -1 })

// 同一用户重复排同一个盘不该堆叠成多条，靠这个唯一键做幂等。
//
// 出生地参与唯一键：同一时刻 + 不同出生地是**两个不同的盘**（真太阳时校正
// 不同），不带进来的话第二个盘会把第一个覆盖掉。
// 未填出生地的记录该字段缺失，Mongo 唯一索引按 null 处理，老记录不受影响。
//
// ⚠️ 索引名从 uniq_user_birth 改成 uniq_user_birth_v2：Mongo 不会就地
// 修改既有索引的键集，同名重建会静默沿用旧定义。库里若已有 v1 索引，
// 需手动 dropIndex('uniq_user_birth') 一次。
BaziRecordSchema.index(
  {
    userId: 1,
    'birth.year': 1,
    'birth.month': 1,
    'birth.day': 1,
    'birth.hour': 1,
    'birth.minute': 1,
    'birth.gender': 1,
    'birth.birthPlace': 1,
    'birth.longitude': 1
  },
  { unique: true, name: 'uniq_user_birth_v2' }
)

BaziRecordSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

module.exports = mongoose.model('BaziRecord', BaziRecordSchema)
