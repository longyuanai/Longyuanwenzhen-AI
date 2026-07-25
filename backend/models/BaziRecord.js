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
    gender: { type: String, required: true, enum: ['male', 'female'] }
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

// 同一用户重复排同一个盘不该堆叠成多条，靠这个唯一键做幂等
BaziRecordSchema.index(
  {
    userId: 1,
    'birth.year': 1,
    'birth.month': 1,
    'birth.day': 1,
    'birth.hour': 1,
    'birth.minute': 1,
    'birth.gender': 1
  },
  { unique: true, name: 'uniq_user_birth' }
)

BaziRecordSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

module.exports = mongoose.model('BaziRecord', BaziRecordSchema)
