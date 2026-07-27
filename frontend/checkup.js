(function () {
  // ── 双语 ──────────────────────────────────────────────────────
  // 一个文件两种语言，而不是维护两份 HTML —— 两份副本必然漂移
  // （改了中文忘了英文，正是这个项目里客服微信号写两处踩过的坑）。
  //
  // 语言来源优先级：?lang= > localStorage > 浏览器语言 > 中文
  // 命理术语一律由后端返回（/checkup 带 lang=en 时给 labels 块），
  // 前端不再自建一份术语表 —— 后端那张已被测试锁死必须穷尽算法取值。
  var I18N = {
    zh: {
      title: '八字 · 五行体检', subtitle: '传统命理文化 · 性格与五行结构参考',
      formTitle: '填写出生信息',
      genderLabel: '性别', calLabel: '历法', hourLabel: '时辰',
      privacy: '结果即时生成，不保存你的任何信息', glanceTag: '命格速览',
      pageTitle: 'AI 八字 · 五行体检',
      male: '男', female: '女', solar: '阳历(公历)', lunar: '农历(阴历)',
      year: '年', month: '月', day: '日', leap: '该农历月为闰月',
      submit: '免费生成我的五行体检', submitting: '排盘中…',
      pillarsTitle: '四柱八字', wuxingTitle: '五行能量分布',
      strengthTitle: '身强弱', yongshenTitle: '喜用 · 忌神 · 格局',
      xiLabel: '喜用五行（宜亲近的方向）', jiLabel: '忌神五行（宜避开的方向）',
      lockTitle: '🔒 深度命局报告（即将上线）',
      lock1: '为什么是这些喜用神？如何在生活中趋避',
      lock2: '事业财运：适合的方向与求财方式',
      lock3: '感情婚姻：正缘特征与大致应期',
      lock4: '健康预警：体质弱点与调理建议',
      lock5: '大运流年：未来 10 年走势起伏',
      price: '完整报告 <b>¥19.9</b>',
      unlock: '我想看完整报告', back: '重新测算',
      contactTitle: '想要完整解读 / 校准时辰 / 答疑',
      wxLabel: '微信号：', copyWx: '复制微信号',
      switchTo: 'English',
      dayMasterLabel: '日主：', cangPrefix: '藏 ',
      ratio: function (p) { return '同党占比 ' + p + '%'; },
      badges: [['得令', 'deLing'], ['得地', 'deDi'], ['得势', 'deShi']],
      yes: '是', no: '否', none: '无',
      pillarNames: { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' },
      dayMarker: ' · 日主', dayMasterShen: '元',
      tiaoHouPrefix: '调候：', tiaoHouMonth: '月，', tiaoHouNeed: '喜见 ',
      tiaoHouUrgent: '（急用）', tiaoHouNone: '无显著寒暖偏向',
      gejuPrefix: '格局：', gejuImpure: '（取格欠清纯）',
      errIncomplete: '请填写完整的出生年月日',
      errFail: '生成失败',
      errNet: function (api) { return '连接服务失败：请确认后端已启动（' + api + '）'; },
      hourUnknown: '不确定 / 不知道时辰',
      shichen: ['子时 (23-01)', '丑时 (01-03)', '寅时 (03-05)', '卯时 (05-07)',
        '辰时 (07-09)', '巳时 (09-11)', '午时 (11-13)', '未时 (13-15)',
        '申时 (15-17)', '酉时 (17-19)', '戌时 (19-21)', '亥时 (21-23)'],
      unknownHourMsg: function (wx) {
        return '时辰对命局影响很大，不确定时直接排盘会让身强弱、格局失真。\n\n'
          + '可以联系作者，用你的「出生大致时段 + 性格特征」帮你校准时辰，再出准确报告。\n\n'
          + '点「确定」复制作者微信号：' + wx;
      },
      unlockMsg: function (wx) {
        return '深度命局报告（约6000字）¥19.9\n'
          + '含喜用神趋避、事业财运、感情应期、健康预警、未来10年大运。\n\n'
          + '点「确定」复制作者微信号：' + wx + '\n添加后发送你的出生信息即可预约。';
      },
      copiedMsg: function (wx) { return '微信号已复制：' + wx + '\n打开微信「添加朋友」粘贴即可'; },
      copyManual: function (wx) { return '请手动添加微信号：' + wx; }
    },
    en: {
      title: 'BaZi · Five-Element Check',
      subtitle: 'A classical Chinese framework for character and elemental balance',
      formTitle: 'Your birth details',
      genderLabel: 'Gender', calLabel: 'Calendar', hourLabel: 'Birth hour',
      privacy: 'Generated on the spot — none of your details are stored.',
      glanceTag: 'At a glance',
      pageTitle: 'BaZi · Five-Element Check',
      male: 'Male', female: 'Female', solar: 'Gregorian', lunar: 'Chinese lunar',
      year: 'Year', month: 'Month', day: 'Day', leap: 'This lunar month is a leap month',
      submit: 'Get my free five-element check', submitting: 'Calculating…',
      pillarsTitle: 'Four Pillars', wuxingTitle: 'Elemental balance',
      strengthTitle: 'Day Master strength', yongshenTitle: 'Favorable · Unfavorable · Structure',
      xiLabel: 'Favorable elements (worth leaning into)',
      jiLabel: 'Unfavorable elements (worth being deliberate about)',
      lockTitle: '🔒 Full chart report (coming soon)',
      lock1: 'Why these favorable elements, and how to work with them',
      lock2: 'Career and wealth: directions that suit this chart',
      lock3: 'Relationships: what to look for and rough timing',
      lock4: 'Health: constitutional weak points worth attention',
      lock5: 'Luck pillars: how the next 10 years trend',
      price: 'Full report <b>¥19.9</b>',
      unlock: 'I want the full report', back: 'Start over',
      contactTitle: 'Full reading / birth-time calibration / questions',
      wxLabel: 'WeChat: ', copyWx: 'Copy WeChat ID',
      switchTo: '中文',
      dayMasterLabel: 'Day Master: ', cangPrefix: 'Hidden ',
      ratio: function (p) { return 'Supporting share ' + p + '%'; },
      badges: [['Seasonal support', 'deLing'], ['Root in branches', 'deDi'], ['Stem allies', 'deShi']],
      yes: 'yes', no: 'no', none: 'none',
      pillarNames: { year: 'Year', month: 'Month', day: 'Day', hour: 'Hour' },
      dayMarker: ' · Day Master', dayMasterShen: 'Self',
      tiaoHouPrefix: 'Climatic balance: ', tiaoHouMonth: ' birth, ', tiaoHouNeed: 'needs ',
      tiaoHouUrgent: ' (urgent)', tiaoHouNone: 'no strong seasonal tilt',
      gejuPrefix: 'Structure: ', gejuImpure: ' (not a clean formation)',
      errIncomplete: 'Please fill in the full birth date',
      errFail: 'Could not generate the reading',
      errNet: function (api) { return 'Could not reach the service (' + api + '). Is the backend running?'; },
      hourUnknown: "I don't know my birth hour",
      shichen: ['Zi (23-01)', 'Chou (01-03)', 'Yin (03-05)', 'Mao (05-07)',
        'Chen (07-09)', 'Si (09-11)', 'Wu (11-13)', 'Wei (13-15)',
        'Shen (15-17)', 'You (17-19)', 'Xu (19-21)', 'Hai (21-23)'],
      unknownHourMsg: function (wx) {
        return 'The birth hour matters a great deal — without it, the strength and '
          + 'structure readings can come out wrong.\n\n'
          + 'Get in touch and we can narrow it down from your rough time of birth '
          + 'plus a few personality details, then run an accurate report.\n\n'
          + 'Press OK to copy the WeChat ID: ' + wx;
      },
      unlockMsg: function (wx) {
        return 'Full chart report (~6000 words) ¥19.9\n'
          + 'Covers favorable elements in practice, career and wealth, relationships, '
          + 'health, and the next 10 years of luck pillars.\n\n'
          + 'Press OK to copy the WeChat ID: ' + wx + '\nThen send your birth details.';
      },
      copiedMsg: function (wx) { return 'WeChat ID copied: ' + wx; },
      copyManual: function (wx) { return 'Please add this WeChat ID manually: ' + wx; }
    }
  };

  // API 地址：默认本机，?api= 或 localStorage 可覆盖，便于换部署环境
  var params = new URLSearchParams(location.search);
  var API = params.get('api') || localStorage.getItem('apiBase') || 'http://localhost:8080/api/v1';
  if (params.get('api')) localStorage.setItem('apiBase', params.get('api'));

  // 语言：?lang= > localStorage > 浏览器语言 > 中文
  function resolveLang() {
    var q = (params.get('lang') || '').toLowerCase();
    if (I18N[q]) { localStorage.setItem('lang', q); return q; }
    var saved = localStorage.getItem('lang');
    if (I18N[saved]) return saved;
    return /^en/i.test(navigator.language || '') ? 'en' : 'zh';
  }
  var LANG = resolveLang();
  var t = I18N[LANG];
  document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';

  // 填充所有 data-i18n 静态文案
  function applyStaticText() {
    document.title = t.pageTitle;
    document.querySelectorAll('[data-i18n]').forEach(function (n) {
      var v = t[n.dataset.i18n];
      if (v == null) return;
      // price 那条含 <b>，其余一律 textContent（防 XSS）
      if (n.dataset.i18n === 'price') n.innerHTML = v;
      else n.textContent = v;
    });
  }

  // 时辰值固定，名称按语言取（英文用拼音，西方读者认不出「子丑寅卯」）
  var HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  var state = { gender: 'male', calendar: 'solar' };
  var $ = function (id) { return document.getElementById(id); };

  // 微信号：上线前替换为你的真实微信号
  var WECHAT_ID = 'hjz13550604865';

  // 初始化时辰下拉（默认午时，多数人记得大概时段）
  // 顶部加「不确定/不知道」——命理上缺时柱会让旺衰失真，不假装能算，转为联系校准
  var hourSel = $('in-hour');
  var unknownOpt = document.createElement('option');
  unknownOpt.value = 'unknown'; unknownOpt.textContent = t.hourUnknown;
  hourSel.appendChild(unknownOpt);
  HOURS.forEach(function (h, i) {
    var o = document.createElement('option');
    o.value = h; o.textContent = t.shichen[i]; if (i === 6) o.selected = true;
    hourSel.appendChild(o);
  });
  applyStaticText();

  // 语言切换：带上当前 api 参数，切完刷新
  $('lang-switch').textContent = t.switchTo;
  $('lang-switch').onclick = function (e) {
    e.preventDefault();
    var next = LANG === 'en' ? 'zh' : 'en';
    localStorage.setItem('lang', next);
    var u = new URL(location.href);
    u.searchParams.set('lang', next);
    location.href = u.toString();
  };

  // segmented 控件
  function bindSeg(wrapId, key, onChange) {
    var btns = $(wrapId).querySelectorAll('button');
    btns.forEach(function (b) {
      b.onclick = function () {
        btns.forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); state[key] = b.dataset.v; if (onChange) onChange();
      };
    });
  }
  bindSeg('seg-gender', 'gender');
  bindSeg('seg-cal', 'calendar', function () {
    $('leap-wrap').classList.toggle('hidden', state.calendar !== 'lunar');
  });

  function showErr(msg) { var e = $('err'); e.textContent = msg; e.classList.remove('hidden'); }
  function clearErr() { $('err').classList.add('hidden'); }

  $('btn-go').onclick = function () {
    clearErr();
    // 时辰未知：命理上缺时柱会让身强弱/格局失真，不强行排盘，引导联系校准
    if (hourSel.value === 'unknown') {
      showUnknownHour();
      return;
    }
    var birth = {
      year: parseInt($('in-year').value, 10),
      month: parseInt($('in-month').value, 10),
      day: parseInt($('in-day').value, 10),
      hour: parseInt(hourSel.value, 10),
      minute: 0,
      gender: state.gender,
      calendar: state.calendar,
      isLeap: $('in-leap').checked
    };
    if (!birth.year || !birth.month || !birth.day) { showErr(t.errIncomplete); return; }

    $('btn-go').textContent = t.submitting; $('btn-go').disabled = true;
    fetch(API + '/analysis/checkup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birth: birth, lang: LANG })
    }).then(function (r) { return r.json(); }).then(function (res) {
      $('btn-go').textContent = t.submit; $('btn-go').disabled = false;
      if (res.code !== 200) { showErr(res.message || t.errFail); return; }
      render(res.data);
    }).catch(function () {
      $('btn-go').textContent = t.submit; $('btn-go').disabled = false;
      showErr(t.errNet(API));
    });
  };

  // 工具:创建带 class 的元素(无 innerHTML,绕 XSS)
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function render(d) {
    // 英文时后端会附 labels 块（术语已由 utils/i18n/baziTerms.js 翻好）；
    // 中文时没有该字段，走原始字段。前端不自建术语表。
    var L = d.labels || null;

    $('r-oneliner').textContent = d.oneLiner;
    $('r-daymaster').textContent = L ? L.dayMaster : (d.dayMaster.gan + d.dayMaster.element);

    // 四柱
    var pillars = $('r-pillars');
    clear(pillars);
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var p = d.pillars[k];
      var lp = L ? L.pillars[k] : null;
      // 英文藏干只取拼音："Wu (Yang Earth)" → "Wu"，否则一柱能撑到三行
      var cang = lp
        ? lp.cang.map(function (c) { return c.split(' (')[0]; }).join(' ')
        : (p.cang || []).join(' ');
      var pillar = el('div', 'pillar' + (k === 'day' ? ' day' : ''));
      pillar.appendChild(el('div', 'pn', t.pillarNames[k] + (k === 'day' ? t.dayMarker : '')));
      var ganShen = lp ? lp.ganShen : p.ganShen;
      pillar.appendChild(el('div', 'ss', (ganShen === '日主' || ganShen === 'Day Master') ? t.dayMasterShen : ganShen));
      // 干支本体保留汉字：这是命理符号本身，英文读者也是看这两个字，
      // 拼音在 labels 里另给（此处空间不够，放 title 属性供悬停）
      var gz1 = el('div', 'gz');
      var g1 = el('span', 'e-' + p.ganWuxing, p.gan);
      if (lp) g1.title = lp.gan;
      gz1.appendChild(g1); pillar.appendChild(gz1);
      var gz2 = el('div', 'gz');
      var g2 = el('span', 'e-' + p.zhiWuxing, p.zhi);
      if (lp) g2.title = lp.zhi;
      gz2.appendChild(g2); pillar.appendChild(gz2);
      pillar.appendChild(el('div', 'ss', lp ? lp.zhiShen : p.zhiShen));
      pillar.appendChild(el('div', 'cang', t.cangPrefix + cang));
      pillars.appendChild(pillar);
    });

    // 五行能量条
    var sc = d.wuxingScore, order = ['木', '火', '土', '金', '水'];
    var total = order.reduce(function (s, e) { return s + (sc[e] || 0); }, 0) || 1;
    var wx = $('r-wuxing');
    clear(wx);
    order.forEach(function (e) {
      var pct = Math.round((sc[e] || 0) / total * 100);
      var bar = el('div', 'bar');
      bar.appendChild(el('div', 'nm e-' + e, L ? L.elements[e] : e));
      var track = el('div', 'track');
      var fill = el('div', 'fill bg-' + e);
      fill.style.width = pct + '%';
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(el('div', 'vl', pct + '%'));
      wx.appendChild(bar);
    });

    // 身强弱
    $('r-strength').textContent = L ? L.strength : d.strength.label;
    $('r-ratio').textContent = t.ratio(Math.round((d.strength.ratio || 0) * 100));
    var badges = $('r-badges');
    clear(badges);
    t.badges.forEach(function (b) {
      var on = !!d.strength[b[1]];
      badges.appendChild(el('span', 'badge' + (on ? ' yes' : ''), b[0] + ': ' + (on ? t.yes : t.no)));
    });

    // 喜忌
    function fillTags(nodeId, list, cls) {
      var node = $(nodeId);
      clear(node);
      if (!list || !list.length) { node.appendChild(el('span', 'sub', t.none)); return; }
      list.forEach(function (e) { node.appendChild(el('span', cls, e)); });
    }
    fillTags('r-xi', L ? L.xiShen : d.yongShen.xiShen, 'tag-xi');
    fillTags('r-ji', L ? L.jiShen : d.yongShen.jiShen, 'tag-ji');

    // 调候
    var th = d.yongShen.tiaoHou || {};
    var tiaohou = $('r-tiaohou');
    clear(tiaohou);
    var lth = L ? L.tiaoHou : null;
    tiaohou.appendChild(document.createTextNode(
      t.tiaoHouPrefix + (lth ? lth.season : (th.season || '-')) + t.tiaoHouMonth));
    var need = lth ? lth.need : (th.need || []);
    if (need.length) {
      tiaohou.appendChild(document.createTextNode(t.tiaoHouNeed));
      tiaohou.appendChild(el('b', null, need.join(L ? ', ' : '')));
      tiaohou.appendChild(document.createTextNode(th.urgent ? t.tiaoHouUrgent : ''));
    } else {
      tiaohou.appendChild(document.createTextNode(t.tiaoHouNone));
    }

    // 格局
    var geju = $('r-geju');
    clear(geju);
    geju.appendChild(document.createTextNode(t.gejuPrefix));
    geju.appendChild(el('b', null, L ? L.geju : d.geju.name));
    if (d.geju.isPure === false) geju.appendChild(document.createTextNode(t.gejuImpure));

    $('r-disclaimer').textContent = d.disclaimer;
    $('wx-id').textContent = WECHAT_ID;

    $('screen-input').classList.add('hidden');
    $('screen-report').classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  $('btn-copy-wx').onclick = copyWechat;

  // 复制微信号到剪贴板（失败则降级为提示手动复制）
  function copyWechat() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(WECHAT_ID).then(function () {
        alert(t.copiedMsg(WECHAT_ID));
      }).catch(function () {
        alert(t.copyManual(WECHAT_ID));
      });
    } else {
      alert(t.copyManual(WECHAT_ID));
    }
  }

  // 时辰未知：转为联系校准入口（命理刚需，也是获客钩子）
  function showUnknownHour() {
    var ok = confirm(t.unknownHourMsg(WECHAT_ID));
    if (ok) copyWechat();
  }

  // 钩子：MVP 不真支付，引导加微信人工承接付费意愿（验证需求 + 收口变现）
  $('btn-unlock').onclick = function () {
    var n = (parseInt(localStorage.getItem('unlockIntent') || '0', 10)) + 1;
    localStorage.setItem('unlockIntent', n);
    console.log('[intent] unlock clicked, total=' + n);
    var ok = confirm(t.unlockMsg(WECHAT_ID));
    if (ok) copyWechat();
  };

  $('btn-back').onclick = function () {
    $('screen-report').classList.add('hidden');
    $('screen-input').classList.remove('hidden');
    window.scrollTo(0, 0);
  };
})();
