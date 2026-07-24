# 算法层 → Prompt → AI 链路(2026-07-25)

> 接手者 5 分钟搞清楚:`backend/utils/` 下 14 个文件怎么串,从 `birth 输入` 到 `AI 输出`。

## 一句话总结

```
birth {year,month,day,hour,gender}
  → paipan()           // 排盘:lunar-javascript 兜底,确定性四柱
  → analyzeMingju()    // 论断编排器:五行→身强弱→喜忌→格局,产出统一对象
  → buildPrompt()      // 把论断 + (可选)RAG 古籍拼成提示词
  → axios OpenAI       // AI 只翻译,不重新推导
  → 返回 content        // 失败时走 localFallback 模板
```

**核心约束**:身强弱 / 喜忌 / 格局 由代码确定性算,**绝不信任客户端**传入的论断。AI 只翻译,不重新推导。

---

## 文件分工表(`backend/utils/`)

| 文件 | 角色 | 输出 | 上下游 |
|---|---|---|---|
| `bazi.js` | 排盘权威 | `{ yearPillar, monthPillar, dayPillar, hourPillar, wuxing, cangGan, tenGods, daYun, ... }` | 入口;被所有论断文件依赖 |
| `wuxingScore.js` | 五行打分 | `{ scores, breakdown }`(`partyOf` / `isTongDang` 工具) | `mingju.js` 的入参 |
| `wangShuai.js` | 身强弱判定 | `{ strength, lean, ratio, deLing/deDi/deShi, basis }` | `mingju.js` 的入参 |
| `yongShen.js` | 喜用神(扶抑+调候) | `{ xiShen, jiShen, tiaoHou, conflicts, basis }` | `mingju.js` 的入参 |
| `geju.js` | 格局 | `{ geju, isSpecial, isPure, basis }` | `mingju.js` 的入参 |
| `mingju.js` | **论断编排器** | `{ dayMaster, wuxingScore, strength, yongShen, geju, basis, disclaimer }` | 论断层唯一对外入口 |
| `promptBuilder.js` | prompt 构造(basic/deep) | `string` | 给 AI 用;`formatMingliFacts` / `formatKnowledgeContext` |
| `fourSchoolPrompt.js` | 四家并列 prompt + queries | `string` + `{ xu, liang, yuan, wei }` | `promptBuilder.formatMingliFacts` + 4 家 query 构造 |
| `knowledgeRetriever.js` | LightRAG HTTP 封装 | `[{ content, source, score }]` | `retrieve(mingju, { query })`;超时/失败返 `[]` 降级 |
| `localFallback.js` | 本地降级模板 | `string` | AI 网关挂时三路径各自兜底;四家给四家分别拼 |
| `checkupSummary.js` | 体检一行话 | `string` | `/analysis/checkup` 用 |
| `entitlementRegistry.js` | 付费权益 in-memory | `hasOrderPaid` / `hasValidVip` | `routes/analysis.js` 的付费校验 |
| `wxpay.js` | 微信支付 v2 验签 | `boolean` | `routes/order.js` `/callback` |
| `logger.js` / `sentry.js` | 日志 + 监控 | — | 全局 |

---

## 数据流向图

