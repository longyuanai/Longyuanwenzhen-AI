// utils/__tests__/baziRecordStore.test.js - 排盘记录存储层
//
// 重点覆盖无 Mongo 的内存兜底路径：项目的既定约定是「没数据库也能完整演示」，
// 这条路径在真实部署里反而最少被人工验证，最容易腐坏。

const store = require('../baziRecordStore')

const BIRTH = { year: 2002, month: 11, day: 20, hour: 10, minute: 0, gender: 'male' }

beforeEach(() => {
  store._reset()
})

describe('baziRecordStore - 无 Mongo 内存兜底', () => {
  test('保存后能读回，字段完整', async () => {
    const saved = await store.save('u1', BIRTH, '壬午 辛亥 壬辰 乙巳')
    expect(saved).not.toBeNull()
    expect(saved.baziStr).toBe('壬午 辛亥 壬辰 乙巳')

    const list = await store.list('u1')
    expect(list).toHaveLength(1)
    expect(list[0].birth).toEqual(BIRTH)
    expect(list[0].baziStr).toBe('壬午 辛亥 壬辰 乙巳')
  })

  test('同一用户重复排同一个盘幂等，不堆叠记录', async () => {
    await store.save('u1', BIRTH, '壬午 辛亥 壬辰 乙巳')
    await store.save('u1', BIRTH, '壬午 辛亥 壬辰 乙巳')
    await store.save('u1', BIRTH, '壬午 辛亥 壬辰 乙巳')

    const list = await store.list('u1')
    expect(list).toHaveLength(1)
  })

  test('出生信息不同则是不同记录', async () => {
    await store.save('u1', BIRTH, 'A')
    await store.save('u1', { ...BIRTH, hour: 11 }, 'B')
    await store.save('u1', { ...BIRTH, gender: 'female' }, 'C')

    const list = await store.list('u1')
    expect(list).toHaveLength(3)
  })

  test('用户之间互不可见', async () => {
    await store.save('u1', BIRTH, 'A')
    await store.save('u2', BIRTH, 'A')

    expect(await store.list('u1')).toHaveLength(1)
    expect(await store.list('u2')).toHaveLength(1)
    expect(await store.list('u3')).toHaveLength(0)
  })

  test('minute 缺省按 0 归一，不会因此产生重复记录', async () => {
    await store.save('u1', { year: 2002, month: 11, day: 20, hour: 10, gender: 'male' }, 'A')
    await store.save('u1', { ...BIRTH, minute: 0 }, 'A')
    expect(await store.list('u1')).toHaveLength(1)
  })

  test('字符串型 userId 与数字型视为同一用户', async () => {
    await store.save(123, BIRTH, 'A')
    expect(await store.list('123')).toHaveLength(1)
  })

  test('内存记录数受上限约束，不会无限增长', async () => {
    for (let i = 0; i < store.MEMORY_LIMIT + 20; i++) {
      await store.save('u1', { ...BIRTH, day: (i % 28) + 1, hour: i % 24, minute: i }, `盘${i}`)
    }
    const list = await store.list('u1', 1000)
    expect(list.length).toBeLessThanOrEqual(store.MEMORY_LIMIT)
  })

  test('limit 生效，且按时间倒序', async () => {
    await store.save('u1', { ...BIRTH, hour: 1 }, 'A')
    await store.save('u1', { ...BIRTH, hour: 2 }, 'B')
    await store.save('u1', { ...BIRTH, hour: 3 }, 'C')

    const list = await store.list('u1', 2)
    expect(list).toHaveLength(2)
    // 最新的排在前面
    expect(list[0].createdAt.getTime()).toBeGreaterThanOrEqual(list[1].createdAt.getTime())
  })

  test('返回的是副本，外部改动不会污染存储', async () => {
    await store.save('u1', BIRTH, 'A')
    const first = await store.list('u1')
    first[0].baziStr = '被篡改'
    first[0].birth.year = 1900

    const second = await store.list('u1')
    expect(second[0].baziStr).toBe('A')
    expect(second[0].birth.year).toBe(2002)
  })
})
