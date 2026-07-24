// routes/__tests__/health.test.js - 健康检查路由测试
//
// 测试目标：
//   1. LightRAG 健康 → data.lightrag='up'
//   2. LightRAG 挂(ECONNREFUSED) → data.lightrag='down',整体仍 200
//   3. 返回结构稳定(backend/lightrag/timestamp)

jest.mock('axios')
const axios = require('axios')
const router = require('../health')

async function invokeGet(path) {
  const ctx = {
    method: 'GET',
    url: path,
    headers: {},
    state: {},
    status: 200,
    body: null,
    set: function () {}
  }
  const layer = router.stack.find(l => l.methods.includes('GET') && l.path === path)
  if (!layer) throw new Error(`路由未注册: ${path}`)
  const mws = layer.stack
  await mws[0](ctx, async () => {})
  return ctx
}

beforeEach(() => jest.clearAllMocks())

describe('GET /health', () => {
  test('LightRAG 健康 → lightrag: "up", 200', async () => {
    axios.get.mockResolvedValue({ status: 200 })
    const ctx = await invokeGet('/health')
    expect(ctx.status).toBe(200)
    expect(ctx.body.code).toBe(200)
    expect(ctx.body.data.backend).toBe('ok')
    expect(ctx.body.data.lightrag).toBe('up')
    expect(typeof ctx.body.data.timestamp).toBe('number')
  })

  test('LightRAG 挂(ECONNREFUSED) → lightrag: "down", 仍 200', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:9621'))
    const ctx = await invokeGet('/health')
    expect(ctx.status).toBe(200)  // 关键：健康检查 200,产品可继续工作
    expect(ctx.body.data.lightrag).toBe('down')
    expect(ctx.body.data.backend).toBe('ok')
  })

  test('LightRAG 返回非 200 → lightrag: "down", 仍 200', async () => {
    axios.get.mockResolvedValue({ status: 500 })
    const ctx = await invokeGet('/health')
    expect(ctx.body.data.lightrag).toBe('down')
  })

  test('请求打到了 LightRAG 的 /health 端点(而非别的路径)', async () => {
    axios.get.mockResolvedValue({ status: 200 })
    await invokeGet('/health')
    expect(axios.get.mock.calls[0][0]).toMatch(/\/health$/)
  })
})