```
                                ┌───────────────────────┐
   client POST /api/v1/...      │    routes/analysis.js │
   ──────────────────────────▶  │                       │
                                │  1. computeFromBirth  │
                                │     └─ paipan()       │
                                │     └─ analyzeMingju()│──┐
                                │  2. buildPrompt       │  │
                                │     └─ promptBuilder  │  │
                                │        / fourSchool   │  │
                                │  3. RAG(可选)         │  │
                                │     └─ retrieve() × N │  │
                                │  4. axios OpenAI      │  │
                                │  5. catch → fallback  │  │
                                └─────────┬─────────────┘  │
                                          │                │
                                          ▼                │
                                ┌───────────────────────┐  │
                                │   content (string)    │  │
                                └───────────────────────┘  │
                                                           │
                                                           │
                ┌──────────────────────────────────────────┘
                │
                ▼
   ┌──────────────────────────┐         ┌──────────────────────┐
   │  utils/bazi.js           │         │  utils/mingju.js     │
   │  排盘权威                 │         │  论断编排器           │
   │  lunar-javascript 兜底   │────────▶│                      │
   │  MIN_YEAR=1900           │         │  ┌─ wuxingScore       │
   │  MAX_YEAR=2100           │         │  ├─ wangShuai        │
   └──────────────────────────┘         │  ├─ yongShen         │
                                         │  └─ geju            │
                                         └──────────┬───────────┘
                                                    │
                                                    ▼
                                         ┌──────────────────────┐
                                         │  mingju 对象         │
                                         │  (确定性,不可改)     │
                                         └──────────┬───────────┘
                                                    │
                          ┌─────────────────────────┴──────────────┐
                          ▼                                          ▼
              ┌──────────────────────┐                  ┌──────────────────────┐
              │ promptBuilder.js     │                  │ fourSchoolPrompt.js  │
              │ formatMingliFacts()  │                  │ formatMingliFacts()  │
              │ + knowledgeContext   │                  │ + 4 家 query         │
              │ (basic / deep)       │                  │ (四家并列)           │
              └──────────┬───────────┘                  └──────────┬───────────┘
                         │                                         │
                         ▼                                         ▼
              ┌──────────────────────────────────────────────────────────┐
              │                    prompt (string)                       │
              │  【以下为系统确定性计算的命理结论,必须严格采用...】        │
              │  + (可选)【古籍依据】区块                                │
              └──────────────────────────┬───────────────────────────────┘
                                         │
                                         ▼
              ┌──────────────────────────────────────────────────────────┐
              │       axios.post(openai, { messages: [...] }, ...)       │
              │       timeout: 5000(防 21s 假死)                        │
              └────────────┬─────────────────────────────┬───────────────┘
                           │ success                      │ fail
                           ▼                              ▼
              ┌──────────────────────┐       ┌──────────────────────────────┐
              │ AI content (string)  │       │ localFallback.js             │
              │ (不修改论断,只翻译)  │       │ basic/deep/four-school 各不同 │
              └──────────────────────┘       └──────────────────────────────┘
```

---

## 各文件细节

### `bazi.js` — 排盘权威

**入参**:`{ year, month, day, hour, minute=0, gender }`
**出参**:完整 `paipanResult` 对象(4 柱 + 五行 + 藏干 + 十神 + 大运)
**边界**:`MIN_YEAR=1900`、`MAX_YEAR=2100`,超界抛 `INVALID_INPUT`(路由层 catch 返 400)
**农历**:`birth.calendar === 'lunar'` 走 `normalizeBirthToSolar`(闰月传负月份),由 `routes/analysis.js` 在 `computeFromBirth` 前处理

**关键**:**后端是唯一权威**,小程序可展示用户输入的盘,但**所有论断必须重算**,不能传客户端的论断进来。

### `mingju.js` — 论断编排器(唯一入口)

```js
function analyzeMingju(paipan) {
  const { scores } = scoreWuxing(paipan)
  const strength = judgeStrength(paipan, { scores })
  const yongShen = deriveYongShen(paipan, strength, scores)
  const geju = judgeGeju(paipan, strength)
  return { dayMaster, wuxingScore: scores, strength, yongShen, geju, basis, disclaimer }
}
```

**为什么是编排器**:四个子判定(五行 / 强弱 / 喜忌 / 格局)各自独立,但**调候需要先知身强弱**、**喜忌依赖五行打分** —— 顺序敏感,不能并行,也不能让上游调用方自己拼。

### `promptBuilder.js` — basic / deep 的 prompt 构造

- `formatMingliFacts(mingju)` —— 把 mingju 对象转成【已知结论】区块。**这段必须严格采用**的措辞是 AI 不重新推导的关键防线。
- `formatKnowledgeContext(knowledgeContext)` —— RAG 命中转【古籍依据】区块;空数组时返 `null`(调用方决定不注入)。
- `buildBasicPrompt(baziStr, mingju)` / `buildDeepPrompt(baziStr, dayunStr, mingju)` —— 拼最终提示词。

### `fourSchoolPrompt.js` — 四家并列

```js
const queries = buildFourSchoolQueries(mingju)
// { xu: '甲木日主,身强,格局"食神制杀",喜用神"火土"...',
//   liang: '甲木日主,从三轨吉凶看,喜用神"火土"...',
//   yuan: '甲木日主,从命宫小限纳音看,喜用神"火土"...',
//   wei: '甲木日主,八步法 ① 强弱:身强 ② 格局:食神制杀...' }

const [xuRefs, liangRefs, yuanRefs, weiRefs] = await Promise.all([
  retrieve(mingju, { query: queries.xu }),
  retrieve(mingju, { query: queries.liang }),
  ...
])
const prompt = buildFourSchoolPrompt(baziStr, dayunStr, mingju, knowledgeBySchool)
```

