// routes/__tests__/analysis_lang.test.js - 解读接口的 lang 分发
//
// 英文链路的模块写好了不等于接通了：路由不认 lang 的话，那些文件就只是
// 躺在仓库里没人调用。这里锁死三件事：
//   1. lang=en 走英文提示词，lang 缺省/非法回落中文
//   2. AI 失败时降级模板也跟着语言走（不能中文页面吐英文兜底，反之亦然）
//   3. 免费的 /basic 也支持 lang（英文市场的入口就是免费档）

jest.mock('axios')

const axios = require('axios')
const mongoose = require('mongoose')

jest.mock('../../config', () => ({
  ai: { openai: { apiKey: 'test-key', baseUrl: 'http://test-openai', model: 'gpt-test' } },
  jwt: { secret: 'test-secret-must-be-long-enough-for-jwt-validation' }
}))

const router = require('../analysis')

function authFor(userId) {
  const jwt = require('jsonwebtoken')
  const config = require('../../config')
  return `Bearer ${jwt.sign({ userId, openid: 'o' + userId }, config.jwt.secret, { expiresIn: '1h' })}`
}

async function invokePost(path, body = {}, authHeader = null) {
  const ctx = {
    method: 'POST',
    url: path,
    headers: authHeader ? { authorization: authHeader } : {},
    request: { body },
    state: {},
    status: 200,
    body: null,
    set: function () {}
  }
  const layer = router.stack.find((l) => l.methods.includes('POST') && l.path === path)
  if (!layer) throw new Error(`路由未注册: ${path}`)
  let i = 0
  async function next() {
    if (i >= layer.stack.length) return
    await layer.stack[i++](ctx, next)
  }
  await next()
  return ctx
}

const BIRTH = { year: 2002, month: 11, day: 20, hour: 10, gender: 'male' }

// 捕获实际发给模型的提示词
function lastPrompt() {
  const call = axios.post.mock.calls[axios.post.mock.calls.length - 1]
  return call[1].messages.find((m) => m.role === 'user').content
}
function lastSystem() {
  const call = axios.post.mock.calls[axios.post.mock.calls.length - 1]
  return call[1].messages.find((m) => m.role === 'system').content
}

function mockAiOk(text) {
  axios.post.mockResolvedValue({ data: { choices: [{ message: { content: text } }] } })
}
function mockAiFail() {
  axios.post.mockRejectedValue(new Error('gateway down'))
}

beforeEach(() => {
  mongoose.connection.readyState = 1
  axios.post.mockReset()
})

describe('POST /basic - lang 分发', () => {
  test('lang=en 走英文提示词与英文 system prompt', async () => {
    mockAiOk('English reading.')
    const ctx = await invokePost('/basic', { birth: BIRTH, lang: 'en' })

    expect(ctx.status).toBe(200)
    expect(lastPrompt()).toContain('Four Pillars:')
    expect(lastPrompt()).toContain('SYSTEM-COMPUTED CONCLUSIONS')
    expect(lastPrompt()).toContain('Ren (Yang Water)')
    expect(lastSystem()).toContain('English')
  })

  test('缺省 lang 走中文', async () => {
    mockAiOk('中文解读。')
    await invokePost('/basic', { birth: BIRTH })

    expect(lastPrompt()).toContain('八字：')
    expect(lastPrompt()).toContain('【以下为系统确定性计算的命理结论')
    expect(lastSystem()).toContain('八字命理师')
  })

  test('非法 lang 回落中文，而不是报错', async () => {
    mockAiOk('中文解读。')
    const ctx = await invokePost('/basic', { birth: BIRTH, lang: 'klingon' })

    expect(ctx.status).toBe(200)
    expect(lastPrompt()).toContain('八字：')
  })

  test('带地区码的 en-US 也识别为英文', async () => {
    mockAiOk('English reading.')
    await invokePost('/basic', { birth: BIRTH, lang: 'en-US' })
    expect(lastPrompt()).toContain('Four Pillars:')
  })

  test('大写 EN 也识别', async () => {
    mockAiOk('English reading.')
    await invokePost('/basic', { birth: BIRTH, lang: 'EN' })
    expect(lastPrompt()).toContain('Four Pillars:')
  })
})

