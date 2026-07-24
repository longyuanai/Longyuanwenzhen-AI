// utils/localFallback.js - 本地降级模板
//
// 用途：当 OpenAI / AI 网关超时 / 失败 / 配错 key 时,直接基于 utils/mingju.js
// 的确定性论断拼出可读解读段落,不再让用户卡 21 秒看到「命理解读生成中,请稍后再试」。
//
// 设计原则:
//   - 不假装是 AI:不写「我作为命理师认为」这种话术。开头明确标注「本地模板」让用户知情
//   - 内容来源只用 mingju(确定性结论)与 baziStr/dayunStr(已算的字符串),绝不编造
//   - 四家并列路径给四家分别拼不同方法论摘要,保住产品差异化护城河(不能共用一段换 4 个名字)
//   - 用同样的非绝对化措辞(可能/倾向于/容易),对齐 utils/promptBuilder.js 的 COMMON_RULES
//   - 末尾统一附 mingju.disclaimer
//
// 调用约定:
//   buildBasicFallback({ baziStr, mingju }) -> string
//   buildDeepFallback({ baziStr, dayunStr, mingju }) -> string
//   buildFourSchoolFallback({ baziStr, dayunStr, mingju }) -> string

const { DISCLAIMER } = require('./mingju')

const LOCAL_TAG = '【本地解读模板】AI 服务暂时不可用,以下为基于系统已算结论的模板化解读。\n'

function fmtXi(mingju) {
  return mingju.yongShen.xiShen.join('、') || '无'
}

function fmtJi(mingju) {
  return mingju.yongShen.jiShen.join('、') || '无'
}

function fmtTiaoHou(mingju) {
  const th = mingju.yongShen.tiaoHou
  if (!th.need.length) return '无显著调候需求'
  return `${th.season}月,调候喜${th.need.join('')}${th.urgent ? '(急用)' : ''}`
}

function fmtStrength(mingju) {
  const s = mingju.strength
  const parts = [
    s.deLing ? '得令' : '不得令',
    s.deDi ? '得地' : '不得地',
    s.deShi ? '得势' : '不得势'
  ].filter(Boolean)
  return `${s.label}(${parts.join('、')})`
}

function fmtConflicts(mingju) {
  const cs = mingju.yongShen.conflicts
  if (!Array.isArray(cs) || cs.length === 0) return ''
  return `\n冲突提示:${cs.join('；')}`
}

function basicSection(mingju) {
  const dm = mingju.dayMaster
  const ys = mingju.yongShen
  return [
    '一、喜用神说明',
    `日主为${dm.gan}${dm.element},${fmtStrength(mingju)}。`,
    `喜用神五行:${fmtXi(mingju)};忌神五行:${fmtJi(mingju)}。`,
    `调候:${fmtTiaoHou(mingju)}。`,
    `五行倾向:${JSON.stringify(mingju.wuxingScore, null, 0)}。`,
    `${fmtConflicts(mingju)}`,
    '',
    '二、命局特点',
    `格局:"${mingju.geju.name}"${mingju.geju.isSpecial ? '(特殊格局)' : ''}${mingju.geju.isPure ? ',格局清纯' : ''}。`,
    `判定依据:${mingju.basis.join('；')}。`,
    '',
    '三、性格倾向(基于五行与身强弱)',
    `${dm.element}行日主,${mingju.strength.label},倾向于${dm.element === '金' ? '果断、重义' : dm.element === '木' ? '仁慈、上进' : dm.element === '水' ? '善变、聪慧' : dm.element === '火' ? '热情、表现' : '稳重、包容'}的气质特征。`,
    '',
    DISCLAIMER
  ].join('\n')
}

function deepSections(baziStr, dayunStr, mingju) {
  const dm = mingju.dayMaster
  const ys = mingju.yongShen
  return [
    '一、命局总评',
    `八字:${baziStr}`,
    `大运序列:${dayunStr}`,
    `日主${dm.gan}${dm.element},${fmtStrength(mingju)},格局"${mingju.geju.name}"。`,
    `喜用神:${fmtXi(mingju)};忌神:${fmtJi(mingju)}。`,
    `调候:${fmtTiaoHou(mingju)}。`,
    `判定依据:${mingju.basis.join('；')}。`,
    `${fmtConflicts(mingju)}`,
    '',
    '二、事业财运',
    `命局五行分布:${JSON.stringify(mingju.wuxingScore)}。`,
    `若事业方向与喜用神五行一致(${fmtXi(mingju)}),倾向于较顺遂;`,
    `若与忌神五行(${fmtJi(mingju)})重合较多,则容易遇阻。具体取舍以现实行业属性为准。`,
    '',
    '三、感情婚姻',
    `日主${dm.element === '金' || dm.element === '水' ? '偏阳金水' : dm.element === '木' ? '属木' : dm.element === '火' ? '属火' : '属土'},`,
    `感情倾向看配偶星(日主所克为财、所生为官杀)的五行强弱。`,
    `本局财/官五行倾向为:${fmtXi(mingju)} 五行旺的方向,可能较有利于关系稳定。`,
    '',
    '四、健康运势',
    `五行对应五脏:金=肺/呼吸,木=肝/筋,水=肾/膀胱,火=心/小肠,土=脾胃。`,
    `命局较弱或受克的五行(${fmtJi(mingju)}),倾向于需要留意对应脏腑的日常调养。`,
    '',
    '五、人生建议',
    `- 顺势:尽量让生活、事业、居所颜色与喜用神五行(${fmtXi(mingju)})对齐`,
    `- 避坑:远离忌神方向(${fmtJi(mingju)})的过度消耗`,
    `- 调候:注意${fmtTiaoHou(mingju)}对作息/季节的影响`,
    '',
    DISCLAIMER
  ].join('\n')
}