**为什么 query 必须不同**:四家 query 都是 mingju 拼的,但拼接侧重不同 —— 徐重格局/调候/体用、梁重三轨/神煞、袁重命宫/纳音、韦重八步法。**用同一个 query 会导致 4 家命中同一批 refs,产品差异化卖点消失**。

**为什么并发**:单家降级(`[]`)不阻塞其他家,总延迟 ≈ `max(单家 timeout)`,最坏 ≤ 3s。

### `knowledgeRetriever.js` — LightRAG HTTP 封装

```js
const refs = await retrieve(mingju, { query, topK: 5, timeout: 3000 })
// → [{ content, source, score }, ...] | []  // 失败/超时返空数组
```

**降级原则**:LightRAG 挂了/启不来/网络不通 → 优雅降级(返 `[]`),**产品解读功能不能因为知识库不可用就挂掉**。

**灌库源**:`bazi-skill-dist/lightrag/merged.json`(由 `bazi-skill-dist/` 下的索引构建脚本产出)。

**配置**:`LIGHTRAG_URL`(默认 `http://127.0.0.1:9621`)、`LIGHTRAG_TIMEOUT`(默认 3000ms)、`LIGHTRAG_TOPK`(默认 5)。

### `localFallback.js` — AI 网关挂了兜底

**三路径各自不同模板**(产品差异化护城河,不能共用一段换 4 个名字):

| 路径 | 函数 | 模板要点 |
|---|---|---|
| `basic` | `buildBasicFallback({ baziStr, mingju })` | 喜用神 + 命局特点 + 性格倾向 |
| `deep` | `buildDeepFallback({ baziStr, dayunStr, mingju })` | 命局总评 + 事业财运 + 感情婚姻 + 健康 + 人生建议 |
| `four-school` | `buildFourSchoolFallback({ baziStr, dayunStr, mingju })` | 四家分别拼不同方法论摘要(徐乐吾/梁湘润/袁树珊/韦千里)+ 四家综合 |

**开头必带 `【本地解读模板】`**,让用户知情。

---

## 关键防坑(从 P0/P1 复盘)

1. **`generateAnalysis` 永远要 `axios timeout: 5000`** —— 没显式 timeout 默认 0,等 TCP/AI 网关返回 → 21 秒假死(P0 #30,已修)。
2. **catch 走本地降级,不要返固定文案** —— 用户感知是"21s 后报错",体验远比"立刻看到本地解读"差。
3. **四家 query 必须不同** —— 同 query 命中同 refs,产品差异化消失。
4. **RAG 单家失败不阻塞其他家** —— `Promise.all` + 单家降级返 `[]`。
5. **论断绝不信任客户端** —— `computeFromBirth` 重新 `paipan()` + `analyzeMingju()`,不接受客户端传的任何结论字段。
6. **闰月传负月份** —— `Lunar.fromYmd(year, -abs(month), day)`,`isLeap` 标志也要传。
7. **立春换年** —— `paipan()` 已处理;**测试时 1990-02-03 vs 02-05 是关键边界**(`mingju.boundary.test.js`)。

---

## 测试锚点

- **黄金盘**:机主本人盘 2002-11-20 巳时男 + `bazi-skill-dist/cases/` 张学良 / 邵逸夫(均在 1900-2100 范围内)
- **算法层边界**:`utils/__tests__/mingju.boundary.test.js`(11 用例:最弱/最强盘、立春跨年、空藏干、1900/2100)
- **三路径 fallback**:`routes/__tests__/analysis_fallback.test.js`(mock axios ECONNABORTED/401/网络错)
- **四家并发 RAG**:`routes/__tests__/analysis_four_school.test.js`(mock retrieve 单家降级不影响整体)
- **权益注册表**:`utils/__tests__/entitlementRegistry.test.js`(无 Mongo 走 in-memory)
- **端到端 RAG 测试 mock HTTP**,不依赖 LightRAG 实际运行

跑测试:`cd backend && npm test`(当前 22 套件 / 183 用例 / ~4.5s 全绿)。

---

## 未来可加(暂无需求,记录在此)

- **算法层 trace / 调试可视化**:`mingju.js` 的 `basis` 数组已记录判定依据,可做调试页
- **RAG 缓存**:`mingju + query` 命中结果存 Redis,5min TTL,降低 LightRAG 压力
- **AI 解析校验**:AI 输出含"日主:甲"格式时做正则提取,与 mingju 对比,防止 AI 编造
- **多模型 fallback**:OpenAI 失败 → 国产模型 → 本地模板,三级降级