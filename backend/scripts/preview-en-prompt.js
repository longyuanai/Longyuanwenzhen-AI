// scripts/preview-en-prompt.js - 英文解读可行性验证
//
// 目的：回答「八字产品做英文市场，技术上行不行」。
//   打印英文提示词；配了 OPENAI_API_KEY 就直接调模型出真实英文解读，
//   让人肉眼判断质量能不能打，而不是靠推测。
//
// 用法：
//   node scripts/preview-en-prompt.js                      # 只看提示词
//   node scripts/preview-en-prompt.js --call               # 调 AI 出真实输出
//   node scripts/preview-en-prompt.js --call --type=deep
//   node scripts/preview-en-prompt.js --call --model=gpt-4o-mini   # 试便宜模型
//   node scripts/preview-en-prompt.js --birth=1990-05-20T14 --gender=female
//
// 顺带回答成本问题：--call 会打印本次实际消耗的 token 数（取自 API 的
// usage 字段），可直接乘当期单价算单位成本。

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const axios = require('axios')
const config = require('../config')
const { paipan } = require('../utils/bazi')
const { analyzeMingju } = require('../utils/mingju')
const { buildBasicPromptEn, buildDeepPromptEn } = require('../utils/promptBuilder.en')
const { buildBasicPrompt, buildDeepPrompt } = require('../utils/promptBuilder')

function parseArgs(argv) {
  const a = {
    call: false, type: 'basic', model: null,
    birth: '2002-11-20T10', gender: 'male', compare: false
  }
  for (const x of argv.slice(2)) {
    if (x === '--call') a.call = true
    else if (x === '--compare') a.compare = true
    else if (x.startsWith('--type=')) a.type = x.slice(7)
    else if (x.startsWith('--model=')) a.model = x.slice(8)
    else if (x.startsWith('--birth=')) a.birth = x.slice(8)
    else if (x.startsWith('--gender=')) a.gender = x.slice(9)
  }
  if (!['basic', 'deep'].includes(a.type)) throw new Error('--type 只支持 basic / deep')
  if (!['male', 'female'].includes(a.gender)) throw new Error('--gender 只支持 male / female')
  return a
}

// "2002-11-20T10" 或 "2002-11-20T10:30"
function parseBirth(s, gender) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2})(?::(\d{1,2}))?$/.exec(String(s).trim())
  if (!m) throw new Error('--birth 格式应为 YYYY-MM-DDTHH 或 YYYY-MM-DDTHH:mm')
  return {
    year: +m[1], month: +m[2], day: +m[3],
    hour: +m[4], minute: m[5] ? +m[5] : 0, gender
  }
}

function hr(title) {
  return `\n${'─'.repeat(72)}\n  ${title}\n${'─'.repeat(72)}\n`
}

async function callAi(prompt, model) {
  const started = Date.now()
  const resp = await axios.post(
    `${config.ai.openai.baseUrl}/chat/completions`,
    {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional BaZi (Four Pillars of Destiny) consultant.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    },
    {
      timeout: 60000, // 人工验证场景，给足时间，不用线上那个 5s
      headers: {
        Authorization: `Bearer ${config.ai.openai.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )
  return {
    content: resp.data.choices[0].message.content,
    usage: resp.data.usage || null,
    ms: Date.now() - started
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const birth = parseBirth(args.birth, args.gender)

  const pp = paipan(birth)
  const mingju = analyzeMingju(pp)
  const baziStr = ['year', 'month', 'day', 'hour']
    .map((k) => pp[k + 'Pillar'].gan + pp[k + 'Pillar'].zhi)
    .join(' ')
  const dayunStr = pp.daYun.daYunList.map((d) => d.ganZhi).join(' ')

  const enPrompt = args.type === 'deep'
    ? buildDeepPromptEn(baziStr, dayunStr, mingju)
    : buildBasicPromptEn(baziStr, mingju)
  const zhPrompt = args.type === 'deep'
    ? buildDeepPrompt(baziStr, dayunStr, mingju)
    : buildBasicPrompt(baziStr, mingju)

  console.log(hr(`命盘 ${args.birth} ${args.gender}`))
  console.log(`四柱: ${baziStr}`)
  console.log(`大运: ${dayunStr}`)
  console.log(`日主: ${mingju.dayMaster.gan}${mingju.dayMaster.element} / ${mingju.strength.label} / ${mingju.geju.name}`)

  console.log(hr(`英文提示词 (${args.type})`))
  console.log(enPrompt)

  console.log(hr('提示词规模对比'))
  console.log(`中文版: ${zhPrompt.length} 字符`)
  console.log(`英文版: ${enPrompt.length} 字符`)
  console.log('注：中文 1 字约 1-2 token，英文约 4 字符 1 token —— 英文字符多不代表 token 多')

  if (!args.call) {
    console.log(hr('下一步'))
    console.log('加 --call 调用模型看真实英文输出（需在 .env 配 OPENAI_API_KEY）：')
    console.log('  node scripts/preview-en-prompt.js --call')
    console.log('  node scripts/preview-en-prompt.js --call --type=deep --model=gpt-4o-mini')
    return
  }

  if (!config.ai.openai.apiKey) {
    console.error('\n[错误] 未配置 OPENAI_API_KEY，无法调用模型。')
    console.error('在 backend/.env 里填 OPENAI_API_KEY=sk-xxx 后重试。')
    process.exitCode = 1
    return
  }

  const model = args.model || config.ai.openai.model
  console.log(hr(`调用模型 ${model}`))
  try {
    const { content, usage, ms } = await callAi(enPrompt, model)
    console.log(content)
    console.log(hr('本次成本数据'))
    console.log(`模型: ${model}`)
    console.log(`耗时: ${(ms / 1000).toFixed(1)}s`)
    if (usage) {
      console.log(`输入 token: ${usage.prompt_tokens}`)
      console.log(`输出 token: ${usage.completion_tokens}`)
      console.log(`合计: ${usage.total_tokens}`)
      console.log('\n乘当期单价即为单次解读成本；对照 config/products.js 的定价看毛利。')
    } else {
      console.log('（该端点未返回 usage 字段）')
    }
  } catch (err) {
    const detail = err.response ? JSON.stringify(err.response.data).slice(0, 300) : err.message
    console.error(`\n[调用失败] ${detail}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exitCode = 1
})
