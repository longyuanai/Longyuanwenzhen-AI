// scripts/gen-true-solar-time.js - 把后端真太阳时模块同步到小程序
//
// 为什么用生成而不是手抄：
//   小程序端要做同样的真太阳时校正（离线兜底排盘），而这里有 122 个城市经度
//   加一套均时差级数。手抄两份的结局在这个项目里已经见过——四柱算法曾经
//   前后端各写一份，实测 4/4 不一致。
//
//   后端 utils/trueSolarTime.js 只用了 Math / Date.UTC / CommonJS，
//   没有任何 Node 专有 API，**小程序可以逐字节复用**。于是同步退化成加个
//   banner 的复制，从构造上杜绝漂移。
//
// 用法：npm run gen:true-solar-time
// 校验：utils/__tests__/trueSolarTime.gen.test.js 会检查生成物是否最新，
//       改了后端模块忘了重新生成，CI 直接红。

const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'utils', 'trueSolarTime.js')
const DEST = path.join(__dirname, '..', '..', 'miniprogram', 'utils', 'trueSolarTime.js')

const BANNER = `// ⚠️ 本文件由 backend/scripts/gen-true-solar-time.js 生成，请勿手改。
// 源文件：backend/utils/trueSolarTime.js
// 重新生成：cd backend && npm run gen:true-solar-time
//
// 手改这里会让小程序离线兜底排盘与服务端排盘对同一个盘给出不同结论，
// 而且改动会在下次生成时被静默覆盖。

`

function build() {
  return BANNER + fs.readFileSync(SRC, 'utf-8')
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
  console.log('提醒：改了排盘相关逻辑后请跑 npm test 与 npm run diff:paipan')
}

module.exports = { build, SRC, DEST }

if (require.main === module) main()
