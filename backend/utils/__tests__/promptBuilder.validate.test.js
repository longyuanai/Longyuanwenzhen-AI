// utils/__tests__/promptBuilder.validate.test.js
// 覆盖 validateAiOutput:正则匹配 / 不匹配 / 不一致 warn 但返原 content

const { validateAiOutput } = require('../promptBuilder')

const mingjuFixture = {
  dayMaster: { gan: '甲', element: '木' }
}

function silentLogger() {
  return { warns: [], warn(msg) { this.warns.push(msg) } }
}

describe('validateAiOutput', () => {
  test('content 不含日主声明 → ok=true, mismatch=null, 原内容透传', () => {
    const log = silentLogger()
    const result = validateAiOutput(mingjuFixture, '命局清纯,五行流通,无大碍。', log)
    expect(result.ok).toBe(true)
    expect(result.mismatch).toBe(null)
    expect(result.content).toBe('命局清纯,五行流通,无大碍。')
    expect(log.warns.length).toBe(0)
  })

  test('日主一致(甲木)→ ok=true, 无 warn', () => {
    const log = silentLogger()
    const result = validateAiOutput(
      mingjuFixture,
      '日主为甲木,生于春季,得令而旺。',
      log
    )
    expect(result.ok).toBe(true)
    expect(result.mismatch).toBe(null)
    expect(log.warns.length).toBe(0)
  })

  test('日主不一致(AI 编造乙木)→ ok=false,warn 但仍返原 content', () => {
    const log = silentLogger()
    const content = '日主为乙木,虽非系统所算,但据古籍推断...'
    const result = validateAiOutput(mingjuFixture, content, log)
    expect(result.ok).toBe(false)
    expect(result.mismatch).toBe('乙木')
    expect(result.content).toBe(content)
    expect(log.warns.length).toBe(1)
    expect(log.warns[0]).toMatch(/乙木.*甲木/)
  })

  test('多处声明:有一处不一致 → 记 warn', () => {
    const log = silentLogger()
    const content = '日主甲木,生于春季。但古籍另注日主丙火,存疑。'
    const result = validateAiOutput(mingjuFixture, content, log)
    expect(result.ok).toBe(false)
    expect(result.mismatch).toBe('丙火')
    expect(log.warns.length).toBe(1)
  })

  test('日主:甲 后无五行字符 → 也匹配(只校验天干)', () => {
    const log = silentLogger()
    const result = validateAiOutput(mingjuFixture, '日主:甲,身强。', log)
    expect(result.ok).toBe(true)
    expect(result.mismatch).toBe(null)
  })
})