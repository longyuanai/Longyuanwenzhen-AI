// scripts/gen-shensha.js - 把后端神煞模块同步到小程序
//
// 与 gen-true-solar-time.js 的区别：trueSolarTime.js 零依赖，可逐字节复制；
// shensha.js 要 require('./geju') 拿禄神与羊刃表，而小程序侧没有 geju.js。
//
// 处理办法是**生成时内联**：从真正的 geju 模块里把两张表序列化出来，
// 替换掉那行 require。这样单一真相仍然是 geju.js —— 改了那边重新生成即可，
// 而生成物是自包含的，小程序不必再搬一个格局模块过去。
//
// 用法：npm run gen:shensha
// 校验：utils/__tests__/shensha.gen.test.js 检查生成物是否最新

const fs = require('fs')
const path = require('path')
const { LU, YANG_REN } = require('../utils/geju')

const SRC = path.join(__dirname, '..', 'utils', 'shensha.js')
const DEST = path.join(__dirname, '..', '..', 'miniprogram', 'utils', 'shensha.js')

const REQUIRE_LINE = "const { LU, YANG_REN } = require('./geju')"

const BANNER = `// ⚠️ 本文件由 backend/scripts/gen-shensha.js 生成，请勿手改。
// 源文件：backend/utils/shensha.js（禄神/羊刃表内联自 backend/utils/geju.js）
// 重新生成：cd backend && npm run gen:shensha
//
// 手改这里会让小程序离线兜底与服务端对同一个盘给出不同神煞，
// 而且改动会在下次生成时被静默覆盖。

`

// 稳定序列化：键按原顺序输出，值加引号。不用 JSON.stringify 是为了
// 生成的代码保持和手写表一样的可读性（中文键不带引号）。
function serializeTable(name, table) {
  const body = Object.entries(table)
    .map(([k, v]) => `  ${k}: '${v}'`)
    .join(',\n')
  return `const ${name} = {\n${body}\n}`
}

function build() {
  const src = fs.readFileSync(SRC, 'utf-8')
  if (!src.includes(REQUIRE_LINE)) {
    throw new Error(
      `未在 ${path.basename(SRC)} 里找到预期的 require 行：\n  ${REQUIRE_LINE}\n` +
      '改了依赖方式就要同步改本生成脚本，否则生成物会带着一个小程序解析不了的 require。')
  }

  const inlined = [
    '// —— 以下两张表由生成脚本从 backend/utils/geju.js 内联而来 ——',
    '// 单一真相在 geju.js：改那边后跑 npm run gen:shensha 重新生成。',
    '// 直接改这里会让「羊刃格」与「羊刃神煞」对同一个盘各说各话。',
    serializeTable('LU', LU),
    serializeTable('YANG_REN', YANG_REN)
  ].join('\n')

  return BANNER + src.replace(REQUIRE_LINE, inlined)
}

function main() {
  const content = build()
  const prev = fs.existsSync(DEST) ? fs.readFileSync(DEST, 'utf-8') : null
  if (prev === content) {
    console.log('已是最新，无需改动：' + path.relative(process.cwd(), DEST))
    return
  }
  fs.writeFileSync(DEST, content)
  console.log('已生成 ' + path.relative(process.cwd(), DEST) +
    `（${content.split('\n').length} 行）`)
}

module.exports = { build, SRC, DEST }

if (require.main === module) main()
