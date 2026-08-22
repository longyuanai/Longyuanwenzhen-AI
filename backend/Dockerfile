# backend/Dockerfile - 后端服务镜像
#
# 目标是把 docs/friend-test-runbook.md 里那串手敲的 docker 命令固化下来，
# 让「起环境」从一串步骤变成一条命令。
#
# 构建（在仓库根目录执行，因为要带上 miniprogram/config.js —— 后端的
# preflight 自检会读它）：
#   docker build -f backend/Dockerfile -t bazi-backend .
#
# 通常不用手敲，走 docker compose up 即可。

FROM node:18-alpine

# dumb-init：让容器里的 node 能正确收到 SIGTERM，docker stop 时优雅退出
# 而不是被 SIGKILL 砍掉（否则日志写一半、Mongo 连接不释放）
RUN apk add --no-cache dumb-init

WORKDIR /app/backend

# 先只拷依赖清单，让 npm ci 这层能被 Docker 缓存 —— 改业务代码不必重装依赖
COPY backend/package.json backend/package-lock.json ./
# npm ci 严格按 lockfile 装（lockfile 的 resolved 已全部指向公共 registry，
# 见 git 历史：曾锁在 npmmirror 导致镜像不可达处装不上）
RUN npm ci --omit=dev && npm cache clean --force

COPY backend/ ./
# preflight 自检要读小程序配置（客服微信号、API 地址是否还是占位值）
COPY miniprogram/config.js /app/miniprogram/config.js

# 日志目录：log4js 启动即写，不存在会直接抛
RUN mkdir -p logs && chown -R node:node /app

# 不用 root 跑
USER node

EXPOSE 8080

# 健康检查用自己的 /health（LightRAG 挂了仍返 200，这是刻意设计 ——
# 产品健康 ≠ 全部组件健康，不能因为 RAG 没起就判服务不可用）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:8080/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "app.js"]
