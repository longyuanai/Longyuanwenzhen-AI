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
│   │   ├── four-school/ # 四家并列解读页
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
├── frontend/            # 独立 H5
│   ├── checkup.html     # H5 体检入口(加时辰未知引导 + 微信联系收口)
│   ├── checkup.css      # 样式
│   └── checkup.js       # 脚本(XSS-safe render)
│
├── backend/             # 后端服务
│   ├── routes/          # 路由(5 个模块)
│   │   ├── user.js      # 用户路由
│   │   ├── bazi.js      # 排盘路由
│   │   ├── analysis.js  # 分析路由(basic/deep/four-school/checkup)
│   │   ├── order.js     # 订单路由
│   │   └── health.js    # 健康检查(聚合 backend + LightRAG)
│   ├── models/          # 数据模型
│   ├── middleware/      # 中间件(JWT 鉴权 envelope/extractToken/auth + CORS 白名单 + IP 限流)
│   ├── utils/           # 工具函数(排盘/格局/旺衰/喜忌/prompt/RAG/四家投票/微信支付/权益注册表/sentry/本地降级)
│   ├── config/          # 配置文件
│   ├── scripts/         # 联调脚本(dev-seed-test-user 自签 JWT + paid 订单)
│   ├── app.js           # 服务入口
│   ├── logs/            # 运行日志
│   └── package.json     # 依赖配置
│
├── bazi-skill-dist/     # 命理知识引擎(产品护城河):14 本古籍、四家投票法、紫微、公众人物案例、LightRAG 索引
│
├── docs/                # 集成文档 + 命理知识素材
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

### 4. H5 体检入口
- 独立 H5 页面(`frontend/checkup.html`)
- 加时辰未知引导与微信联系收口
- 免费五行体检直连 `/api/v1/analysis/checkup`

### 5. 付费服务
- 微信支付集成
- 深度报告付费解锁
- 四家并列解读付费档
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
- OpenAI GPT-4(主)
- 文心一言（备选）
- LightRAG(古籍 RAG 引证,源在 `bazi-skill-dist/`,端点 `LIGHTRAG_URL`;四家并列解读按徐乐吾/梁湘润/袁树珊/韦千里四家方法论并行检索)

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
# 方式 A:Docker 容器(Mongo 7,镜像约 150MB)
docker run -d --name bazi-mongo -p 27017:27017 mongo:7
# 方式 B:本地安装 MongoDB 7 并监听 27017

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

# JWT 配置(本地开发可留空,生产必须设置强密钥)
JWT_SECRET=your_jwt_secret

# RAG 配置(LightRAG 端点,可选;挂了不影响产品解读,只是没引证)
LIGHTRAG_URL=http://localhost:9621

# CORS 白名单(逗号分隔;'*' 全放;生产建议白名单+NODE_ENV=production 实现 fail-closed)
ALLOWED_ORIGINS=*

# AI 限流开关(1=关;空=开 60 req/min per IP,压测/联调时可临时关)
RATE_LIMIT_DISABLED=

# Sentry 监控(可选;空=降级到 console.error 写日志,生产前配 DSN 才上报远端)
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0
SENTRY_RELEASE=
```

## API接口

### 健康检查
- `GET /health` - 健康检查(聚合 backend + LightRAG,LightRAG down 仍返 200)

### 用户接口
- `POST /api/v1/user/wx-login` - 微信登录
- `GET /api/v1/user/profile` - 获取用户信息(鉴权)

### 排盘接口
- `POST /api/v1/bazi/paipan` - 生成八字排盘(免费)
- `GET /api/v1/bazi/history` - 查询排盘历史(鉴权)

### 解读接口
- `POST /api/v1/analysis/basic` - 基础解读(免费)
- `POST /api/v1/analysis/deep` - 深度报告(鉴权 + 付费:deep_report / VIP)
- `POST /api/v1/analysis/four-school` - 四家并列解读(鉴权 + 付费:four_school / VIP)
- `POST /api/v1/analysis/checkup` - 免费五行体检(确定性算法,不调 AI,7ms)

### 订单接口
- `POST /api/v1/order/create` - 创建订单(鉴权,服务端定价)
- `POST /api/v1/order/callback` - 微信支付回调(**公开**,订单 paid 唯一合法入口)
- `GET /api/v1/order/list` - 订单列表(鉴权)
- `GET /api/v1/order/:orderId` - 订单详情(鉴权,带归属校验)
- `POST /api/v1/order/:orderId/pay` - 获取支付参数(鉴权,当前为占位数据)
- `POST /api/v1/order/:orderId/confirm` - 查询订单状态(鉴权,只读轮询)

## 开发进度

### ✅ 已完成
- [x] 项目基础框架搭建
- [x] 八字排盘核心算法
- [x] 排盘输入页面
- [x] 排盘结果展示页面
- [x] 命理解读页面
- [x] 四家并列解读页面
- [x] 个人中心页面
- [x] 后端API服务(含 /health 健康检查)
- [x] AI解读集成(OpenAI + LightRAG 古籍引证)
- [x] 订单路由(创建 / 回调 / 列表 / 详情 / 支付 / 确认)
- [x] H5 体检入口(`frontend/checkup.html`)
- [x] H5 体检页 CSS/JS 拆分 + render() XSS 硬化(createElement + textContent)
- [x] CORS 白名单(prod fail-closed)+ AI 类接口 IP 限流(60 req/min)
- [x] Sentry 监控骨架(`utils/sentry.js`,DSN 为空降级 console,未捕获 promise/exception 兜底)
- [x] 后端测试套件(jest,22 套件 / 183 用例 / ~4.5s 全绿)
- [x] AI 网关超时/失败降级本地模板(P0 #30,axios timeout: 5000,basic/deep/four-school 三路径各不同模板)
- [x] 权益检查 in-memory 兜底(P1 #31,utils/entitlementRegistry,无 Mongo 演示不再永远 403)
- [x] 联调脚本(`scripts/dev-seed-test-user.js`)
- [x] 中间件分层(`middleware/envelope.js` + `extractToken.js` + `auth.js`)
- [x] 数据库连接配置层(`config/db.js`,从 app.js 抽出)

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
