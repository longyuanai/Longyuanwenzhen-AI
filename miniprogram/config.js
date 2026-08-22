// config.js - 小程序端集中配置
//
// 为什么要有这个文件：
//   API 地址、客服微信号这类值原本散在 utils/request.js、pages/four-school/、
//   pages/profile/ 里，其中客服微信号还是两处各写一份。上线/开测前漏改任何
//   一处，用户就会打不通接口或加不到客服 —— 而这类错误不会让任何测试变红，
//   只会在真机上被熟人发现。
//
// 约定：
//   - 所有「换环境要改」的值只写在这里，别处一律 require 本文件
//   - 占位值统一放进 PLACEHOLDERS，app.js 启动时检查并告警
//   - 上线前的检查清单见本文件末尾

// ── 后端 ───────────────────────────────────────────────────────────
// ⚠️ 上线前必须改成 https 真实域名，并在微信公众平台配置合法 request 域名。
// 熟人内测走内网 IP 时改成 'http://192.168.x.x:8080'（见 docs/friend-test-runbook.md）
const API_HOST = 'http://localhost:8080'

// 后端路由前缀。各页面调 request() 时 url 只写业务路径（'/analysis/basic'），
// 不要再带这个前缀，否则会拼成 /api/v1/api/v1/...
const API_PREFIX = '/api/v1'

// 单次请求超时（毫秒）。后端 AI 接口自身有 5s 超时 + 本地降级，
// 这里留足余量，避免客户端先超时导致用户看不到降级内容。
const REQUEST_TIMEOUT = 15000

// ── 运营 ───────────────────────────────────────────────────────────
// 客服微信号：付费开通、意见反馈都走这个号。
// ⚠️ 内测/上线前必须替换成真实微信号，否则熟人加不到人。
const CONTACT_WECHAT = 'bazi-help-2026'

// 版本号，展示在「我的 → 关于」
const APP_VERSION = 'v1.0.0'

// ── 占位值自检 ─────────────────────────────────────────────────────
// 这些值原样出现在生产环境里就是配置漏改。app.js 启动时会检查并告警。
const PLACEHOLDERS = {
  CONTACT_WECHAT: 'bazi-help-2026'
}

/**
 * 检查是否还有没改的占位值 / 不适合真机的配置。
 * 只告警不阻断 —— 本机开发时这些值本来就是占位的，拦住反而碍事。
 * @returns {string[]} 问题描述列表，空数组表示配置就绪
 */
function checkConfig() {
  const issues = []

  if (CONTACT_WECHAT === PLACEHOLDERS.CONTACT_WECHAT) {
    issues.push('CONTACT_WECHAT 仍是占位值，熟人加不到客服，付费与反馈链路是断的')
  }
  // 真机（含内测体验版）访问不到开发机的 localhost
  if (/localhost|127\.0\.0\.1/.test(API_HOST)) {
    issues.push('API_HOST 指向 localhost，真机访问不到；内测改内网 IP，上线改 https 域名')
  }
  // 微信要求线上小程序必须 https
  if (/^http:\/\//.test(API_HOST) && !/localhost|127\.0\.0\.1|192\.168\.|10\.|172\./.test(API_HOST)) {
    issues.push('API_HOST 是 http，微信线上环境只允许 https')
  }

  return issues
}

module.exports = {
  API_HOST,
  API_PREFIX,
  API_BASE: API_HOST + API_PREFIX,
  REQUEST_TIMEOUT,
  CONTACT_WECHAT,
  APP_VERSION,
  checkConfig
}

// ── 上线 / 开测前检查清单 ──────────────────────────────────────────
//
// 代码侧（改完跑 `cd backend && npm run preflight` 复核）：
//   1. API_HOST 改成开发机内网 IP（熟人手机与电脑同 WiFi），或 frp/ngrok 公网地址
//   2. CONTACT_WECHAT 改成你自己的微信号
//   3. project.config.json 的 appid 从 "touristappid" 换成真实 AppID
//      —— 游客模式无法真机预览、无法上传，这一条不改什么都做不了
//   4. 后端 .env 填 WX_APPID / WX_SECRET（测试号的）+ OPENAI_API_KEY + JWT_SECRET
//
// 微信公众平台后台（代码改不了，必须人工去配）：
//   5. 服务器域名 → request 合法域名填你的后端域名。**必须 https**，
//      且 project.config.json 的 urlCheck 为 true 时真机会强制校验
//   6. 用户隐私保护指引 → 2023-09 起强制。本小程序涉及 wx.login（openid）、
//      头像昵称、本地缓存排盘记录，属于必须配置的范围
//   7. 测试号白名单（上限 100 个微信号）；正式号则走类目申请
//
// 已知风险（非代码问题）：
//   8. 命理属敏感类目，审核不确定性高。正式提审前先到公众平台确认
//      「服务类目」列表里有无可容纳的类目，并读最新版运营规范中关于
//      迷信类内容的条款 —— 这一步比任何代码工作都更决定项目走向
//
// 正式收费追加：
//   9. 后端 NODE_ENV=production、JWT_SECRET 换强密钥、ALLOWED_ORIGINS 填域名
//  10. 接微信支付（需商户号 + 企业/个体工商户主体），
//      把 order/:orderId/pay 的占位 paySign 换成真实统一下单
//
// 基础库版本：project.config.json 的 libVersion 只影响开发者工具，
// 真机跑的是用户自己微信的基础库。头像昵称填写能力需 2.21.2+，
// pages/index/index.js 已做 wx.canIUse 运行时检测，旧版不渲染该入口。
