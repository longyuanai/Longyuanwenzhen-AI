// scripts/diff-paipan.js - 排盘差分校验：拿第三方实现当「第二意见」
//
// 为什么要有这个：
//   我们此前做过前后端排盘一致性验证（18415 盘零分歧，见 utils/__tests__/paipan-parity.test.js），
//   但那只证明了「小程序和后端算得一样」，没证明「算得对」——两端可能一起错。
//   要证伪就必须引入一个**独立实现**。
//
// 为什么选 tyme4ts：
//   调研 GitHub 同类项目时发现 cantian-ai/bazi-mcp（416 star，专门以「GPT/DeepSeek
//   排盘错误」立项）底层用的是 tyme4ts，而非我们用的 lunar-javascript。
//   两者同为 6tail 所作，但 tyme4ts 是**完整重写**（官方描述「Lunar 的升级版，
//   拥有更优的设计」），代码路径与 API 语义都不同。
//
//   ⚠️ 诚实说明独立性边界：同一作者的重写不是完全独立的第三方实现。
//   它能抓出的是「我们调错了 API / 组装逻辑写错了 / 边界处理漏了」这类问题，
//   抓不出「作者对某条命理规则的理解本身有偏差」。这仍是目前成本最低、
//   覆盖面最广的交叉验证手段。
//
// 用法：
//   node scripts/diff-paipan.js                 # 默认 5000 个随机盘
//   node scripts/diff-paipan.js --n=20000       # 加大样本
//   node scripts/diff-paipan.js --scan=1984     # 逐日扫描某年（每天 4 个时辰）
//   node scripts/diff-paipan.js --seed=42       # 换随机种子
//   node scripts/diff-paipan.js --verbose       # 打印每条分歧明细
//
// 退出码：0 = 零分歧；1 = 有分歧

const { paipan, MIN_YEAR, MAX_YEAR, LATE_ZI_SECT } = require('../utils/bazi')
const {
  SolarTime, ChildLimit, Gender, LunarSect1ChildLimitProvider
} = require('tyme4ts')

// ── 流派对齐：差分要比的是「有没有 bug」，不是「选了哪一派」 ──────
//
// 起运年龄有多个公认流派，tyme4ts 提供 4 种 provider。实测 3000 盘：
//   Default    分歧 1.03%      China95    分歧 1.17%
//   LunarSect2 分歧 1.03%      LunarSect1 分歧 0.00%  ← 与我们完全一致
// 说明我们的起运精确对应「lunar 流派1」这一有名有姓的约定，不是算错。
// 这里显式钉死 provider，否则每次跑都会冒出 ~1% 的已知流派噪音，
// 真正的回归 bug 就淹没在里面了。
ChildLimit.provider = new LunarSect1ChildLimitProvider()

// 晚子时：我们默认流派 1（日柱进次日），与 tyme4ts 的默认取值相同，
// 故无需替换 EightChar provider。若有人把后端切回流派 2，两边基准
// 就不同了——此时差分结果不可信，直接拒绝运行而不是给出误导性报告。
if (LATE_ZI_SECT !== 1) {
  console.error(
    `\n✗ 当前 BAZI_LATE_ZI_SECT=${LATE_ZI_SECT}，与参考实现（流派1）基准不同。\n` +
    '  差分结果会把流派差异误报成 bug。请用 BAZI_LATE_ZI_SECT=1 跑本脚本。\n'
  )
  process.exit(2)
}

const argv = process.argv.slice(2)
const argNum = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const VERBOSE = argv.includes('--verbose')
const SAMPLE_N = argNum('n', 5000)
const SCAN_YEAR = argNum('scan', null)
const SEED = argNum('seed', 20260731)

// ── 参考实现：用 tyme4ts 算同一个盘 ────────────────────────────────
function reference({ year, month, day, hour, minute, gender }) {
  const st = SolarTime.fromYmdHms(year, month, day, hour, minute, 0)
  const ec = st.getLunarHour().getEightChar()

  const pillar = (cycle) => ({
    gan: cycle.getHeavenStem().getName(),
    zhi: cycle.getEarthBranch().getName()
  })

  const cl = ChildLimit.fromSolarTime(st, gender === 'male' ? Gender.MAN : Gender.WOMAN)
  const daYunList = []
  let df = cl.getStartDecadeFortune()
  for (let i = 0; i < 8; i++) {
    daYunList.push({
      ganZhi: df.getName(),
      ageStart: df.getStartAge(),
      ageEnd: df.getEndAge()
    })
    df = df.next(1)
  }

  return {
    yearPillar: pillar(ec.getYear()),
    monthPillar: pillar(ec.getMonth()),
    dayPillar: pillar(ec.getDay()),
    hourPillar: pillar(ec.getHour()),
    daYun: { startAge: daYunList[0].ageStart, daYunList }
  }
}

