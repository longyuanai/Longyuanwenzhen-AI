// utils/aiUsage.js - AI 调用的 token 消耗埋点
//
// 目的：把「这门生意划不划算」从估算变成实测。
//   四家解读的提示词有 8000+ 字符，定价 19.9，毛利到底多少？
//   与其按字符数估 token，不如记录 API 实际返回的 usage 字段。
//
// 两条记录路径，各有用处：
//   1. 结构化日志行（durable）—— 进程重启不丢，scripts/ai-usage-report.js
//      解析 logs/*.log 出汇总表，跑一周就有真实数据
//   2. 进程内累计（便宜）—— 供运维即时查看，重启归零，不作账
//
// 埋点绝不能影响业务：任何一步出错都吞掉，解读照常返回。

const logger = require('./logger')

// 日志前缀，report 脚本按它捞行
const LOG_TAG = '[ai-usage]'

// type|lang|model → { calls, promptTokens, completionTokens, totalTokens, ms, fallbacks }
const tally = new Map()

function keyOf(type, lang, model) {
  return `${type}|${lang}|${model}`
}

function blank() {
  return {
    calls: 0, fallbacks: 0,
    promptTokens: 0, completionTokens: 0, totalTokens: 0,
    ms: 0
  }
}

/**
 * 记录一次 AI 调用。
 *
 * @param {object} p
 * @param {string} p.type      basic / deep / four-school / dayun-segment / dayun-full
 * @param {string} p.lang      zh / en
 * @param {string} p.model     实际使用的模型名
 * @param {object} [p.usage]   API 返回的 usage 字段（缺失则只计次数与耗时）
 * @param {number} p.ms        本次耗时
 * @param {boolean} [p.fallback] 是否走了本地降级（未真正消耗 token）
 */
function record(params) {
  try {
    // 解构放进 try 内、且给默认对象：record() 无参调用会在解构处直接抛，
    // 而那是在 try 之外 —— 埋点抛错就把解读请求一起带走了，本末倒置。
    const { type, lang, model, usage, ms, fallback = false } = params || {}
    const k = keyOf(type, lang, model)
    const t = tally.get(k) || blank()

    t.calls += 1
    t.ms += Number(ms) || 0
    if (fallback) {
      t.fallbacks += 1
    } else if (usage) {
      t.promptTokens += Number(usage.prompt_tokens) || 0
      t.completionTokens += Number(usage.completion_tokens) || 0
      t.totalTokens += Number(usage.total_tokens) || 0
    }
    tally.set(k, t)

    // 结构化单行日志：字段顺序固定，report 脚本按 key=value 解析
    const parts = [
      `type=${type}`,
      `lang=${lang}`,
      `model=${model}`,
      `ms=${Math.round(Number(ms) || 0)}`,
      `fallback=${fallback ? 1 : 0}`
    ]
    if (usage) {
      parts.push(
        `prompt_tokens=${usage.prompt_tokens ?? ''}`,
        `completion_tokens=${usage.completion_tokens ?? ''}`,
        `total_tokens=${usage.total_tokens ?? ''}`
      )
    }
    logger.info(`${LOG_TAG} ${parts.join(' ')}`)
  } catch (err) {
    // 埋点失败绝不能影响解读本身
  }
}

/**
 * 进程内累计汇总（重启归零，仅供即时查看，不作账）。
 * @returns {Array} 按总 token 降序
 */
function summary() {
  return [...tally.entries()]
    .map(([k, v]) => {
      const [type, lang, model] = k.split('|')
      return {
        type,
        lang,
        model,
        ...v,
        avgTotalTokens: v.calls - v.fallbacks > 0
          ? Math.round(v.totalTokens / (v.calls - v.fallbacks))
          : 0,
        avgMs: v.calls > 0 ? Math.round(v.ms / v.calls) : 0
      }
    })
    .sort((a, b) => b.totalTokens - a.totalTokens)
}

function _reset() {
  tally.clear()
}

module.exports = { record, summary, _reset, LOG_TAG }
