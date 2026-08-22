// scripts/ai-usage-report.js - AI token 消耗汇总
//
// 解析 logs/ 里的 [ai-usage] 埋点行，按 接口/语言/模型 汇总，算出单次平均
// token 与降级率。跑一周就有真实成本数据，不用估。
//
// 用法：
//   node scripts/ai-usage-report.js
//   node scripts/ai-usage-report.js --price-in=0.5 --price-out=1.5
//     单价按「元 / 百万 token」传，脚本直接算出单次成本与毛利率。
//     当期单价去你所用厂商的官网查 —— 各家调价频繁，脚本不内置任何价格。
//   node scripts/ai-usage-report.js --log=/path/to/app.log
//
// 为什么解析日志而不是读进程内计数：进程重启就归零，而成本要按周看。
// 日志是唯一活得够久的记录。

const fs = require('fs')
const path = require('path')
const { getProduct } = require('../config/products')
const { LOG_TAG } = require('../utils/aiUsage')

// 接口 → 对应付费产品（basic 免费，无产品）
const TYPE_TO_PRODUCT = {
  deep: 'deep_report',
  'four-school': 'four_school',
  'dayun-segment': 'dayun_segment',
  'dayun-full': 'dayun_full'
}

function parseArgs(argv) {
  const a = { priceIn: null, priceOut: null, log: null }
  for (const x of argv.slice(2)) {
    if (x.startsWith('--price-in=')) a.priceIn = Number(x.slice(11))
    else if (x.startsWith('--price-out=')) a.priceOut = Number(x.slice(12))
    else if (x.startsWith('--log=')) a.log = x.slice(6)
  }
  return a
}

function collectLogFiles(explicit) {
  if (explicit) return [explicit]
  const dir = path.join(__dirname, '..', 'logs')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.log'))
    .map((f) => path.join(dir, f))
}

// "type=deep lang=en model=gpt-4 ms=1234 fallback=0 prompt_tokens=800 ..."
function parseLine(line) {
  const at = line.indexOf(LOG_TAG)
  if (at === -1) return null
  const rest = line.slice(at + LOG_TAG.length).trim()
  const out = {}
  for (const pair of rest.split(/\s+/)) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    out[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  if (!out.type) return null
  return out
}

function main() {
  const args = parseArgs(process.argv)
  const files = collectLogFiles(args.log)

  if (files.length === 0) {
    console.log('未找到日志文件。后端跑起来产生调用后再来看。')
    console.log('（默认读 backend/logs/*.log，可用 --log=路径 指定）')
    return
  }

  const agg = new Map()
  let lines = 0

  for (const f of files) {
    let content
    try {
      content = fs.readFileSync(f, 'utf-8')
    } catch (err) {
      console.error(`跳过 ${f}: ${err.message}`)
      continue
    }
    for (const line of content.split('\n')) {
      const rec = parseLine(line)
      if (!rec) continue
      lines++
      const key = `${rec.type}|${rec.lang}|${rec.model}`
      const t = agg.get(key) || {
        calls: 0, fallbacks: 0, promptTokens: 0, completionTokens: 0, ms: 0
      }
      t.calls++
      t.ms += Number(rec.ms) || 0
      if (rec.fallback === '1') t.fallbacks++
      else {
        t.promptTokens += Number(rec.prompt_tokens) || 0
        t.completionTokens += Number(rec.completion_tokens) || 0
      }
      agg.set(key, t)
    }
  }

  if (lines === 0) {
    console.log(`扫描了 ${files.length} 个日志文件，未发现 ${LOG_TAG} 埋点行。`)
    console.log('可能原因：后端还没处理过解读请求，或日志已轮转。')
    return
  }

  console.log(`扫描 ${files.length} 个文件，${lines} 条调用记录\n`)

  const hasPrice = Number.isFinite(args.priceIn) && Number.isFinite(args.priceOut)

  const header = ['接口', '语言', '模型', '调用', '降级率', '均输入tok', '均输出tok', '均耗时']
  if (hasPrice) header.push('单次成本', '售价', '毛利率')
  console.log(header.map((h, i) => h.padEnd([16, 6, 20, 6, 8, 11, 11, 9, 10, 8, 8][i])).join(''))
  console.log('─'.repeat(hasPrice ? 128 : 92))

  const rows = [...agg.entries()].sort((a, b) => b[1].calls - a[1].calls)

  for (const [key, t] of rows) {
    const [type, lang, model] = key.split('|')
    const real = t.calls - t.fallbacks
    const avgIn = real > 0 ? Math.round(t.promptTokens / real) : 0
    const avgOut = real > 0 ? Math.round(t.completionTokens / real) : 0
    const cells = [
      type.padEnd(16),
      lang.padEnd(6),
      model.slice(0, 19).padEnd(20),
      String(t.calls).padEnd(6),
      `${((t.fallbacks / t.calls) * 100).toFixed(0)}%`.padEnd(8),
      String(avgIn).padEnd(11),
      String(avgOut).padEnd(11),
      `${Math.round(t.ms / t.calls)}ms`.padEnd(9)
    ]

    if (hasPrice) {
      // 单价按 元/百万 token 传入
      const cost = (avgIn * args.priceIn + avgOut * args.priceOut) / 1e6
      const productType = TYPE_TO_PRODUCT[type]
      const product = productType ? getProduct(productType) : null
      cells.push(`¥${cost.toFixed(4)}`.padEnd(10))
      if (product) {
        const margin = ((product.amount - cost) / product.amount) * 100
        cells.push(`¥${product.amount}`.padEnd(8), `${margin.toFixed(1)}%`.padEnd(8))
      } else {
        cells.push('免费'.padEnd(8), '-'.padEnd(8))
      }
    }
    console.log(cells.join(''))
  }

  const totalCalls = rows.reduce((n, [, t]) => n + t.calls, 0)
  const totalFallbacks = rows.reduce((n, [, t]) => n + t.fallbacks, 0)
  console.log(`\n总调用 ${totalCalls} 次，其中降级 ${totalFallbacks} 次`
    + `（${((totalFallbacks / totalCalls) * 100).toFixed(1)}%）`)

  if (!hasPrice) {
    console.log('\n带上当期单价即可算出成本与毛利（单位：元 / 百万 token）：')
    console.log('  node scripts/ai-usage-report.js --price-in=0.5 --price-out=1.5')
  } else {
    console.log('\n注：成本只算 AI 调用，未含服务器、LightRAG、人力。')
  }
  if (totalFallbacks / totalCalls > 0.1) {
    console.log('\n⚠️  降级率超过 10%，AI 网关可能不稳定，或 5s 超时对当前模型偏紧。')
  }
}

main()
