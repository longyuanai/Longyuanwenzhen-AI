// utils/__tests__/integration.test.js - 端到端集成（mock 真实 LightRAG 响应结构）
//
// 目的：在不实际启动 LightRAG 服务的前提下，验证「retrieve → promptBuilder」
// 全链路在真实响应结构下能正确装配。
//
// 真实 LightRAG 的 /query 响应契约（基于 docs/integration/lightrag.md）：
//   {
//     "response": "LLM 自然语言摘要（可选）",
//     "references": [
//       { "content": "古籍原文片段", "file_path": "《XXX》章节", "score": 0.92, "...": "..." },
//       ...
//     ]
//   }
//
// 这些测试模拟的 references 全部来自 bazi-skill-dist/books/ 八字/ 真实典籍
// 与 cases/公众人物案例中的内容，字段名/结构与 LightRAG 实环境对齐。

const axios = require('axios')
const { retrieve } = require('../knowledgeRetriever')
const { analyzeMingju } = require('../mingju')
const { paipan } = require('../bazi')
const {
  buildBasicPrompt, buildDeepPrompt, formatKnowledgeContext
} = require('../promptBuilder')

jest.mock('axios')

const MOCK_URL = 'http://localhost:9621'

// 张学良真实命盘（来自 bazi-skill-dist/cases/张学良八字.md）
// 用儒略日近似：1901-06-03 巳时（民国命理界约定）
const ZHANG = { year: 1901, month: 6, day: 3, hour: 10, minute: 0, gender: 'male' }
const zhangMingju = analyzeMingju(paipan(ZHANG))

describe('集成：真实 LightRAG 响应结构', () => {
  beforeEach(() => jest.clearAllMocks())

  test('满血 references → 注入《子平真诠评注》《滴天髓》等多部典籍片段', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        response: '综合解读：张学良命局金水联珠，建禄格...',
        references: [
          {
            content: '建禄格须看月令中所透者为用，次看四柱之财官印食。',
            file_path: '《子平真诠评注·徐乐吾》卷二·论建禄月劫',
            score: 0.94,
            // 真实 LightRAG 可能带的额外字段
            entity_name: '建禄格',
            chunk_id: 'chunk_42'
          },
          {
            content: '壬水生于巳月，调候用丙火，金水过旺须食伤泄秀为用。',
            file_path: '《穷通宝鉴》壬水·巳月',
            score: 0.88,
            entity_name: '调候',
            chunk_id: 'chunk_108'
          },
          {
            content: '双羊刃冲而不开，必待食伤运引出，方能化解刚烈。',
            file_path: '《滴天髓阐微》·体用',
            score: 0.81
          }
        ]
      }
    })

    const kc = await retrieve(zhangMingju, { url: MOCK_URL })
    expect(kc).toHaveLength(3)

    const prompt = buildDeepPrompt(
      '辛丑 癸巳 壬子 庚子',
      '己丑 戊子 丁亥',
      zhangMingju,
      kc
    )

    // 三部典籍都应进 prompt
    expect(prompt).toContain('《子平真诠评注·徐乐吾》卷二·论建禄月劫')
    expect(prompt).toContain('《穷通宝鉴》壬水·巳月')
    expect(prompt).toContain('《滴天髓阐微》·体用')

    // 相关度分数也注入
    expect(prompt).toContain('相关度 0.94')
    expect(prompt).toContain('相关度 0.88')

    // 优先级声明不能丢
    expect(prompt).toMatch(/与【已确定结论】冲突.*以【已确定结论】为准/)

    // 同时已确定结论注入（sanity check 跟 RAG 不冲突）
    expect(prompt).toContain('不得修改')
  })

  test('response 只有字符串 + 无 references → 整体作为一条 LightRAG', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        response: '金水联珠格局，当顺其势。',
        // references 缺失
      }
    })

    const kc = await retrieve(zhangMingju, { url: MOCK_URL })
    expect(kc).toHaveLength(1)
    expect(kc[0].source).toBe('LightRAG')

    const prompt = buildBasicPrompt('辛丑 癸巳 壬子 庚子', zhangMingju, kc)
    expect(prompt).toContain('【古籍依据】')
    expect(prompt).toContain('金水联珠格局')
    expect(prompt).toContain('（LightRAG）')
  })

  test('真实可发生：references 字段名是中文（file_path vs source）', async () => {
    // 防御性测试：有的 LightRAG 版本用 source 没 file_path
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        response: 'x',
        references: [
          { content: '测试片段', source: '《三命通会》' }  // 注意:是 source 不是 file_path
        ]
      }
    })

    const kc = await retrieve(zhangMingju, { url: MOCK_URL })
    expect(kc[0].source).toBe('《三命通会》')  // retrieve 已做兼容映射
  })

  test('真实可发生：references 内 score 是字符串"0.85"而非数字', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        response: 'x',
        references: [{ content: '片段', file_path: '《书》', score: '0.85' }]
      }
    })

    const kc = await retrieve(zhangMingju, { url: MOCK_URL })
    // retrieve 应当类型守卫：score 不是 number 时不输出
    expect(kc[0].score).toBeUndefined()

    const prompt = buildBasicPrompt('辛丑 癸巳 壬子 庚子', zhangMingju, kc)
    expect(prompt).not.toContain('相关度 0.85')  // 因为 score 不见了
    expect(prompt).toContain('《书》')          // 但 source 还在
  })
})

describe('集成：端到端典型用户场景', () => {
  beforeEach(() => jest.clearAllMocks())

  test('张学良 基础解读：RAG 命中 4 条 → 用户能看到古籍引证', async () => {
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        response: '...',
        references: [
          { content: '建禄格以月令取用', file_path: '《子平真诠》', score: 0.9 },
          { content: '金水联珠主文武', file_path: '《滴天髓》', score: 0.85 },
          { content: '调候用丙火', file_path: '《穷通宝鉴》', score: 0.82 },
          { content: '双羊刃冲动', file_path: '《命理约言》', score: 0.78 }
        ]
      }
    })

    const kc = await retrieve(zhangMingju)
    const prompt = buildBasicPrompt('辛丑 癸巳 壬子 庚子', zhangMingju, kc)

    // 验证 prompt 既包含确定结论,又包含古籍依据
    expect(prompt).toContain('日主：壬水')
    expect(prompt).toContain('【古籍依据】')
    expect(prompt).toContain('《子平真诠》')
    expect(prompt).toContain('《穷通宝鉴》')
  })

  test('服务挂掉：用户拿到的 prompt 跟没 RAG 时一致', async () => {
    axios.post.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9621'))

    const kc = await retrieve(zhangMingju)
    const promptWithRag = buildBasicPrompt('辛丑 癸巳 壬子 庚子', zhangMingju, kc)
    const promptWithoutRag = buildBasicPrompt('辛丑 癸巳 壬子 庚子', zhangMingju)

    expect(promptWithRag).toBe(promptWithoutRag)  // 完全一致
    expect(promptWithRag).not.toContain('【古籍依据】')
  })
})
