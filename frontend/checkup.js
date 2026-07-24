(function () {
  // API 地址：默认本机，?api= 或 localStorage 可覆盖，便于换部署环境
  var params = new URLSearchParams(location.search);
  var API = params.get('api') || localStorage.getItem('apiBase') || 'http://localhost:8080/api/v1';
  if (params.get('api')) localStorage.setItem('apiBase', params.get('api'));

  var SHICHEN = [
    ['子时 (23-01)', 0], ['丑时 (01-03)', 2], ['寅时 (03-05)', 4], ['卯时 (05-07)', 6],
    ['辰时 (07-09)', 8], ['巳时 (09-11)', 10], ['午时 (11-13)', 12], ['未时 (13-15)', 14],
    ['申时 (15-17)', 16], ['酉时 (17-19)', 18], ['戌时 (19-21)', 20], ['亥时 (21-23)', 22]
  ];
  var state = { gender: 'male', calendar: 'solar' };
  var $ = function (id) { return document.getElementById(id); };

  // 微信号：上线前替换为你的真实微信号
  var WECHAT_ID = 'hjz13550604865';

  // 初始化时辰下拉（默认午时，多数人记得大概时段）
  // 顶部加「不确定/不知道」——命理上缺时柱会让旺衰失真，不假装能算，转为联系校准
  var hourSel = $('in-hour');
  var unknownOpt = document.createElement('option');
  unknownOpt.value = 'unknown'; unknownOpt.textContent = '不确定 / 不知道时辰';
  hourSel.appendChild(unknownOpt);
  SHICHEN.forEach(function (s, i) {
    var o = document.createElement('option');
    o.value = s[1]; o.textContent = s[0]; if (i === 6) o.selected = true;
    hourSel.appendChild(o);
  });

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
    if (!birth.year || !birth.month || !birth.day) { showErr('请填写完整的出生年月日'); return; }

    $('btn-go').textContent = '排盘中…'; $('btn-go').disabled = true;
    fetch(API + '/analysis/checkup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ birth: birth })
    }).then(function (r) { return r.json(); }).then(function (res) {
      $('btn-go').textContent = '免费生成我的五行体检'; $('btn-go').disabled = false;
      if (res.code !== 200) { showErr(res.message || '生成失败'); return; }
      render(res.data);
    }).catch(function () {
      $('btn-go').textContent = '免费生成我的五行体检'; $('btn-go').disabled = false;
      showErr('连接服务失败：请确认后端已启动（' + API + '）');
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
    $('r-oneliner').textContent = d.oneLiner;
    $('r-daymaster').textContent = d.dayMaster.gan + d.dayMaster.element;

    // 四柱
    var names = { year: '年柱', month: '月柱', day: '日柱', hour: '时柱' };
    var pillars = $('r-pillars');
    clear(pillars);
    ['year', 'month', 'day', 'hour'].forEach(function (k) {
      var p = d.pillars[k];
      var cang = (p.cang || []).join(' ');
      var pillar = el('div', 'pillar' + (k === 'day' ? ' day' : ''));
      pillar.appendChild(el('div', 'pn', names[k] + (k === 'day' ? ' · 日主' : '')));
      pillar.appendChild(el('div', 'ss', p.ganShen === '日主' ? '元' : p.ganShen));
      var gz1 = el('div', 'gz'); gz1.appendChild(el('span', 'e-' + p.ganWuxing, p.gan)); pillar.appendChild(gz1);
      var gz2 = el('div', 'gz'); gz2.appendChild(el('span', 'e-' + p.zhiWuxing, p.zhi)); pillar.appendChild(gz2);
      pillar.appendChild(el('div', 'ss', p.zhiShen));
      pillar.appendChild(el('div', 'cang', '藏 ' + cang));
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
      bar.appendChild(el('div', 'nm e-' + e, e));
      var track = el('div', 'track');
      var fill = el('div', 'fill bg-' + e);
      fill.style.width = pct + '%';
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(el('div', 'vl', pct + '%'));
      wx.appendChild(bar);
    });

    // 身强弱
    $('r-strength').textContent = d.strength.label;
    $('r-ratio').textContent = '同党占比 ' + Math.round((d.strength.ratio || 0) * 100) + '%';
    var bd = [['得令', d.strength.deLing], ['得地', d.strength.deDi], ['得势', d.strength.deShi]];
    var badges = $('r-badges');
    clear(badges);
    bd.forEach(function (b) {
      badges.appendChild(el('span', 'badge' + (b[1] ? ' yes' : ''), b[0] + '：' + (b[1] ? '是' : '否')));
    });

    // 喜忌
    function fillTags(nodeId, list, cls) {
      var node = $(nodeId);
      clear(node);
      if (!list || !list.length) { node.appendChild(el('span', 'sub', '无')); return; }
      list.forEach(function (e) { node.appendChild(el('span', cls, e)); });
    }
    fillTags('r-xi', d.yongShen.xiShen, 'tag-xi');
    fillTags('r-ji', d.yongShen.jiShen, 'tag-ji');

    // 调候
    var th = d.yongShen.tiaoHou || {};
    var tiaohou = $('r-tiaohou');
    clear(tiaohou);
    tiaohou.appendChild(document.createTextNode('调候：' + (th.season || '-') + '月，'));
    if (th.need && th.need.length) {
      tiaohou.appendChild(document.createTextNode('喜见 '));
      tiaohou.appendChild(el('b', null, th.need.join('')));
      tiaohou.appendChild(document.createTextNode(th.urgent ? '（急用）' : ''));
    } else {
      tiaohou.appendChild(document.createTextNode('无显著寒暖偏向'));
    }

    // 格局
    var geju = $('r-geju');
    clear(geju);
    geju.appendChild(document.createTextNode('格局：'));
    geju.appendChild(el('b', null, d.geju.name));
    if (d.geju.isPure === false) geju.appendChild(document.createTextNode('（取格欠清纯）'));

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
        alert('微信号已复制：' + WECHAT_ID + '\n打开微信「添加朋友」粘贴即可');
      }).catch(function () {
        alert('请手动添加微信号：' + WECHAT_ID);
      });
    } else {
      alert('请手动添加微信号：' + WECHAT_ID);
    }
  }

  // 时辰未知：转为联系校准入口（命理刚需，也是获客钩子）
  function showUnknownHour() {
    var ok = confirm(
      '时辰对命局影响很大，不确定时直接排盘会让身强弱、格局失真。\n\n' +
      '可以联系作者，用你的「出生大致时段 + 性格特征」帮你校准时辰，再出准确报告。\n\n' +
      '点「确定」复制作者微信号：' + WECHAT_ID
    );
    if (ok) copyWechat();
  }

  // 钩子：MVP 不真支付，引导加微信人工承接付费意愿（验证需求 + 收口变现）
  $('btn-unlock').onclick = function () {
    var n = (parseInt(localStorage.getItem('unlockIntent') || '0', 10)) + 1;
    localStorage.setItem('unlockIntent', n);
    console.log('[intent] unlock clicked, total=' + n);
    var ok = confirm(
      '深度命局报告（约6000字）¥19.9\n' +
      '含喜用神趋避、事业财运、感情应期、健康预警、未来10年大运。\n\n' +
      '点「确定」复制作者微信号：' + WECHAT_ID + '\n添加后发送你的出生信息即可预约。'
    );
    if (ok) copyWechat();
  };

  $('btn-back').onclick = function () {
    $('screen-report').classList.add('hidden');
    $('screen-input').classList.remove('hidden');
    window.scrollTo(0, 0);
  };
})();
