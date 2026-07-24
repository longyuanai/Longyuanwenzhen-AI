// utils/__tests__/knowledgeRetriever.test.js - 古籍知识检索测试（mock HTTP，不依赖 LightRAG）
//
// 测试目标：
//   1. query 构造正确（拼出自然语言）
//   2. 成功响应正确解析 references/response
//   3. 服务挂/超时/网络错——优雅降级返回空数组，不抛错
//   4. 健康检查：通了报 true,挂了报 false
//   5. 错误参数容错

const axios = require('axios')
const { retrieve, buildQuery, healthCheck } = require('../knowledgeRetriever')
const { analyzeMingju } = require('../mingju')
const { paipan } = require('../bazi')

jest.mock('axios')

const MOCK_URL = 'http://test-lightrag:9621'

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }
const mingju = analyzeMingju(paipan(JIZHU))

describe('buildQuery - 自然语言查询构造', () => {
  test('机主盘（壬水身强）→ 完整拼出日主/身强/喜忌/格局/调候', () => {
    const q = buildQuery(mingju)
    expect(q).toContain('壬水')
    expect(q).toContain('身强')
    expect(q).toContain('喜用神')
    expect(q).toContain('忌神')
    expect(q).toContain('建禄格')
    expect(q).toContain('调候')
  })

  test('冬月盘调候含"喜火"', () => {
    // 1986-7-10 木日主身弱夏月 → 调候喜水;换冬月人为构造
    // 直接构造一个冬季 mingju 对象
    const winterMj = JSON.parse(JSON.stringify(mingju))
    winterMj.yongShen.tiaoHou = { season: '冬', need: ['火'], urgent: true, reason: '冬月气寒，喜火暖局' }
    const q = buildQuery(winterMj)
    expect(q).toContain('冬月调候喜火')
    expect(q).toContain('急用')
  })
})

describe('retrieve - HTTP 调用 + 降级', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('200 + references 数组 → 正确映射', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        response: 'summary text',
        references: [
          { content: '滴天髓：壬水…', file_path: '《滴天髓阐微》', score: 0.92 },
          { content: '穷通宝鉴：壬水生于亥月…', file_path: '《穷通宝鉴》', score: 0.85 }
        ]
      }
    })

    const r = await retrieve(mingju, { url: MOCK_URL })
    expect(r).toHaveLength(2)
    expect(r[0].content).toContain('滴天髓')
    expect(r[0].source).toBe('《滴天髓阐微》')
    expect(r[0].score).toBe(0.92)
    expect(r[1].source).toBe('《穷通宝鉴》')
  })

  test('200 + 只有 response 字符串 → 整体作为一条', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: { response: '综合解读段落（无结构化引用）' }
    })

    const r = await retrieve(mingju, { url: MOCK_URL })
    expect(r).toHaveLength(1)
    expect(r[0].content).toBe('综合解读段落（无结构化引用）')
    expect(r[0].source).toBe('LightRAG')
  })

  test('请求参数：mode=mix, top_k 来自 opts 或默认 5', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { response: 'x' } })

    await retrieve(mingju, { url: MOCK_URL })
    const call = axios.post.mock.calls[0]
    expect(call[0]).toBe(`${MOCK_URL}/query`)
    expect(call[1]).toMatchObject({ mode: 'mix', top_k: 5 })
    expect(call[1].query).toContain('壬水')

    // 自定义 topK
    await retrieve(mingju, { url: MOCK_URL, topK: 3 })
    const call2 = axios.post.mock.calls[1]
    expect(call2[1].top_k).toBe(3)
  })

  test('服务挂（ECONNREFUSED）→ 降级返回 []，不抛错', async () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:9621')
    axios.post.mockRejectedValue(err)

    const r = await retrieve(mingju, { url: MOCK_URL })
    expect(r).toEqual([])
    // 暴露 lastError 给运维/调用方排查
    const { lastError } = require('../knowledgeRetriever')
    expect(lastError).toContain('ECONNREFUSED')
  })

  test('超时 → 降级返回 []', async () => {
    axios.post.mockRejectedValue(new Error('timeout of 3000ms exceeded'))

    const r = await retrieve(mingju, { url: MOCK_URL, timeout: 3000 })
    expect(r).toEqual([])
  })

  test('500 响应 → 降级返回 []', async () => {
    axios.post.mockResolvedValue({
      status: 500,
      data: { error: 'internal' }
    })

    const r = await retrieve(mingju, { url: MOCK_URL })
    expect(r).toEqual([])
  })

  test('非法 mingju 参数 → 立即返回 []，不打 HTTP', async () => {
    const r1 = await retrieve(null)
    const r2 = await retrieve({})
    const r3 = await retrieve({ dayMaster: null })
    expect(r1).toEqual([])
    expect(r2).toEqual([])
    expect(r3).toEqual([])
    expect(axios.post).not.toHaveBeenCalled()
  })

  test('timeout 通过 opts 生效', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { response: 'x' } })
    await retrieve(mingju, { url: MOCK_URL, timeout: 1500 })
    expect(axios.post.mock.calls[0][2].timeout).toBe(1500)
  })

  // 【关键】opts.query 透传 —— 四家并列解读各家用自己的侧重查询语,
  // 否则 4 家检索同一 query → refs 完全相同,差异化卖点消失。
  test('opts.query 透传 → POST body 用透传 query 而非默认 buildQuery()', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { response: 'x' } })
    const customQuery = '徐乐吾派：从格局成败与调候用神链展开,壬水建禄'
    await retrieve(mingju, { url: MOCK_URL, query: customQuery })
    const postBody = axios.post.mock.calls[0][1]
    expect(postBody.query).toBe(customQuery)
    // 不应是默认 buildQuery() 的拼装
    expect(postBody.query).not.toContain('忌神为')  // 默认带,自定义不带
  })

  test('opts.query 缺省/空串 → 回落 buildQuery(mingju) 默认拼装', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { response: 'x' } })
    await retrieve(mingju, { url: MOCK_URL })
    const postBody = axios.post.mock.calls[0][1]
    expect(postBody.query).toContain('壬水')
    expect(postBody.query).toContain('建禄格')
  })
})

