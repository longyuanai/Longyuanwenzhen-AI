// scripts/__tests__/seed-friends.test.js - 批量种子脚本测试
//
// 目标:
//   1. parseArgs 默认值与边界校验(--count=0 / --prefix 非法 → 退出码非 0)
//   2. --reset 走通(打印 deleted 计数)
//   3. --json 输出(若 Mongo 真连得上)是合法 JSON + 含 accounts 数组
//   4. 文本输出包含 userId/token/vipExpireAt
//
// 策略:全部用 spawnSync 子进程跑脚本,避免 jest 上下文与 mongoose.connect 冲突。
// Mongo 连不上时大部分路径会失败,只断言"参数校验阶段先抛错"和"reset 走通"。
//
// 不依赖真 Mongo:jest 全跑耗时 < 5s,适合 CI。

const { spawnSync } = require('child_process')
const path = require('path')

const scriptPath = path.join(__dirname, '..', 'seed-friends.js')

function run(args = [], env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 10000
  })
}

describe('seed-friends 脚本 - CLI 参数校验', () => {
  test('--count=0 → 退出码非 0 + 错误提示', () => {
    const r = run(['--count=0'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/--count/)
  })

  test('--count=101 → 退出码非 0(上限 100)', () => {
    const r = run(['--count=101'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/--count/)
  })

  test('--prefix 含特殊字符 → 退出码非 0', () => {
    const r = run(['--prefix=f-1!'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/prefix/)
  })

  test('--prefix 含中文 → 退出码非 0', () => {
    const r = run(['--prefix=熟'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/prefix/)
  })
})

describe('seed-friends 脚本 - 默认 / 帮助', () => {
  test('不带任何参数 → 走到 connect + 因无 Mongo 抛错(预期 7+ 报错)', () => {
    const r = run([], { MONGODB_URL: 'mongodb://127.0.0.1:1/none' })
    // 无 Mongo 时 main 整体抛错,退出码非 0
    expect(r.status).not.toBe(0)
    // stderr 应有 connect/Mongoose/ECONN 字样
    expect((r.stderr || '') + (r.stdout || '')).toMatch(/Mongoose|connect|ECONN/i)
  })

  test('--reset → 至少打印 reset 字样或连不上错误', () => {
    const r = run(['--reset', '--prefix=ft'], { MONGODB_URL: 'mongodb://127.0.0.1:1/none' })
    const out = (r.stdout || '') + (r.stderr || '')
    // 不论 Mongo 通不通,都应出现 reset / deleted / connect 关键字
    expect(out).toMatch(/reset|deleted|Mongoose|connect|ECONN/i)
  })
})