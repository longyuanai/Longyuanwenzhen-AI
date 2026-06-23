// test-bazi.js - 八字排盘功能测试
console.log('========================================');
console.log('    智能八字排盘功能测试');
console.log('========================================\n');

// 八字排盘算法
const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const WUXING = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土',
  '巳': '火', '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水'
};

const CANG_GAN = {
  '子': ['癸'], '丑': ['己', '癸', '辛'], '寅': ['甲', '丙', '戊'],
  '卯': ['乙'], '辰': ['戊', '乙', '癸'], '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'], '未': ['己', '丁', '乙'], '申': ['庚', '壬', '戊'],
  '酉': ['辛'], '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
};

function getYearPillar(year) {
  const ganIndex = (year - 4) % 10;
  const zhiIndex = (year - 4) % 12;
  return { gan: TIANGAN[ganIndex >= 0 ? ganIndex : ganIndex + 10], zhi: DIZHI[zhiIndex >= 0 ? zhiIndex : zhiIndex + 12] };
}

function getMonthPillar(year, month, yearGan) {
  const monthGanStart = { '甲': 2, '己': 2, '乙': 4, '庚': 4, '丙': 6, '辛': 6, '丁': 8, '壬': 8, '戊': 0, '癸': 0 };
  const zhiIndex = (month + 1) % 12;
  const ganIndex = (monthGanStart[yearGan] + month - 1) % 10;
  return { gan: TIANGAN[ganIndex], zhi: DIZHI[zhiIndex] };
}

function getDayPillar(year, month, day) {
  const baseDate = new Date(1900, 0, 1);
  const targetDate = new Date(year, month - 1, day);
  const days = Math.floor((targetDate - baseDate) / (1000 * 60 * 60 * 24));
  const offset = 10;
  const ganIndex = (offset + days) % 10;
  const zhiIndex = (offset + days) % 12;
  return { gan: TIANGAN[ganIndex], zhi: DIZHI[zhiIndex] };
}

function getHourPillar(dayGan, hour) {
  const hourGanStart = { '甲': 0, '己': 0, '乙': 2, '庚': 2, '丙': 4, '辛': 4, '丁': 6, '壬': 6, '戊': 8, '癸': 8 };
  let zhiIndex;
  if (hour === 23 || hour === 0) { zhiIndex = 0; } else { zhiIndex = Math.floor((hour + 1) / 2); }
  const ganIndex = (hourGanStart[dayGan] + zhiIndex) % 10;
  return { gan: TIANGAN[ganIndex], zhi: DIZHI[zhiIndex] };
}

function getShiShen(dayGan, targetGan) {
  const dayWuxing = WUXING[dayGan];
  const targetWuxing = WUXING[targetGan];
  const dayYinYang = TIANGAN.indexOf(dayGan) % 2;
  const targetYinYang = TIANGAN.indexOf(targetGan) % 2;
  const sameYinYang = dayYinYang === targetYinYang;

  const wuxingRelation = {
    '木': { '木': '比', '火': '食', '土': '财', '金': '官', '水': '印' },
    '火': { '火': '比', '土': '食', '金': '财', '水': '官', '木': '印' },
    '土': { '土': '比', '金': '食', '水': '财', '木': '官', '火': '印' },
    '金': { '金': '比', '水': '食', '木': '财', '火': '官', '土': '印' },
    '水': { '水': '比', '木': '食', '火': '财', '土': '官', '金': '印' }
  };

  const relation = wuxingRelation[dayWuxing][targetWuxing];
  const shiShenMap = {
    '比': sameYinYang ? '比肩' : '劫财',
    '食': sameYinYang ? '食神' : '伤官',
    '财': sameYinYang ? '偏财' : '正财',
    '官': sameYinYang ? '七杀' : '正官',
    '印': sameYinYang ? '偏印' : '正印'
  };
  return shiShenMap[relation];
}

function paipan(params) {
  const { year, month, day, hour, gender } = params;
  const yearPillar = getYearPillar(year);
  const monthPillar = getMonthPillar(year, month, yearPillar.gan);
  const dayPillar = getDayPillar(year, month, day);
  const hourPillar = getHourPillar(dayPillar.gan, hour);

  const tenGods = {
    yearGan: getShiShen(dayPillar.gan, yearPillar.gan),
    monthGan: getShiShen(dayPillar.gan, monthPillar.gan),
    hourGan: getShiShen(dayPillar.gan, hourPillar.gan)
  };

  return {
    yearPillar, monthPillar, dayPillar, hourPillar,
    tenGods,
    cangGan: {
      year: CANG_GAN[yearPillar.zhi],
      month: CANG_GAN[monthPillar.zhi],
      day: CANG_GAN[dayPillar.zhi],
      hour: CANG_GAN[hourPillar.zhi]
    },
    wuxing: {
      yearGan: WUXING[yearPillar.gan], yearZhi: WUXING[yearPillar.zhi],
      monthGan: WUXING[monthPillar.gan], monthZhi: WUXING[monthPillar.zhi],
      dayGan: WUXING[dayPillar.gan], dayZhi: WUXING[dayPillar.zhi],
      hourGan: WUXING[hourPillar.gan], hourZhi: WUXING[hourPillar.zhi]
    },
    input: { year, month, day, hour, gender }
  };
}

// 测试用例
const testCases = [
  { year: 1990, month: 5, day: 15, hour: 14, gender: 'male', name: '测试用户1' },
  { year: 1985, month: 8, day: 20, hour: 6, gender: 'female', name: '测试用户2' },
  { year: 2000, month: 1, day: 1, hour: 0, gender: 'male', name: '测试用户3' }
];

testCases.forEach((tc, index) => {
  console.log(`【测试 ${index + 1}】${tc.name}`);
  console.log(`出生时间: ${tc.year}年${tc.month}月${tc.day}日 ${tc.hour}时 (${tc.gender === 'male' ? '男' : '女'})`);
  console.log('-'.repeat(50));

  const result = paipan(tc);

  console.log('\n四柱八字:');
  console.log(`  年柱: ${result.yearPillar.gan}${result.yearPillar.zhi} (${result.tenGods.yearGan})`);
  console.log(`  月柱: ${result.monthPillar.gan}${result.monthPillar.zhi} (${result.tenGods.monthGan})`);
  console.log(`  日柱: ${result.dayPillar.gan}${result.dayPillar.zhi} (日主)`);
  console.log(`  时柱: ${result.hourPillar.gan}${result.hourPillar.zhi} (${result.tenGods.hourGan})`);

  console.log('\n五行配置:');
  console.log(`  年柱: ${result.wuxing.yearGan}${result.wuxing.yearZhi}`);
  console.log(`  月柱: ${result.wuxing.monthGan}${result.wuxing.monthZhi}`);
  console.log(`  日柱: ${result.wuxing.dayGan}${result.wuxing.dayZhi}`);
  console.log(`  时柱: ${result.wuxing.hourGan}${result.wuxing.hourZhi}`);

  console.log('\n地支藏干:');
  console.log(`  年支藏干: ${result.cangGan.year.join(' ')}`);
  console.log(`  月支藏干: ${result.cangGan.month.join(' ')}`);
  console.log(`  日支藏干: ${result.cangGan.day.join(' ')}`);
  console.log(`  时支藏干: ${result.cangGan.hour.join(' ')}`);

  console.log('\n' + '='.repeat(50) + '\n');
});

console.log('✓ 测试完成！');
console.log('\n提示: 后端服务正在运行于 http://localhost:3000');
console.log('提示: 可通过微信开发者工具导入 miniprogram 目录查看小程序');
