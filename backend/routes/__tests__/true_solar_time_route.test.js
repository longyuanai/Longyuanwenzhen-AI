// routes/__tests__/true_solar_time_route.test.js - 真太阳时的路由层契约
//
// 锁三件事：
//   ① 不传出生地时，响应与加这个功能之前完全一样（默认关闭，不惊动老客户端）
//   ② 传了出生地，/checkup 要能说清「改了哪几柱」——这是付费转化钩子
//   ③ 出生地写错要 400 报错，不能静默忽略（用户以为校正了，其实没有）
//
// 沿用 analysis_lang.test.js 的手工调用 layer 的方式，不引 supertest：
// /checkup 是免鉴权免 Mongo 的纯计算接口，起完整 HTTP 栈没有额外收益。

jest.mock('../../config', () => ({
  ai: { openai: { apiKey: '', baseUrl: 'http://test-openai', model: 'gpt-test' } },
  jwt: { secret: 'test-secret-must-be-long-enough-for-jwt-validation' }
}))

const router = require('../analysis')

async function invokePost(path, body = {}) {
  const ctx = {
    method: 'POST',
    url: path,
    headers: {},
    request: { body },
    state: {},
    status: 200,
    body: null,
    ip: '127.0.0.1',
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

const KASHGAR_BIRTH = { year: 2000, month: 6, day: 15, hour: 0, minute: 30, gender: 'male' }

describe('POST /checkup 真太阳时', () => {
  test('不传出生地：trueSolarTime 为 null，其余字段照旧', async () => {
    const ctx = await invokePost('/checkup', { birth: KASHGAR_BIRTH })
    expect(ctx.status).toBe(200)
    expect(ctx.body.data.trueSolarTime).toBeNull()
    expect(ctx.body.data.baziStr).toBe('庚辰 壬午 甲辰 甲子')
    expect(ctx.body.data.dayMaster).toBeTruthy()
    expect(ctx.body.data.oneLiner).toBeTruthy()
  })

  test('传出生地：给出偏移量、改变的柱、以及可读结论', async () => {
    const ctx = await invokePost('/checkup', {
      birth: { ...KASHGAR_BIRTH, birthPlace: '喀什' }
    })
    expect(ctx.status).toBe(200)

    const t = ctx.body.data.trueSolarTime
    expect(t.enabled).toBe(true)
    expect(t.place).toBe('喀什')
    expect(t.offsetMinutes).toBe(-176)
    expect(t.crossedDay).toBe(true)
    expect(t.comparable).toBe(true)
    // 跨日 → 日柱与时柱都变
    expect(t.changedPillars).toEqual(['day', 'hour'])
    expect(t.summary).toMatch(/喀什/)
    expect(t.summary).toMatch(/176/)

    // 盘本身也确实换了
    expect(ctx.body.data.baziStr).toBe('庚辰 壬午 癸卯 癸亥')
  })

  test('东部城市：有偏移但不改柱，措辞如实说明', async () => {
    const ctx = await invokePost('/checkup', {
      birth: { year: 1990, month: 5, day: 20, hour: 14, minute: 0, gender: 'female', birthPlace: '杭州' }
    })
    expect(ctx.status).toBe(200)
    const t = ctx.body.data.trueSolarTime
    expect(t.changedPillars).toEqual([])
    expect(t.summary).toMatch(/未改变四柱/)
  })

  test('lang=en 时结论走英文，且不混中文', async () => {
    const ctx = await invokePost('/checkup', {
      birth: { ...KASHGAR_BIRTH, longitude: 75.99 }, lang: 'en'
    })
    expect(ctx.status).toBe(200)
    const summary = ctx.body.data.trueSolarTime.summary
    expect(summary).toMatch(/True solar time/)
    expect(summary).not.toMatch(/[一-龥]/)
  })

  // 上一条传的是经度，天然没有中文可混。真正的坑是**传中文城市名**时
  // 英文句子里回落到 place 字段——实测就这么漏出去过（"at 乌鲁木齐"）。
  test('lang=en + 中文城市名：仍不得混入中文，用经度指代地点', async () => {
    const ctx = await invokePost('/checkup', {
      birth: { ...KASHGAR_BIRTH, birthPlace: '乌鲁木齐' }, lang: 'en'
    })
    expect(ctx.status).toBe(200)
    const summary = ctx.body.data.trueSolarTime.summary
    expect(summary).not.toMatch(/[一-龥]/)
    expect(summary).toMatch(/87\.62°E/)
    // place 字段本身仍返回中文原值，供中文端展示；只是不进英文句子
    expect(ctx.body.data.trueSolarTime.place).toBe('乌鲁木齐')
  })

  test('lang=zh + 只给经度：措辞不该出现裸的 °E 拼接', async () => {
    const ctx = await invokePost('/checkup', {
      birth: { ...KASHGAR_BIRTH, longitude: 75.99 }
    })
    expect(ctx.body.data.trueSolarTime.summary).toMatch(/按东经 75\.99°/)
  })

  test('未收录的出生地返回 400，不静默忽略', async () => {
    const ctx = await invokePost('/checkup', {
      birth: { ...KASHGAR_BIRTH, birthPlace: '瓦坎达' }
    })
    expect(ctx.status).toBe(400)
    expect(ctx.body.message).toMatch(/未收录出生地/)
  })

  test('直接给经度与给城市名等价', async () => {
    const a = await invokePost('/checkup', { birth: { ...KASHGAR_BIRTH, birthPlace: '喀什' } })
    const b = await invokePost('/checkup', { birth: { ...KASHGAR_BIRTH, longitude: 75.99 } })
    expect(b.status).toBe(200)
    expect(b.body.data.baziStr).toBe(a.body.data.baziStr)
  })

  test('校正后越界返回 400 而不是 500', async () => {
    const ctx = await invokePost('/checkup', {
      birth: { year: 1900, month: 1, day: 1, hour: 0, minute: 30, gender: 'male', birthPlace: '喀什' }
    })
    expect(ctx.status).toBe(400)
    expect(ctx.body.message).toMatch(/超出/)
  })

  test('/basic 也透传出生地（免费档就该能体现差异）', async () => {
    const plain = await invokePost('/basic', { birth: KASHGAR_BIRTH })
    const geo = await invokePost('/basic', { birth: { ...KASHGAR_BIRTH, birthPlace: '喀什' } })
    expect(plain.status).toBe(200)
    expect(geo.status).toBe(200)
    // /basic 不返回 baziStr，但 mingju 是从盘算出来的：跨日改了日柱，日主必变
    expect(plain.body.data.mingju.dayMaster.gan).toBe('甲')
    expect(geo.body.data.mingju.dayMaster.gan).toBe('癸')
  })

  test('/deep 等付费档同样透传（未付费时在鉴权处就返回，不影响本断言）', async () => {
    // 这里只验参数解构没漏掉 birthPlace：computeFromBirth 是所有档共用的入口，
    // 漏一个档就会出现「免费档按真太阳时、付费档按钟表时间」的错位。
    const src = require('fs').readFileSync(require.resolve('../analysis'), 'utf-8')
    expect(src).toMatch(/birthPlace,\s*longitude\s*\}\s*=\s*birth/)
    expect(src).toMatch(/paipan\(\{[^}]*birthPlace,\s*longitude[^}]*\}\)/)
  })
})