function fourSchoolSection(school, mingju) {
  const titleMap = {
    xu: '【徐乐吾派】格局·调候·体用',
    liang: '【梁湘润派】三轨·金不换·神煞',
    yuan: '【袁树珊派】命宫·小限·纳音',
    wei: '【韦千里派】八步法'
  }
  const focusMap = {
    xu: [
      '本派视角:格局成败 + 相神配合 + 调候用神链 + 体用精神',
      `格局"${mingju.geju.name}",${mingju.geju.isPure ? '清纯可用;' : '需看相神是否配合;'}`,
      `调候链:${fmtTiaoHou(mingju)}`,
      `体用:日主${mingju.dayMaster.gan},${fmtStrength(mingju)},用神取${fmtXi(mingju)}`
    ],
    liang: [
      '本派视角:三轨(吉凶/格局/调候) + 金不换断法 + 神煞实操',
      `三轨第一轨(吉凶):喜用神${fmtXi(mingju)}方向有利于趋吉,忌神${fmtJi(mingju)}方向需慎`,
      `三轨第二轨(格局):"${mingju.geju.name}",${mingju.geju.isSpecial ? '特殊格局按专法论;' : '常规格局;'}`,
      `三轨第三轨(调候):${fmtTiaoHou(mingju)}`,
      '神煞实操(需配合具体四柱取神煞,本模板仅给方法论要点)'
    ],
    yuan: [
      '本派视角:命宫补柱 + 小限流年 + 纳音五行 + 化气五行',
      `命宫/小限:动态流年需要出生月日时推算,模板不展开`,
      `纳音:四柱纳音由代码计算,本盘日主纳音见 mingju.wuxingScore`,
      `化气:日主${mingju.dayMaster.gan}${mingju.dayMaster.element},化气与否需看月令是否同气`
    ],
    wei: [
      '本派视角:八步法(强弱→格局→用神→喜忌→岁运→六亲→性情→事业)',
      `① 强弱:${fmtStrength(mingju)}`,
      `② 格局:"${mingju.geju.name}"`,
      `③ 用神:${fmtXi(mingju)}`,
      `④ 喜忌:喜${fmtXi(mingju)},忌${fmtJi(mingju)}`,
      `⑤ 岁运:大运序列见 dayunStr;流年逐年推断`,
      `⑥ 六亲:依十神配置,模板仅给结构`,
      `⑦ 性情:${mingju.dayMaster.element}行 + ${mingju.strength.label}`,
      `⑧ 事业:喜用神方向(${fmtXi(mingju)})较顺,忌神方向(${fmtJi(mingju)})需规避`
    ]
  }
  const lines = [
    '──────────────────────────────────────────',
    `  ${titleMap[school] || school}`,
    '──────────────────────────────────────────',
    ''
  ]
  focusMap[school].forEach((l) => lines.push(l, ''))
  return lines.join('\n')
}

function fourSchoolSynthesis(mingju) {
  const cs = mingju.yongShen.conflicts
  const conflictLine = cs && cs.length
    ? `\n冲突提示(系统已检测):${cs.join('；')}\n(注:此为扶抑与调候两套体系冲突的客观事实,各派对冲突的取舍方法不同。)`
    : ''

  return [
    '──────────────────────────────────────────',
    '  ★ 四家综合判断(本地模板)',
    '──────────────────────────────────────────',
    '',
    '1. 四家共识:',
    `   - 喜用神方向:${fmtXi(mingju)}`,
    `   - 忌神方向:${fmtJi(mingju)}`,
    `   - 调候需求:${fmtTiaoHou(mingju)}`,
    `   - 格局定位:"${mingju.geju.name}"`,
    '',
    '2. 四家分歧焦点(方法论差异):',
    '   - 徐乐吾重体用精神链是否完整',
    '   - 梁湘润重三轨与神煞实操',
    '   - 袁树珊重命宫/小限/纳音的补充信息',
    '   - 韦千里走八步法,强调简洁精炼',
    `${conflictLine}`,
    '',
    '3. 综合建议:',
    `   - 顺势方向:五行${fmtXi(mingju)}对应行业/方位/颜色`,
    `   - 规避方向:五行${fmtJi(mingju)}相关领域`,
    '',
    DISCLAIMER
  ].join('\n')
}

function buildBasicFallback({ baziStr, mingju }) {
  return [
    LOCAL_TAG,
    `八字:${baziStr}`,
    '',
    basicSection(mingju)
  ].join('\n')
}

function buildDeepFallback({ baziStr, dayunStr, mingju }) {
  return [
    LOCAL_TAG,
    `八字:${baziStr}`,
    `大运:${dayunStr}`,
    '',
    deepSections(baziStr, dayunStr, mingju)
  ].join('\n')
}

function buildFourSchoolFallback({ baziStr, dayunStr, mingju }) {
  const sections = [
    LOCAL_TAG,
    `命盘:${baziStr}`,
    `大运:${dayunStr}`,
    '',
    fourSchoolSection('xu', mingju),
    fourSchoolSection('liang', mingju),
    fourSchoolSection('yuan', mingju),
    fourSchoolSection('wei', mingju),
    fourSchoolSynthesis(mingju)
  ]
  return sections.join('\n')
}

module.exports = {
  buildBasicFallback,
  buildDeepFallback,
  buildFourSchoolFallback
}