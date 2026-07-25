// 八字排盘引擎测试集
//
// 黄金基准来源（按可信度排序）：
//   1. 机主本人盘（壬午/辛亥/壬辰/乙巳，2002-11-20 巳时男）——已知确准，最高权威
//   2. lunar-javascript 库——精确处理节气分月/立春分年/晚子时/起运
//
// ⚠️ 重要：spec.md 的验收用例 [1990-01-01]→[...癸亥日] 经核验为【错误】。
//   库计算 + 与机主已知盘交叉验证，结果为 丙寅日。
//   测试以核验后的 丙寅 为准，spec 文档需同步修正（详见 README/spec 修订说明）。

const { paipan, validateInput, MIN_YEAR, MAX_YEAR } = require('../bazi')

describe('paipan - 四柱排盘准确性', () => {
  // 机主本人盘：最高权威黄金基准
  test('机主本人盘 2002-11-20 巳时男 → 壬午 辛亥 壬辰 乙巳', () => {
    // Arrange & Act
    const r = paipan({ year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' })

    // Assert
    expect(r.yearPillar).toEqual({ gan: '壬', zhi: '午' })
    expect(r.monthPillar).toEqual({ gan: '辛', zhi: '亥' })
    expect(r.dayPillar).toEqual({ gan: '壬', zhi: '辰' })
    expect(r.hourPillar).toEqual({ gan: '乙', zhi: '巳' })
  })

  test('1990-01-01 12:00 男 → 己巳年 丙子月 丙寅日（修正 spec 错误的 癸亥）', () => {
    const r = paipan({ year: 1990, month: 1, day: 1, hour: 12, minute: 0, gender: 'male' })

    expect(r.yearPillar.gan + r.yearPillar.zhi).toBe('己巳')
    expect(r.monthPillar.gan + r.monthPillar.zhi).toBe('丙子')
    // spec 写的是“癸亥日”，核验为错误；库与机主盘交叉验证均为“丙寅日”
    expect(r.dayPillar.gan + r.dayPillar.zhi).toBe('丙寅')
  })

  test('晚子时 23:30 归入子时（对齐 spec 5.1.2）', () => {
    const r = paipan({ year: 2000, month: 1, day: 1, hour: 23, minute: 30, gender: 'female' })
    expect(r.hourPillar.zhi).toBe('子')
  })
})

describe('paipan - 大运（节气精算）', () => {
  test('机主大运顺行，且 27-36 岁为甲寅（对应“28岁交甲寅大运”）', () => {
    const r = paipan({ year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' })

    expect(r.daYun.isForward).toBe(true)
    // daYunList[0] 应为真实第一步（已过滤起运前占位段），非空干支
    expect(r.daYun.daYunList[0].ganZhi).toBeTruthy()

    const jiaYin = r.daYun.daYunList.find(d => d.ganZhi === '甲寅')
    expect(jiaYin).toBeDefined()
    expect(jiaYin.ageStart).toBe(27)
    expect(jiaYin.ageEnd).toBe(36)
  })

  // startAge 是小程序结果页直接绑定的字段。本地简化算法把它写死成 1 岁，
  // 导致 8 步大运的年龄区间整体偏移；服务端必须给出按节气精算的真实值。
  test('startAge 为节气精算的起运年龄，且等于第一步大运起始年龄', () => {
    const r = paipan({ year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' })
    expect(r.daYun.startAge).toBe(7)
    expect(r.daYun.startAge).toBe(r.daYun.daYunList[0].ageStart)
    expect(r.daYun.startAge).not.toBe(1) // 不能是本地兜底那个写死值
  })

  test('大运列表已过滤起运前占位段（无空干支）', () => {
    const r = paipan({ year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' })
    r.daYun.daYunList.forEach(d => {
      expect(d.ganZhi).toMatch(/^.{2}$/)
      expect(d.gan).toBeTruthy()
      expect(d.zhi).toBeTruthy()
    })
  })
})

describe('paipan - 输出结构完整性', () => {
  test('包含十神、藏干、五行、input 字段', () => {
    const r = paipan({ year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' })

    expect(r.tenGods.dayGan).toBe('日主')
    expect(r.tenGods.yearGan).toBeTruthy()
    expect(Array.isArray(r.cangGan.year)).toBe(true)
    expect(r.wuxing.dayGan).toBe('水') // 壬 → 水
    expect(r.input.gender).toBe('male')
  })
})

describe('paipan - 异常输入应抛 INVALID_INPUT', () => {
  test('年份超出范围', () => {
    expect(() => paipan({ year: 1800, month: 1, day: 1, hour: 0, gender: 'male' }))
      .toThrow(/暂不支持该日期范围/)
  })

  test('非法性别', () => {
    try {
      paipan({ year: 2000, month: 1, day: 1, hour: 0, gender: 'x' })
      throw new Error('应当抛出异常')
    } catch (e) {
      expect(e.code).toBe('INVALID_INPUT')
    }
  })

  test('小时越界 25', () => {
    expect(() => paipan({ year: 2000, month: 1, day: 1, hour: 25, gender: 'male' }))
      .toThrow(/时间格式错误/)
  })
})

describe('validateInput - 边界', () => {
  test('合法输入返回 null', () => {
    expect(validateInput({ year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' })).toBeNull()
  })

  test('边界年份 MIN/MAX 通过', () => {
    expect(validateInput({ year: MIN_YEAR, month: 1, day: 1, hour: 0, gender: 'male' })).toBeNull()
    expect(validateInput({ year: MAX_YEAR, month: 12, day: 31, hour: 23, gender: 'female' })).toBeNull()
  })

  test('非整数月份被拒', () => {
    expect(validateInput({ year: 2000, month: 1.5, day: 1, hour: 0, gender: 'male' })).toMatch(/整数/)
  })
})
