// scripts/paipan.js - 离线命令行排盘工具
//
// 用途：不起服务器、不连数据库，直接调用排盘引擎，肉眼核对排盘正确性。
//
// 用法：
//   node scripts/paipan.js <年> <月> <日> <时> [分] [性别]
//   node scripts/paipan.js 2002 11 20 10 0 male
//   node scripts/paipan.js 1990 1 1 12          （分默认0，性别默认male）
//   node scripts/paipan.js --demo               （跑几个已知正确的盘做基准对照）
//
//   性别可写：male/female 或 男/女 或 1/0
const { paipan } = require('../utils/bazi')
const { analyzeMingju } = require('../utils/mingju')

// 性别归一化：兼容 male/female、男/女、1/0
function normGender(raw) {
  const s = String(raw == null ? 'male' : raw).trim().toLowerCase()
  if (['female', '女', '0', 'f'].includes(s)) return 'female'
  return 'male'
}

// CJK 字符按双宽计算，做终端对齐
function displayWidth(str) {
  let w = 0
  for (const ch of String(str)) w += ch.charCodeAt(0) > 255 ? 2 : 1
  return w
}

// 右侧补空格到指定显示宽度
function pad(str, width) {
  const s = String(str)
  const gap = width - displayWidth(s)
  return gap > 0 ? s + ' '.repeat(gap) : s
}

// 把一行四柱数据格式化成对齐的列
function row(label, cells, width = 8) {
  return pad(label, 7) + cells.map((c) => pad(c, width)).join('')
}

function render(result) {
  const { input, yearPillar, monthPillar, dayPillar, hourPillar } = result
  const { tenGods, cangGan, wuxing, daYun } = result
  const g = input.gender === 'female' ? '女' : '男'
  const mm = String(input.minute).padStart(2, '0')
  const hh = String(input.hour).padStart(2, '0')

  const lines = []
  lines.push('═══════════ 八字排盘 ═══════════')
  lines.push(`公历：${input.year}-${input.month}-${input.day} ${hh}:${mm}  ${g}`)
  lines.push('')
  lines.push(row('', ['年柱', '月柱', '日柱', '时柱']))
  lines.push(row('天干', [yearPillar.gan, monthPillar.gan, dayPillar.gan, hourPillar.gan]))
  lines.push(row('地支', [yearPillar.zhi, monthPillar.zhi, dayPillar.zhi, hourPillar.zhi]))
  lines.push(row('干十神', [tenGods.yearGan, tenGods.monthGan, tenGods.dayGan, tenGods.hourGan]))
  lines.push(row('支十神', [tenGods.yearZhi, tenGods.monthZhi, tenGods.dayZhi, tenGods.hourZhi]))
  lines.push(row('藏干', [
    cangGan.year.join(''), cangGan.month.join(''), cangGan.day.join(''), cangGan.hour.join('')
  ]))
  lines.push(row('五行', [
    wuxing.yearGan + wuxing.yearZhi, wuxing.monthGan + wuxing.monthZhi,
    wuxing.dayGan + wuxing.dayZhi, wuxing.hourGan + wuxing.hourZhi
  ]))
  lines.push('')
  const dir = daYun.isForward ? '顺行' : '逆行'
  lines.push(`─── 大运（${dir}，起运约 ${daYun.startYear} 年 ${daYun.startMonth} 个月）───`)
  for (const d of daYun.daYunList) {
    lines.push(`  ${pad(d.ganZhi, 6)}${pad(d.ageRange, 10)}起于 ${d.startYear} 年`)
  }
  return lines.join('\n')
}

// 渲染命局论断块（身强弱 / 五行力量 / 喜忌 / 调候 / 格局 / 免责）
function renderLun(result) {
  const m = analyzeMingju(result)
  const lines = []
  const s = m.strength
  const dl = s.deLing ? '✓' : '✗'
  const dd = s.deDi ? '✓' : '✗'
  const ds = s.deShi ? '✓' : '✗'

  lines.push('')
  lines.push('─────────── 命局论断（仅供参考，非绝对）───────────')
  lines.push(`日主：${m.dayMaster.gan}${m.dayMaster.element}`)
  lines.push(`身强弱：${s.label}（同党占比 ${(s.ratio * 100).toFixed(1)}%｜得令${dl} 得地${dd} 得势${ds}）`)

  const ws = m.wuxingScore
  const wsStr = ['木', '火', '土', '金', '水'].map((e) => `${e}${Math.round(ws[e])}`).join('  ')
  lines.push(`五行力量：${wsStr}`)
  lines.push(`喜用神：${m.yongShen.xiShen.join(' ') || '（无）'}`)
  lines.push(`忌　神：${m.yongShen.jiShen.join(' ') || '（无）'}`)

  const th = m.yongShen.tiaoHou
  const need = th.need.length ? th.need.join('') : '（无显著需求）'
  lines.push(`调候：${th.season}月，需${need}${th.need.length ? (th.urgent ? '（急用）' : '（不急）') : ''}`)
  lines.push(`格局：${m.geju.name}${m.geju.isPure ? '（清纯）' : '（不纯）'}${m.geju.isSpecial ? '·特殊格' : ''}`)

  lines.push('依据：')
  for (const b of m.basis) lines.push(`  · ${b}`)
  lines.push(`免责：${m.disclaimer}`)
  return lines.join('\n')
}

const DEMO_CASES = [
  { args: [2002, 11, 20, 10, 0, 'male'], note: '机主本人盘，应为 壬午 辛亥 壬辰 乙巳' },
  { args: [1990, 1, 1, 12, 0, 'male'], note: '1990-01-01 12:00 男，日柱应为 丙寅' },
  { args: [2000, 5, 15, 23, 30, 'female'], note: '晚子时 23:30，时支应为 子' }
]

function runOne(args, note) {
  const [year, month, day, hour, minute = 0, gender = 'male'] = args
  try {
    const result = paipan({
      year: Number(year), month: Number(month), day: Number(day),
      hour: Number(hour), minute: Number(minute), gender: normGender(gender)
    })
    if (note) console.log(`【对照】${note}`)
    console.log(render(result))
    console.log(renderLun(result))
    console.log('')
  } catch (err) {
    if (err.code === 'INVALID_INPUT') {
      console.error(`输入有误：${err.message}`)
    } else {
      console.error('排盘失败：', err.message)
    }
    process.exitCode = 1
  }
}

function main() {
  const argv = process.argv.slice(2)

  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    console.log([
      '离线排盘工具',
      '',
      '用法：node scripts/paipan.js <年> <月> <日> <时> [分] [性别]',
      '  示例：node scripts/paipan.js 2002 11 20 10 0 male',
      '  性别：male/female 或 男/女 或 1/0（默认 male）',
      '  跑基准盘：node scripts/paipan.js --demo'
    ].join('\n'))
    return
  }

  if (argv[0] === '--demo') {
    for (const c of DEMO_CASES) runOne(c.args, c.note)
    return
  }

  runOne(argv)
}

main()
