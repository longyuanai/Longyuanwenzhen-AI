# 智能八字排盘微信小程序

一个基于传统命理学的八字排盘微信小程序，提供专业的八字排盘和AI命理解读服务。

## 项目结构

```
├── miniprogram/          # 小程序前端
│   ├── pages/           # 页面
│   │   ├── index/       # 首页
│   │   ├── paipan/      # 排盘页
│   │   ├── result/      # 排盘结果页
│   │   ├── analysis/    # 命理解读页
│   │   └── profile/     # 我的页面
│   ├── utils/           # 工具函数
│   │   ├── bazi.js      # 八字排盘核心算法
│   │   ├── request.js   # 网络请求封装
│   │   └── util.js      # 通用工具函数
│   ├── assets/          # 静态资源
│   ├── app.js           # 小程序入口
│   ├── app.json         # 小程序配置
│   └── app.wxss         # 全局样式
│
├── backend/             # 后端服务
│   ├── routes/          # 路由
│   │   ├── user.js      # 用户路由
│   │   ├── bazi.js      # 排盘路由
│   │   ├── analysis.js  # 分析路由
│   │   └── order.js     # 订单路由
│   ├── models/          # 数据模型
│   ├── utils/           # 工具函数
│   ├── config/          # 配置文件
│   ├── app.js           # 服务入口
│   └── package.json     # 依赖配置
│
└── .codeartsdoer/       # SDD规格文档
    └── specs/
        └── bazi_miniprogram/
            ├── spec.md      # 需求规格
            ├── design.md    # 技术设计
            └── tasks.md     # 开发任务
```

## 核心功能

### 1. 八字排盘
- 支持公历日期转干支历
- 自动计算四柱（年柱、月柱、日柱、时柱）
- 十神配置计算
- 地支藏干计算
- 大运流年推算

### 2. 命理解读
- 基础解读：喜用神分析、命局特点、性格特征
- 深度报告：事业财运、感情婚姻、健康运势、人生建议
- AI智能生成解读内容

### 3. 用户功能
- 微信授权登录
- 排盘历史记录
- 本地缓存支持

### 4. 付费服务
- 微信支付集成
- 深度报告付费解锁
- 订单管理

## 技术栈

### 小程序前端
- 微信小程序原生框架
- 纯JavaScript实现
- 无第三方UI依赖

### 后端服务
- Node.js + Koa
- MongoDB + Mongoose
- Redis缓存
- JWT认证

### AI集成
- OpenAI GPT-4
- 文心一言（备选）

## 快速开始

### 1. 小程序端

```bash
# 1. 安装微信开发者工具
# 下载地址：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

# 2. 导入项目
# 打开微信开发者工具，导入 miniprogram 目录

# 3. 配置AppID
# 在 project.config.json 中填入你的小程序AppID
```

### 2. 后端服务

```bash
# 1. 安装依赖
cd backend
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入实际配置

# 3. 启动MongoDB
# 确保MongoDB服务已启动

# 4. 启动服务
npm run dev  # 开发模式
npm start    # 生产模式
```

### 3. 配置说明

#### 小程序配置
修改 `miniprogram/utils/request.js` 中的 `BASE_URL`：
```javascript
const BASE_URL = 'https://your-domain.com/api/v1'
```

#### 后端配置
编辑 `backend/.env` 文件：
```env
# 微信小程序配置
WX_APPID=your_appid
WX_SECRET=your_secret

# AI配置
OPENAI_API_KEY=your_api_key

# 数据库配置
MONGODB_URL=mongodb://localhost:27017/bazi
```

## API接口

### 用户接口
- `POST /api/v1/user/wx-login` - 微信登录

### 排盘接口
- `POST /api/v1/bazi/paipan` - 生成八字排盘
- `GET /api/v1/bazi/history` - 查询排盘历史

### 解读接口
- `POST /api/v1/analysis/basic` - 基础解读
- `POST /api/v1/analysis/deep` - 深度报告

### 订单接口
- `POST /api/v1/order/create` - 创建订单
- `POST /api/v1/order/:orderId/pay` - 获取支付参数
- `POST /api/v1/order/:orderId/confirm` - 确认支付

## 开发进度

### ✅ 已完成
- [x] 项目基础框架搭建
- [x] 八字排盘核心算法
- [x] 排盘输入页面
- [x] 排盘结果展示页面
- [x] 命理解读页面
- [x] 个人中心页面
- [x] 后端API服务
- [x] AI解读集成
- [x] 订单路由

### 🚧 进行中
- [ ] 微信支付完整集成
- [ ] 生产环境部署

### 📋 待开发
- [ ] 性能优化
- [ ] 更多命理功能
- [ ] 社区交流功能

## 注意事项

1. **小程序审核**：命理类小程序审核较严格，请确保内容专业、避免迷信色彩
2. **数据安全**：用户出生信息需加密存储，注意隐私保护
3. **AI内容**：AI生成内容需质量控制，避免绝对化表述
4. **支付合规**：虚拟商品支付需符合微信支付规范

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎提交Issue。
