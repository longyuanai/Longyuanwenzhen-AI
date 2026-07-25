// middleware/__tests__/auth.test.js - JWT 鉴权中间件测试
const jwt = require('jsonwebtoken')
const config = require('../../config')
const { authRequired, extractToken } = require('../auth')

// 用与中间件相同的密钥签发，保证一致（测试环境为 dev 回退密钥）
function tokenFor(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: '1h' })
}

function makeCtx(authHeader) {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    state: {},
    status: 200,
    body: null
  }
}

describe('extractToken', () => {
  test('解析 Bearer token', () => {
    expect(extractToken(makeCtx('Bearer abc.def.ghi'))).toBe('abc.def.ghi')
  })
  test('无头或非 Bearer 返回 null', () => {
    expect(extractToken(makeCtx())).toBeNull()
    expect(extractToken(makeCtx('Basic xxx'))).toBeNull()
  })
})

describe('authRequired', () => {
  test('合法 token 写入 ctx.state.user 并放行', async () => {
    const ctx = makeCtx(`Bearer ${tokenFor({ userId: 'u123', openid: 'o1' })}`)
    const next = jest.fn(async () => {})
    await authRequired(ctx, next)
    expect(next).toHaveBeenCalled()
    // role 未签进 token 时降级为最低权限 'user'（不是省略字段：
    // access.js 的 roleRequired 依赖它，缺字段会让角色分支静默失效）
    expect(ctx.state.user).toEqual({ userId: 'u123', openid: 'o1', role: 'user' })
  })

  test('token 里的 role 被透传给下游中间件', async () => {
    const ctx = makeCtx(`Bearer ${tokenFor({ userId: 'u9', openid: 'o9', role: 'admin' })}`)
    const next = jest.fn(async () => {})
    await authRequired(ctx, next)
    expect(next).toHaveBeenCalled()
    expect(ctx.state.user.role).toBe('admin')
  })

  test('缺 token → 401 且不放行', async () => {
    const ctx = makeCtx()
    const next = jest.fn(async () => {})
    await authRequired(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(401)
  })

  test('非法 token → 401', async () => {
    const ctx = makeCtx('Bearer not.a.jwt')
    const next = jest.fn(async () => {})
    await authRequired(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(401)
  })

  test('payload 缺 userId → 401', async () => {
    const ctx = makeCtx(`Bearer ${tokenFor({ openid: 'o1' })}`)
    const next = jest.fn(async () => {})
    await authRequired(ctx, next)
    expect(next).not.toHaveBeenCalled()
    expect(ctx.status).toBe(401)
  })
})
