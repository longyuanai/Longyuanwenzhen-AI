// utils/__tests__/aiUsage.test.js - AI token 埋点
//
// 埋点的第一要求是「绝不影响业务」：脏数据、缺字段、logger 抛错都不能
// 让解读请求失败。第二要求才是数据正确。这里两条都测。

const aiUsage = require('../aiUsage')

beforeEach(() => {
  aiUsage._reset()
})

describe('record - 健壮性（埋点不能拖垮业务）', () => {
  test('缺 usage 字段不抛错', () => {
    expect(() => aiUsage.record({ type: 'basic', lang: 'zh', model: 'm', ms: 100 })).not.toThrow()
  })

  test('参数全缺不抛错', () => {
    expect(() => aiUsage.record({})).not.toThrow()
    expect(() => aiUsage.record()).not.toThrow()
  })

  test('usage 里是脏值不抛错，且不污染统计', () => {
    aiUsage.record({
      type: 'deep', lang: 'zh', model: 'm', ms: 'abc',
      usage: { prompt_tokens: 'x', completion_tokens: null, total_tokens: undefined }
    })
    const s = aiUsage.summary()
    expect(s[0].totalTokens).toBe(0)
    expect(s[0].ms).toBe(0)
    expect(Number.isNaN(s[0].avgMs)).toBe(false)
  })
})

describe('summary - 统计正确', () => {
  test('按 type/lang/model 分组累计', () => {
    const usage = { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }
    aiUsage.record({ type: 'deep', lang: 'zh', model: 'gpt-4', usage, ms: 1000 })
    aiUsage.record({ type: 'deep', lang: 'zh', model: 'gpt-4', usage, ms: 3000 })
    aiUsage.record({ type: 'deep', lang: 'en', model: 'gpt-4', usage, ms: 2000 })

    const s = aiUsage.summary()
    const zh = s.find((x) => x.lang === 'zh')
    const en = s.find((x) => x.lang === 'en')

    expect(zh.calls).toBe(2)
    expect(zh.totalTokens).toBe(600)
    expect(zh.avgMs).toBe(2000)
    expect(en.calls).toBe(1)
  })

  test('降级调用计次但不计 token（没真的消耗）', () => {
    aiUsage.record({
      type: 'basic', lang: 'zh', model: 'm', ms: 5000, fallback: true
    })
    aiUsage.record({
      type: 'basic', lang: 'zh', model: 'm', ms: 1000,
      usage: { prompt_tokens: 500, completion_tokens: 500, total_tokens: 1000 }
    })

    const s = aiUsage.summary()[0]
    expect(s.calls).toBe(2)
    expect(s.fallbacks).toBe(1)
    expect(s.totalTokens).toBe(1000)
    // 均值按真实调用数算，不能被降级次数稀释
    expect(s.avgTotalTokens).toBe(1000)
  })

  test('全是降级时均值为 0 而非除零得 NaN', () => {
    aiUsage.record({ type: 'deep', lang: 'zh', model: 'm', ms: 100, fallback: true })
    const s = aiUsage.summary()[0]
    expect(s.avgTotalTokens).toBe(0)
    expect(Number.isFinite(s.avgTotalTokens)).toBe(true)
  })

  test('按总 token 降序，贵的排前面', () => {
    aiUsage.record({
      type: 'basic', lang: 'zh', model: 'm',
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }, ms: 1
    })
    aiUsage.record({
      type: 'four-school', lang: 'zh', model: 'm',
      usage: { prompt_tokens: 8000, completion_tokens: 2000, total_tokens: 10000 }, ms: 1
    })
    expect(aiUsage.summary()[0].type).toBe('four-school')
  })

  test('_reset 清空', () => {
    aiUsage.record({ type: 'deep', lang: 'zh', model: 'm', ms: 1 })
    expect(aiUsage.summary()).toHaveLength(1)
    aiUsage._reset()
    expect(aiUsage.summary()).toHaveLength(0)
  })
})

describe('日志行格式（report 脚本按此解析）', () => {
  const logger = require('../logger')

  test('输出 key=value 结构化行，含 LOG_TAG', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => {})
    aiUsage.record({
      type: 'four-school', lang: 'en', model: 'gpt-4', ms: 1234,
      usage: { prompt_tokens: 8000, completion_tokens: 1500, total_tokens: 9500 }
    })

    const line = spy.mock.calls[0][0]
    expect(line).toContain(aiUsage.LOG_TAG)
    expect(line).toContain('type=four-school')
    expect(line).toContain('lang=en')
    expect(line).toContain('model=gpt-4')
    expect(line).toContain('fallback=0')
    expect(line).toContain('prompt_tokens=8000')
    expect(line).toContain('total_tokens=9500')
    spy.mockRestore()
  })

  test('降级行标记 fallback=1 且不带 token 字段', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => {})
    aiUsage.record({ type: 'deep', lang: 'zh', model: 'm', ms: 5000, fallback: true })

    const line = spy.mock.calls[0][0]
    expect(line).toContain('fallback=1')
    expect(line).not.toContain('prompt_tokens=')
    spy.mockRestore()
  })
})