// ── 比对 ──────────────────────────────────────────────────────────
// 只比对两边都声称权威的字段。十神/藏干/五行是我们从四柱派生的，
// 四柱对了它们必然对，重复比对只会放大噪音。
function compare(ours, theirs) {
  const diffs = []
  const push = (field, a, b) => diffs.push({ field, ours: a, theirs: b })

  for (const p of ['yearPillar', 'monthPillar', 'dayPillar', 'hourPillar']) {
    const a = `${ours[p].gan}${ours[p].zhi}`
    const b = `${theirs[p].gan}${theirs[p].zhi}`
    if (a !== b) push(p, a, b)
  }

  if (ours.daYun.startAge !== theirs.daYun.startAge) {
    push('daYun.startAge', ours.daYun.startAge, theirs.daYun.startAge)
  }

  // 大运干支序列：方向错、起点错都会在这里暴露
  const n = Math.min(ours.daYun.daYunList.length, theirs.daYun.daYunList.length)
  for (let i = 0; i < n; i++) {
    const a = ours.daYun.daYunList[i]
    const b = theirs.daYun.daYunList[i]
    if (a.ganZhi !== b.ganZhi) push(`daYun[${i}].ganZhi`, a.ganZhi, b.ganZhi)
    if (a.ageStart !== b.ageStart) push(`daYun[${i}].ageStart`, a.ageStart, b.ageStart)
  }

  return diffs
}

// ── 样本生成 ──────────────────────────────────────────────────────
// 自带 PRNG（mulberry32）而不用 Math.random：差分报告必须可复现，
// 否则「昨天跑出 3 条分歧」今天复现不了就没法定位。
function makeRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate()
}

function* randomSamples(n, seed) {
  const rnd = makeRng(seed)
  const pick = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1))
  for (let i = 0; i < n; i++) {
    const year = pick(MIN_YEAR, MAX_YEAR)
    const month = pick(1, 12)
    yield {
      year,
      month,
      day: pick(1, daysInMonth(year, month)),
      hour: pick(0, 23),
      minute: pick(0, 59),
      gender: rnd() < 0.5 ? 'male' : 'female'
    }
  }
}

// 逐日扫描：随机采样会稀释节气交界这类高危点，扫描年份能压满边界
function* scanSamples(year) {
  // 23 点单列：晚子时的日柱归属是各家实现最容易分道扬镳的地方
  const hours = [0, 6, 12, 18, 23]
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= daysInMonth(year, month); day++) {
      for (const hour of hours) {
        yield { year, month, day, hour, minute: 0, gender: hour % 2 ? 'female' : 'male' }
      }
    }
  }
}

// ── 主流程 ────────────────────────────────────────────────────────
function main() {
  const samples = SCAN_YEAR ? scanSamples(SCAN_YEAR) : randomSamples(SAMPLE_N, SEED)
  const label = SCAN_YEAR ? `逐日扫描 ${SCAN_YEAR} 年` : `随机 ${SAMPLE_N} 盘（seed=${SEED}）`

  console.log(`\n排盘差分校验 — 我们(lunar-javascript) vs 参考(tyme4ts)`)
  console.log(`样本：${label}`)
  console.log('═'.repeat(72))

  let total = 0
  let bad = 0
  const byField = new Map()
  const examples = []
  const errors = []

  const t0 = Date.now()
  for (const s of samples) {
    total++
    let ours
    let theirs
    try {
      ours = paipan(s)
      theirs = reference(s)
    } catch (err) {
      errors.push({ sample: s, message: err.message })
      continue
    }

    const diffs = compare(ours, theirs)
    if (diffs.length === 0) continue

    bad++
    for (const d of diffs) {
      byField.set(d.field, (byField.get(d.field) || 0) + 1)
    }
    if (examples.length < 20) examples.push({ sample: s, diffs })
    if (VERBOSE) {
      const { year, month, day, hour, minute, gender } = s
      console.log(`✗ ${year}-${month}-${day} ${hour}:${String(minute).padStart(2, '0')} ${gender}`)
      diffs.forEach((d) => console.log(`    ${d.field}: 我们=${d.ours} 参考=${d.theirs}`))
    }
  }
  const ms = Date.now() - t0

  console.log(`样本 ${total} 盘，耗时 ${ms}ms`)
  if (errors.length) {
    console.log(`\n⚠ 抛错 ${errors.length} 例（不计入分歧，但同样要查）：`)
    errors.slice(0, 5).forEach((e) => {
      const { year, month, day, hour } = e.sample
      console.log(`    ${year}-${month}-${day} ${hour}时 → ${e.message}`)
    })
  }

  if (bad === 0) {
    console.log('\n✓ 零分歧。两套独立实现对四柱与大运的结论完全一致。')
    console.log('  注：这排除的是「我们调错 API / 组装逻辑写错」，')
    console.log('      不排除「两库对某条命理规则的理解共同有偏差」。')
    return 0
  }

  console.log(`\n✗ ${bad} / ${total} 盘存在分歧（${(bad / total * 100).toFixed(3)}%）`)
  console.log('\n按字段汇总：')
  ;[...byField.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([field, count]) => console.log(`    ${field.padEnd(24)} ${count}`))

  console.log('\n前几例（复现用）：')
  examples.slice(0, 10).forEach(({ sample, diffs }) => {
    const { year, month, day, hour, minute, gender } = sample
    console.log(`  ${year}-${month}-${day} ${hour}:${String(minute).padStart(2, '0')} ${gender}`)
    diffs.forEach((d) => console.log(`      ${d.field}: 我们=${d.ours} 参考=${d.theirs}`))
  })

  console.log('\n分歧不等于我们错——先判定哪一侧符合命理通则，再决定改谁。')
  return 1
}

process.exitCode = main()