describe('AI 失败时降级模板跟随语言', () => {
  test('lang=en 降级到英文模板，不吐中文', async () => {
    mockAiFail()
    const ctx = await invokePost('/basic', { birth: BIRTH, lang: 'en' })

    expect(ctx.status).toBe(200)
    const content = ctx.body.data.content
    expect(content).toContain('Offline template')
    expect(content).toContain('Favorable elements')
    // 正文不能有中文（技术依据附录除外）
    expect(content.split('Technical derivation')[0]).not.toMatch(/[一-龥]/)
  })

  test('中文请求降级到中文模板，不吐英文', async () => {
    mockAiFail()
    const ctx = await invokePost('/basic', { birth: BIRTH })

    const content = ctx.body.data.content
    expect(content).toContain('本地解读模板')
    expect(content).not.toContain('Offline template')
  })
})

describe('付费档也支持 lang', () => {
  // 这几个档需要鉴权 + 权益，这里只验证 lang 参数被正确读取并影响提示词。
  // 权益校验本身由 analysis_deep / analysis_four_school 等测试覆盖。
  const reg = require('../../utils/entitlementRegistry')

  beforeEach(() => {
    reg._reset()
  })

  test('/deep lang=en 走英文提示词', async () => {
    await reg.registerOrderPaid('u-en', 'deep_report')
    mockAiOk('English deep report.')
    const ctx = await invokePost('/deep', { birth: BIRTH, lang: 'en' }, authFor('u-en'))

    expect(ctx.status).toBe(200)
    expect(lastPrompt()).toContain('Luck Pillars')
    expect(lastPrompt()).toContain('Cover these five sections')
  })

  test('/four-school lang=en 用方法论命名而非人名领衔', async () => {
    await reg.registerOrderPaid('u-fs', 'four_school')
    mockAiOk('English four-school reading.')
    const ctx = await invokePost('/four-school', { birth: BIRTH, lang: 'en' }, authFor('u-fs'))

    expect(ctx.status).toBe(200)
    const p = lastPrompt()
    // 英文读者不认识这四位大师，标题必须方法论在前、人名作出处
    expect(p).toContain('Structural & Climatic Method')
    expect(p).toContain('Eight-Step Method')
    expect(p).toContain('after Xu Leyu')
    expect(p).toContain('FOUR PARALLEL READINGS')
    expect(p).toContain('Do not assume the reader has heard of any of them')
  })

  test('/dayun-full lang=en 走英文提示词并解释 Da Yun 概念', async () => {
    await reg.registerOrderPaid('u-df', 'dayun_full')
    mockAiOk('English dayun overview.')
    const ctx = await invokePost('/dayun-full', { birth: BIRTH, lang: 'en' }, authFor('u-df'))

    expect(ctx.status).toBe(200)
    const p = lastPrompt()
    expect(p).toContain('Luck Pillars')
    expect(p).toContain('not events that will happen') // 合规调性
    expect(p).not.toMatch(/岁/)                          // 年龄区间已去中文
  })

  test('/dayun-segment lang=en 走英文提示词', async () => {
    await reg.registerOrderPaid('u-ds', 'dayun_segment')
    mockAiOk('English segment reading.')
    const ctx = await invokePost(
      '/dayun-segment',
      { birth: BIRTH, segmentIndex: 2, lang: 'en' },
      authFor('u-ds')
    )

    expect(ctx.status).toBe(200)
    const p = lastPrompt()
    expect(p).toContain('ONE 10-year luck period')
    // 英文撰写的字段不能带「岁」（ageRange 已过术语表）。
    // 注意 basis 判据句是**刻意保留**的中文，由模型转述，不在此列 ——
    // 所以只校验英文行，不能对整段提示词断言无中文。
    const agesLine = p.split('\n').find((l) => l.startsWith('Ages covered:'))
    expect(agesLine).toBeDefined()
    expect(agesLine).not.toMatch(/岁/)
    expect(p).toMatch(/1\. The overall tone of ages [\d-]+ \(/)
  })
})
