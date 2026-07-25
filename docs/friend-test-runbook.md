# 熟人测试运维手册

3 天内搭起"熟人 50 人内测"环境的端到端 runbook。每段独立可执行,出问题从对应段重跑。

## 0. 前置

- 微信公众平台「测试号」:https://mp.weixin.qq.com/debug/cgi-bin/sandboxinfo (拿 `wx9f4d1bbf3dxxxxx` 形式 appid + secret)
- 一个能扫码的微信账号(测试号只能配 100 个白名单微信号)
- 本机:docker、Node 18+、uv(或 python3)
- 一个能用 OpenAI 的 key(`/checkup` 不需要 AI,但 `/four-school` 和 `/dayun-full` 需要)

## 1. 启动(每天开测前)

按顺序起 3 个服务,顺序不可换(Mongo 不起则后端拒连,LightRAG 不起则 RAG 引证空)。

```bash
# 1.1 MongoDB(守护进程,挂掉自动重启)
docker run -d --name bazi-mongo --restart unless-stopped -p 27017:27017 mongo:7

# 1.2 LightRAG server + 灌 merged.json 索引(首次 5-10min,二次秒级)
cd bazi-skill-dist
OPENAI_API_KEY=sk-xxx bash scripts/serve-lightrag.sh
# 脚本会:docker pull → 起容器 → 等 /health → inject_kg.py 灌 45895 entities + 108184 relations
# Windows: set OPENAI_API_KEY=sk-xxx && scripts\serve-lightrag.bat

# 1.3 Koa 后端
cd ../backend
npm install              # 第一次或依赖变了
npm run dev              # nodemon 监听代码
# 或生产: npm start
```

**冒烟测试**(三个必须都过):
```bash
# Mongo 通
docker exec bazi-mongo mongosh --quiet --eval "db.runCommand({ping:1})"

# 后端 + LightRAG 都通
curl http://localhost:8080/health
# 期望: {"status":"ok","lightrag":"up",...}

# RAG 引证命中
curl -X POST http://localhost:8080/api/v1/analysis/checkup \
  -H 'Content-Type: application/json' \
  -d '{"birth":{"year":2002,"month":11,"day":20,"hour":10,"minute":0,"gender":"male"}}'
# 期望: 200 + currentDaYun 字段(< 50ms)
```

## 2. 生成账号(收一波新人时跑一次)

```bash
cd backend
npm run seed:friends:10
```

输出示例(每人 5 行):
```
── f-openid-1 ──
  userId:      671a8b...
  token:       eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  vipExpireAt: 2026-08-23T12:34:56.789Z
  orders:      deep=xxxxx four=xxxxx dayun_seg=xxxxx dayun_full=xxxxx
```

**怎么发微信**:把上面那段文字 + 小程序体验码(开发者工具 → 预览 → 二维码)一起发给熟人。熟人扫码 → wx.login → 第一次进后端自动建账号(`scripts/seed-friends.js` 已经预建了,所以是「已登录 + 已付费」状态)。

**扩容**:
```bash
npm run seed:friends -- --count=20 --prefix=wave2 --days=30
# 一波新人前缀用 wave2、wave3...避免和前一波冲突
```

**回收某人**:
```bash
npm run seed:reset
# 清空所有 f-* 前缀用户 + 订单(下次重启后端生效)
```

## 3. 邀请

群里发的格式(直接复制改 openid 即可):

```
【八字内测】
体验码:微信扫码图片(开发者工具预览二维码)
有效期:30 天
账号:已为你预开,扫码即可用,无需注册
反馈:小程序内「我的 → 意见反馈」或微信 @我
```

**白名单限制**:测试号最多 100 个微信号。先到 https://mp.weixin.qq.com/debug/cgi-bin/sandboxinfo 配白名单(扫码关注测试号)。

## 4. 收问题(每天)

1. **小程序侧**:看 `miniprogram/utils/request.js` 的 BASE_URL 指向 `http://localhost:8080`,熟人真机访问你电脑的 8080 端口需要:
   - **方案 A(最简单)**:你电脑 + 熟人手机在同一 WiFi,把 localhost 换成你电脑内网 IP,比如 `http://192.168.1.100:8080`
   - **方案 B**:用 frp / ngrok / Cloudflare Tunnel 暴露到公网,熟人扫码访问公网地址
2. **后端侧**:熟人遇到 500/timeout,直接看 `backend/logs/` 最近日志;AI 超时 5s 走本地降级模板,这是预期行为。
3. **LightRAG 侧**:遇到 RAG 引证空(knowledgeRetriever refs.length === 0),`curl http://localhost:9621/health` 查是否还在,docker logs lightrag-bazi 看注入日志。
4. **Mongo 侧**:遇到 401/403 异常,`docker exec bazi-mongo mongosh bazi --eval 'db.users.find().count()'` 查账号是否还在(可能被 reset 清过)。

## 5. 收摊(测试结束)

```bash
# 5.1 停后端(ctrl-c 或 kill)
# 5.2 停 LightRAG
docker stop lightrag-bazi
docker rm lightrag-bazi   # 不保留数据
# 保留数据(留作复盘):docker stop lightrag-bazi(留着容器)

# 5.3 停 Mongo
docker stop bazi-mongo    # 数据仍在 bazi-mongo 卷里
docker rm bazi-mongo      # 不保留数据
# 保留:docker stop bazi-mongo(留着容器)

# 5.4 清账户(防熟人扫码还能登录)
cd backend
npm run seed:reset

# 5.5 清 .env 里的 OPENAI_API_KEY(避免泄露)
```

## 已知坑

- **测试号有 100 白名单上限**:50 熟人 + 自测 + 家人预留白名单,刚好够。
- **AI 网关超时 5s**:后端自动降级到本地模板(标注「本地解读模板」),这是预期行为,不是 bug。
- **LightRAG 重启丢缓存**:docker restart lightrag-bazi 后 vdb 重建要 1-3 分钟,这期间 /four-school 引证为空是正常的。
- **Mongo 挂了后端直接拒连**:没有兜底 Mongo,但 entitlementRegistry 有 in-memory 兜底,所以即便 Mongo down,seed 过的账号还能用(直到后端重启)。
- **生成账号后必须重启后端**:`grantVip` 写的是内存 + Mongo,内存是 process-local;后端重启时从 Mongo 重新加载,所以 VIP 不会丢。

## 反馈收集

让熟人在小程序「我的 → 意见反馈」发消息;每周汇总到 `.codeartsdoer/specs/bazi_miniprogram/feedback/`。

## 退出条件

满足下面任一条件,收摊进正式商业化流程:
- 熟人反馈"愿意付钱" ≥ 5 人
- 熟人反馈"愿意推荐给朋友" ≥ 3 人
- 累计使用次数 ≥ 100 次

否则进第二轮内测(扩大朋友圈 / 换一批熟人 / 调产品功能)。