describe('healthCheck - 服务探活', () => {
  beforeEach(() => jest.clearAllMocks())

  test('GET /health 200 → true', async () => {
    axios.get.mockResolvedValue({ status: 200 })
    expect(await healthCheck({ url: MOCK_URL })).toBe(true)
  })

  test('GET 失败 → false，不抛', async () => {
    axios.get.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await healthCheck({ url: MOCK_URL })).toBe(false)
  })
})

describe('Redis 缓存层', () => {
  // mock redis 模块,让 getRedis() 命中 _redis
  const fakeRedis = {
    get: jest.fn(),
    set: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn()
  }
  beforeAll(() => {
    process.env.REDIS_URL = 'redis://test'
    jest.doMock('redis', () => ({
      createClient: () => fakeRedis
    }))
  })
  afterAll(() => {
    delete process.env.REDIS_URL
    jest.resetModules()
  })
  beforeEach(() => {
    fakeRedis.get.mockReset()
    fakeRedis.set.mockReset()
    jest.resetModules()
  })

  test('缓存命中 → 跳过 HTTP,直接返回缓存数组', async () => {
    fakeRedis.get.mockResolvedValue(JSON.stringify([{ content: 'cached-ref', source: 'cached-src' }]))
    axios.post.mockResolvedValue({ status: 200, data: { response: 'fresh' } })
    // 用 redis 重新 require 知识检索模块,触发 getRedis() 走 mock
    jest.isolateModules(() => {
      const { retrieve: r } = require('../knowledgeRetriever')
      return r(mingju, { url: MOCK_URL, query: 'cache-test-q1' }).then((result) => {
        expect(result).toEqual([{ content: 'cached-ref', source: 'cached-src' }])
        expect(axios.post).not.toHaveBeenCalled()
      })
    })
  })

  test('缓存未命中 → HTTP 后写缓存', async () => {
    fakeRedis.get.mockResolvedValue(null)
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        references: [{ content: 'fresh-ref', file_path: 'src-x' }]
      }
    })
    fakeRedis.set.mockResolvedValue(undefined)
    jest.isolateModules(() => {
      const isolatedAxios = require('axios')
      jest.spyOn(isolatedAxios, 'post').mockResolvedValue({
        status: 200,
        data: { references: [{ content: 'fresh-ref', file_path: 'src-x' }] }
      })
      const { retrieve: r } = require('../knowledgeRetriever')
      return r(mingju, { url: MOCK_URL, query: 'cache-test-q2' }).then((result) => {
        expect(result).toEqual([{ content: 'fresh-ref', source: 'src-x' }])
        expect(isolatedAxios.post).toHaveBeenCalled()
        expect(fakeRedis.set).toHaveBeenCalledWith(
          expect.stringMatching(/^lrag:[a-f0-9]{40}$/),
          JSON.stringify(result),
          { EX: 300 }
        )
      })
    })
  })

  test('缓存命中 JSON 损坏 → 当未命中处理', async () => {
    fakeRedis.get.mockResolvedValue('not-json{{{')
    axios.post.mockResolvedValue({ status: 200, data: { response: 'fallback' } })
    fakeRedis.set.mockResolvedValue(undefined)
    jest.isolateModules(() => {
      const isolatedAxios = require('axios')
      jest.spyOn(isolatedAxios, 'post').mockResolvedValue({
        status: 200, data: { response: 'fallback' }
      })
      const { retrieve: r } = require('../knowledgeRetriever')
      return r(mingju, { url: MOCK_URL, query: 'cache-test-q3' }).then((result) => {
        expect(result).toEqual([{ content: 'fallback', source: 'LightRAG' }])
        expect(isolatedAxios.post).toHaveBeenCalled()
      })
    })
  })
})