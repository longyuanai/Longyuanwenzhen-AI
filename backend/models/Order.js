// models/Order.js - 订单模型
//
// 从 routes/order.js 抽出，便于 analysis 等路由共享（付费校验需查询订单）。
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const OrderSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productType: { type: String, required: true }, // deep_report, vip_month 等
  amount: { type: Number, required: true }, // 金额（元），由服务端权威定价
  status: { type: String, default: 'pending', enum: ['pending', 'paid', 'cancelled'] },
  transactionId: { type: String, default: null }, // 微信支付交易号，回调成功后写入
  paidAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

OrderSchema.index({ userId: 1, productType: 1, status: 1 })

OrderSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
  next()
})

module.exports = mongoose.model('Order', OrderSchema)
