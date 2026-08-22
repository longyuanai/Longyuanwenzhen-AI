// scripts/gen-solar-terms.js - 生成小程序侧的节气(节)边界表
//
// 为什么需要这张表：
//   小程序 utils/bazi.js 的离线兜底算法原本按「日历月」排月柱、按日历年排年柱，
//   与后端基于 lunar-javascript 的节气分月/立春分年结果几乎每盘都不一致
//   （实测 4/4 样本月柱全错）。命理产品展示错误的八字比报错更伤。
//
//   小程序端不适合内置完整天文算法，因此把权威引擎（lunar-javascript）算出的
//   节气边界预生成成一张静态表随包发布 —— 本地兜底与后端**按构造对齐**，
//   而不是靠两套算法各自逼近同一个答案。
//
// 用法：
//   node backend/scripts/gen-solar-terms.js
//   → 覆盖写入 miniprogram/utils/solarTerms.js
//
// 数据格式见生成文件头部注释。改动本脚本后请重跑，并跑
// backend/utils/__tests__/paipan-parity.test.js 验证两端一致。

const fs = require('fs')
const path = require('path')
const { Solar } = require('lunar-javascript')

// 定月的 12 个「节」（中气不参与定月），按其所在公历月排列
const JIE_NAMES = [
  '小寒', '立春', '惊蛰', '清明', '立夏', '芒种',
  '小暑', '立秋', '白露', '寒露', '立冬', '大雪'
]

// 表范围比排盘支持范围（1900-2100）两端各多一年：
//   - 1900-01-01~01-05 出生者在当年小寒之前，逆行起运要查 1899 年大雪
//   - 2100 年大雪后出生者顺行起运要查 2101 年小寒
// 少这一年缓冲，边界盘的起运年龄会退回保守值而与后端不一致。
const MIN_YEAR = 1899
const MAX_YEAR = 2101

// 逐年取 12 个节的精确时刻
function jieOfYear(year) {
  const out = []
  let cursor = Solar.fromYmdHms(year, 1, 1, 0, 0, 0)
  while (out.length < 12) {
    const jie = cursor.getLunar().getNextJie()
    const s = jie.getSolar()
    if (s.getYear() > year) break
    out.push({ name: jie.getName(), solar: s })
    // 从该节时刻的下一秒继续，避免重复命中同一个节。
    // 用 Date 做进位，直接 second+1 会在 59 秒处越界（库会抛 wrong second 60）。
    const next = new Date(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond() + 1)
    cursor = Solar.fromYmdHms(
      next.getFullYear(), next.getMonth() + 1, next.getDate(),
      next.getHours(), next.getMinutes(), next.getSeconds()
    )
  }
  if (out.length !== 12) {
    throw new Error(`${year} 年取到 ${out.length} 个节，应为 12 个`)
  }
  out.forEach((j, i) => {
    if (j.name !== JIE_NAMES[i]) {
      throw new Error(`${year} 年第 ${i + 1} 个节为 ${j.name}，应为 ${JIE_NAMES[i]}`)
    }
  })
  return out
}

// 每个节编码为 8 位 MMDDhhmm，一年 96 字符。
// 取到分钟：节气交接同一分钟内出生属极端边界，命理上无实际区分意义。
function encodeYear(jies) {
  return jies.map(({ solar }) => {
    const mm = String(solar.getMonth()).padStart(2, '0')
    const dd = String(solar.getDay()).padStart(2, '0')
    const hh = String(solar.getHour()).padStart(2, '0')
    const mi = String(solar.getMinute()).padStart(2, '0')
    return `${mm}${dd}${hh}${mi}`
  }).join('')
}

function main() {
  const rows = []
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    rows.push(`  '${encodeYear(jieOfYear(y))}'`)
  }

  const header = `// utils/solarTerms.js - 节气(节)边界表，${MIN_YEAR}-${MAX_YEAR}
//
// ⚠️ 本文件由 backend/scripts/gen-solar-terms.js 自动生成，请勿手工编辑。
//    重新生成：node backend/scripts/gen-solar-terms.js
//
// 数据来源是后端排盘引擎所用的 lunar-javascript，因此小程序离线兜底算法与
// 服务端权威排盘**按构造对齐**（同一份节气边界），而非两套算法各自逼近。
//
// 编码：每年一个 96 字符的字符串，12 个节依次排列，每个节 8 位 MMDDhhmm。
// 12 个节按公历月序为：${JIE_NAMES.join(' ')}
// 它们依次是丑、寅、卯、辰、巳、午、未、申、酉、戌、亥、子月的起点。
//
// 表范围 ${MIN_YEAR}-${MAX_YEAR} 比排盘支持范围 1900-2100 两端各多一年：
// 年初/年末出生者算起运时要查相邻年份的节，缺这一年缓冲会导致边界盘起运年龄不一致。

const MIN_YEAR = ${MIN_YEAR}
const MAX_YEAR = ${MAX_YEAR}

// 12 个节的名称，索引与每年字符串中的段落一一对应
const JIE_NAMES = ${JSON.stringify(JIE_NAMES, null, 0).replace(/","/g, "', '").replace(/\["/, "['").replace(/"\]/, "']")}

const TABLE = [
${rows.join(',\n')}
]

/**
 * 取某年第 index 个节的精确时刻。
 * @param {number} year  1900-2100
 * @param {number} index 0-11，对应 JIE_NAMES
 * @returns {{month:number,day:number,hour:number,minute:number}|null} 超范围返回 null
 */
function getJie(year, index) {
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  if (index < 0 || index > 11) return null
  const row = TABLE[year - MIN_YEAR]
  const seg = row.substr(index * 8, 8)
  return {
    month: parseInt(seg.substr(0, 2), 10),
    day: parseInt(seg.substr(2, 2), 10),
    hour: parseInt(seg.substr(4, 2), 10),
    minute: parseInt(seg.substr(6, 2), 10)
  }
}

/** 该时刻是否已达到/越过某个节 */
function reachedJie(year, index, month, day, hour, minute) {
  const j = getJie(year, index)
  if (!j) return false
  if (month !== j.month) return month > j.month
  if (day !== j.day) return day > j.day
  if (hour !== j.hour) return hour > j.hour
  return minute >= j.minute
}

module.exports = { MIN_YEAR, MAX_YEAR, JIE_NAMES, getJie, reachedJie }
`

  const out = path.join(__dirname, '..', '..', 'miniprogram', 'utils', 'solarTerms.js')
  fs.writeFileSync(out, header, 'utf-8')
  const kb = (Buffer.byteLength(header, 'utf-8') / 1024).toFixed(1)
  console.log(`已生成 ${out}`)
  console.log(`覆盖 ${MIN_YEAR}-${MAX_YEAR}（${MAX_YEAR - MIN_YEAR + 1} 年），体积 ${kb} KB`)
}

main()
