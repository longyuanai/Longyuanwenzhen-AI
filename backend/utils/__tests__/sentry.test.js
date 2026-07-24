// utils/__tests__/sentry.test.js
describe('sentry 降级包装器', () => {
  const originalDsn = process.env.SENTRY_DSN
  const originalEnv = process.env.NODE_ENV
  let consoleSpy

  beforeEach(() => {
    jest.resetModules()
    consoleSpy = {
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {})
    }
  })

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = originalDsn
    if (originalEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalEnv
    consoleSpy.warn.mockRestore()
    consoleSpy.error.mockRestore()
  })

  test('DSN 未配置时 init 返 false 并 warn', () => {
    delete process.env.SENTRY_DSN
    const sentry = require('../../utils/sentry')
    expect(sentry.init()).toBe(false)
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      expect.stringContaining('SENTRY_DSN 未配置')
    )
  })

  test('DSN 未配置时 captureException 走 console.error 降级', () => {
    delete process.env.SENTRY_DSN
    const sentry = require('../../utils/sentry')
    sentry.init()
    const err = new Error('boom')
    sentry.captureException(err, { method: 'GET', url: '/x' })
    expect(consoleSpy.error).toHaveBeenCalled()
    const call = consoleSpy.error.mock.calls[0]
    expect(call[0]).toContain('[sentry:fallback]')
    expect(call[0]).toContain('GET /x')
    expect(call[1]).toBe(err.stack)
  })

  test('DSN 未配置时 captureException 无 ctx 也走降级', () => {
    delete process.env.SENTRY_DSN
    const sentry = require('../../utils/sentry')
    sentry.init()
    sentry.captureException(new Error('alone'))
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[sentry:fallback]',
      expect.stringContaining('alone')
    )
  })

  test('installProcessHandlers 装上 unhandledRejection / uncaughtException', () => {
    delete process.env.SENTRY_DSN
    const sentry = require('../../utils/sentry')
    const onSpy = jest.spyOn(process, 'on')
    sentry.installProcessHandlers()
    const events = onSpy.mock.calls.map((c) => c[0])
    expect(events).toContain('unhandledRejection')
    expect(events).toContain('uncaughtException')
    onSpy.mockRestore()
  })

  test('unhandledRejection 触发时走 captureException 降级路径', () => {
    delete process.env.SENTRY_DSN
    const sentry = require('../../utils/sentry')
    sentry.installProcessHandlers()
    // 模拟触发
    process.emit('unhandledRejection', new Error('async boom'))
    const calls = consoleSpy.error.mock.calls.map((c) => c[0])
    expect(calls.some((s) => s.includes('[sentry:fallback]'))).toBe(true)
  })
})
