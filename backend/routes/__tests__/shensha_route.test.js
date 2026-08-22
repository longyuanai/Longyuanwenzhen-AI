// routes/__tests__/shensha_route.test.js - 神煞的路由层契约
//
// 锁三件事：
//   ① /checkup 免费档就返回神煞与命宫身宫（纯查表，不花 AI token）
//   ② lang=en 时**面向英文读者的字段**一个中文都不许有 ——
//      干支尤其容易漏，「癸丑」直接塞进英文页面等于没翻译
//   ③ name 字段永远是中文原名，英文放 nameEn（新增字段而非替换，
//      小程序绑的是 name，改键名会直接把它打断）

jest.mock('../../config', () => ({
  ai: { openai: { apiKey: '', baseUrl: 'http://test-openai', model: 'gpt-test' } },
  jwt: { secret: 'test-secret-must-be-long-enough-for-jwt-validation' }
}))

const router = require('../analysis')

async function invokePost(path, body = {}) {
  const ctx = {
    method: 'POST', url: path, headers: {}, request: { body },
    state: {}, status: 200, body: null, ip: '127.0.0.1', set: function () {}
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

const GOLDEN = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }
const hasChinese = (s) => /[一-龥]/.test(String(s))

describe('POST /checkup 神煞', () => {
  test('返回命宫、身宫、空亡与神煞列表', async () => {
    const ctx = await invokePost('/checkup', { birth: GOLDEN })
    expect(ctx.status).toBe(200)
    const s = ctx.body.data.shenSha

    expect(s.mingGong.ganZhi).toBe('癸丑')
    expect(s.shenGong.ganZhi).toBe('乙巳')
    expect(s.kongWang).toEqual(['午', '未'])
    expect(s.list.length).toBeGreaterThan(0)
    expect(s.note).toMatch(/不作主要断法/)
  })

  test('中文档：name 与 meaning 是中文，标签用「年柱」这类中文柱名', async () => {
    const ctx = await invokePost('/checkup', { birth: GOLDEN })
    const s = ctx.body.data.shenSha
    const ty = s.list.find((x) => x.name === '天乙贵人')
    expect(ty).toBeDefined()
    expect(ty.pillarLabels).toEqual(['时柱'])
    expect(hasChinese(ty.meaning)).toBe(true)
  })

  test('英文档：所有面向英文读者的字段无中文残留（含干支）', async () => {
    const ctx = await invokePost('/checkup', { birth: GOLDEN, lang: 'en' })
    const s = ctx.body.data.shenSha

    const facing = [
      s.mingGong.label, s.mingGong.ganZhiEn,
      s.shenGong.label, s.shenGong.ganZhiEn,
      s.note, ...s.kongWangEn
    ]
    for (const x of s.list) facing.push(x.nameEn, x.meaning, ...x.pillarLabels)

    for (const text of facing) {
      expect(hasChinese(text)).toBe(false)
    }
    // 干支确实翻译过了，不是碰巧没中文
    expect(s.mingGong.ganZhiEn).toMatch(/Gui-Chou/)
    expect(s.kongWangEn).toEqual(['Wu (Horse)', 'Wei (Goat)'])
  })

  test('英文档仍保留中文原名与原干支，供索引与中文端复用', async () => {
    const ctx = await invokePost('/checkup', { birth: GOLDEN, lang: 'en' })
    const s = ctx.body.data.shenSha
    expect(s.mingGong.ganZhi).toBe('癸丑')       // 原值不变
    expect(s.kongWang).toEqual(['午', '未'])
    expect(s.list.every((x) => hasChinese(x.name))).toBe(true)
  })

  test('多个盘抽样：英文档从不漏中文', async () => {
    const cases = [
      { year: 1955, month: 3, day: 7, hour: 4, minute: 0, gender: 'female' },
      { year: 1984, month: 2, day: 4, hour: 23, minute: 0, gender: 'male' },
      { year: 2077, month: 9, day: 9, hour: 17, minute: 0, gender: 'female' }
    ]
    for (const birth of cases) {
      const ctx = await invokePost('/checkup', { birth, lang: 'en' })
      const s = ctx.body.data.shenSha
      for (const x of s.list) {
        expect(hasChinese(x.nameEn)).toBe(false)
        expect(hasChinese(x.meaning)).toBe(false)
        for (const p of x.pillarLabels) expect(hasChinese(p)).toBe(false)
      }
      expect(hasChinese(s.mingGong.ganZhiEn)).toBe(false)
    }
  })

  test('真太阳时改盘时，神煞跟着改（用的是校正后的四柱）', async () => {
    const plain = await invokePost('/checkup', {
      birth: { year: 2000, month: 6, day: 15, hour: 0, minute: 30, gender: 'male' }
    })
    const geo = await invokePost('/checkup', {
      birth: { year: 2000, month: 6, day: 15, hour: 0, minute: 30, gender: 'male', birthPlace: '喀什' }
    })
    // 跨日改了日柱，空亡按日柱推，必然不同
    expect(geo.body.data.shenSha.kongWang).not.toEqual(plain.body.data.shenSha.kongWang)
  })
})
