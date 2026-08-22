// utils/__tests__/localFallback.test.js - 本地降级模板测试
//
// 防回归：21 秒假死(P0 #30)修了之后,降级模板必须能用且内容有信息密度。
// 关键校验:
//   1. 三函数不抛错 + 返回非空字符串
//   2. 输出含 mingju 的确定性结论(喜用神/忌神/日主)——不是空壳
//   3. 四家并列输出 4 段不同学派标题——保住产品差异化护城河
//   4. 开头明确标注「本地解读模板」——用户知情

const { paipan } = require('../bazi')
const { analyzeMingju } = require('../mingju')
const {
  buildBasicFallback,
  buildDeepFallback,
  buildFourSchoolFallback
} = require('../localFallback')

const JIZHU = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }
const mingju = analyzeMingju(paipan(JIZHU))
const baziStr = '壬午 辛亥 壬辰 乙巳'
const dayunStr = '甲寅 乙卯 丙辰 丁巳'

describe('localFallback - 基础解读降级', () => {
  test('返回非空字符串', () => {
    const s = buildBasicFallback({ baziStr, mingju })
    expect(typeof s).toBe('string')
    expect(s.length).toBeGreaterThan(50)
  })

  test('开头标注「本地解读模板」让用户知情', () => {
    const s = buildBasicFallback({ baziStr, mingju })
    expect(s.startsWith('【本地解读模板】')).toBe(true)
  })

  test('包含 mingju 的确定性结论(喜用神/忌神/日主/格局)', () => {
    const s = buildBasicFallback({ baziStr, mingju })
    expect(s).toContain('壬')
    expect(s).toContain('水')
    expect(s).toMatch(/喜用神.*[木火土金水]/)
    expect(s).toContain('建禄格')
  })

  test('包含免责声明(对齐 promptBuilder 的 COMMON_RULES)', () => {
    const s = buildBasicFallback({ baziStr, mingju })
    expect(s).toContain(mingju.disclaimer)
  })
})

describe('localFallback - 深度报告降级', () => {
  test('返回非空字符串', () => {
    const s = buildDeepFallback({ baziStr, dayunStr, mingju })
    expect(s.length).toBeGreaterThan(100)
  })

  test('包含 5 大模块标题(命局/事业/感情/健康/建议)', () => {
    const s = buildDeepFallback({ baziStr, dayunStr, mingju })
    expect(s).toContain('一、命局总评')
    expect(s).toContain('二、事业财运')
    expect(s).toContain('三、感情婚姻')
    expect(s).toContain('四、健康运势')
    expect(s).toContain('五、人生建议')
  })

  test('包含大运序列与 mingju 关键字段', () => {
    const s = buildDeepFallback({ baziStr, dayunStr, mingju })
    expect(s).toContain('甲寅')
    expect(s).toContain('建禄格')
  })
})

describe('localFallback - 四家并列降级(差异化护城河关键)', () => {
  test('返回非空字符串', () => {
    const s = buildFourSchoolFallback({ baziStr, dayunStr, mingju })
    expect(s.length).toBeGreaterThan(200)
  })

  test('四家标题齐全且互不相同(保住差异化卖点)', () => {
    const s = buildFourSchoolFallback({ baziStr, dayunStr, mingju })
    expect(s).toContain('徐乐吾派')
    expect(s).toContain('梁湘润派')
    expect(s).toContain('袁树珊派')
    expect(s).toContain('韦千里派')
    expect(s).toContain('格局·调候·体用')
    expect(s).toContain('三轨·金不换·神煞')
    expect(s).toContain('命宫·小限·纳音')
    expect(s).toContain('八步法')
  })

  test('包含四家综合判断与 mingju 关键字段', () => {
    const s = buildFourSchoolFallback({ baziStr, dayunStr, mingju })
    expect(s).toContain('四家综合判断')
    expect(s).toContain('建禄格')
    expect(s).toContain('壬')
  })

  test('四家内容彼此不同(防止「共用一段换 4 个名字」退化)', () => {
    const s = buildFourSchoolFallback({ baziStr, dayunStr, mingju })
    const xu = s.match(/【徐乐吾派】[\s\S]*?【梁湘润派】/)[0]
    const liang = s.match(/【梁湘润派】[\s\S]*?【袁树珊派】/)[0]
    const yuan = s.match(/【袁树珊派】[\s\S]*?【韦千里派】/)[0]
    const wei = s.match(/【韦千里派】[\s\S]*?★ 四家综合判断/)[0]
    expect(xu).not.toBe(liang)
    expect(liang).not.toBe(yuan)
    expect(yuan).not.toBe(wei)
    expect(xu).not.toBe(wei)
  })
})

describe('localFallback - 与 promptBuilder 的基本事实一致性', () => {
  test('basic 与 deep 都包含 mingju.basis 全部条目', () => {
    const basis = mingju.basis.join('；')
    const basicS = buildBasicFallback({ baziStr, mingju })
    const deepS = buildDeepFallback({ baziStr, dayunStr, mingju })
    expect(basicS).toContain(basis)
    expect(deepS).toContain(basis)
  })
})

describe('五行分值格式化', () => {
  // 回归：曾直接 JSON.stringify(wuxingScore)，把浮点噪声原样吐给用户
  // （「火:15.599999999999998」），且大括号引号出现在正文里。
  const { paipan } = require('../bazi')
  const { analyzeMingju } = require('../mingju')
  const pp = paipan({ year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' })
  const mingju = analyzeMingju(pp)
  const baziStr = '壬午 辛亥 壬辰 乙巳'

  test('不出现原始 JSON 与超长小数', () => {
    const out = buildBasicFallback({ baziStr, mingju })
    expect(out).not.toMatch(/\{"[木火土金水]"/)
    expect(out).not.toMatch(/\d\.\d{4,}/)
  })

  test('分值保留一位小数，可读', () => {
    const out = buildBasicFallback({ baziStr, mingju })
    expect(out).toMatch(/五行分值:.*木 \d+\.\d/)
  })
})
