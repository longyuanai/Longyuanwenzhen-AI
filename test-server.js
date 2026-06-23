// test-server.js - 测试服务器
const http = require('http');
const url = require('url');

// 八字排盘算法
const TIANGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DIZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const WUXING = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土',
  '巳': '火', '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水'
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

function paipan(params) {
  const { year, month, day, hour, gender } = params;
  const yearPillar = getYearPillar(year);
  const monthPillar = getMonthPillar(year, month, yearPillar.gan);
  const dayPillar = getDayPillar(year, month, day);
  const hourPillar = getHourPillar(dayPillar.gan, hour);

  return {
    yearPillar, monthPillar, dayPillar, hourPillar,
    wuxing: {
      yearGan: WUXING[yearPillar.gan], yearZhi: WUXING[yearPillar.zhi],
      monthGan: WUXING[monthPillar.gan], monthZhi: WUXING[monthPillar.zhi],
      dayGan: WUXING[dayPillar.gan], dayZhi: WUXING[dayPillar.zhi],
      hourGan: WUXING[hourPillar.gan], hourZhi: WUXING[hourPillar.zhi]
    },
    input: { year, month, day, hour, gender }
  };
}

// 创建服务器
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 路由处理
  if (path === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ code: 200, message: 'success', data: { status: 'healthy', timestamp: Date.now() }, timestamp: Date.now() }));
  }
  else if (path === '/api/v1/bazi/paipan' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const result = paipan(data);
        res.writeHead(200);
        res.end(JSON.stringify({ code: 200, message: 'success', data: result, timestamp: Date.now() }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ code: 400, message: 'Invalid request', data: null, timestamp: Date.now() }));
      }
    });
  }
  else if (path === '/api/v1/analysis/basic' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const dayGan = data.dayGan || '甲';
        const content = `## 命局分析

您的八字排盘已完成。

### 基本信息
- 日主：**${dayGan}**
- 五行：${data.wuxing ? JSON.stringify(data.wuxing) : '未知'}

### 性格特点
根据您的八字配置，您可能具有以下性格特点：
- 思维敏捷，善于分析
- 为人稳重，做事有计划
- 注重细节，追求完美

### 命理建议
- **事业**：适合从事需要分析和规划的工作
- **感情**：宜找性格互补的伴侣
- **健康**：注意劳逸结合

---
*此为基础解读，仅供参考*`;

        res.writeHead(200);
        res.end(JSON.stringify({ code: 200, message: 'success', data: { content, type: 'basic' }, timestamp: Date.now() }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ code: 400, message: 'Invalid request', data: null, timestamp: Date.now() }));
      }
    });
  }
  else if (path === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({
      code: 200,
      message: '智能八字排盘API服务',
      data: {
        endpoints: [
          'GET /health - 健康检查',
          'POST /api/v1/bazi/paipan - 八字排盘',
          'POST /api/v1/analysis/basic - 基础解读'
        ]
      },
      timestamp: Date.now()
    }));
  }
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ code: 404, message: 'Not found', data: null, timestamp: Date.now() }));
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log('========================================');
  console.log('    智能八字排盘 API 服务');
  console.log('========================================');
  console.log(`服务地址: http://localhost:${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`排盘接口: POST http://localhost:${PORT}/api/v1/bazi/paipan`);
  console.log(`解读接口: POST http://localhost:${PORT}/api/v1/analysis/basic`);
  console.log('========================================');
  console.log('按 Ctrl+C 停止服务');
  console.log('');
});
