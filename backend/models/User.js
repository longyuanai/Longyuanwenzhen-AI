// models/User.js - 用户模型
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const UserSchema = new Schema({
  openid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  unionid: {
    type: String,
    sparse: true
  },
  nickName: {
    type: String,
    default: '用户'
  },
  avatarUrl: {
    type: String,
    default: ''
  },
  vipLevel: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  },
  vipExpireAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

// 更新时间中间件
UserSchema.pre('save', function(next) {
  this.updatedAt = Date.now()
  next()
})

// 静态方法：根据openid查找或创建用户
UserSchema.statics.findOrCreateByOpenid = async function(openid, userInfo = {}) {
  let user = await this.findOne({ openid })

  if (!user) {
    user = await this.create({
      openid: openid,
      nickName: userInfo.nickName || '用户',
      avatarUrl: userInfo.avatarUrl || ''
    })
  } else {
    // 更新用户信息
    if (userInfo.nickName) {
      user.nickName = userInfo.nickName
    }
    if (userInfo.avatarUrl) {
      user.avatarUrl = userInfo.avatarUrl
    }
    await user.save()
  }

  return user
}

module.exports = mongoose.model('User', UserSchema)
