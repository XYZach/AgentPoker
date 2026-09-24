/* HUD: 大厅/游戏界面 DOM、记牌器、胜率面板、操作栏、日志、横幅、弹窗、音效 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : (window.PK = {});
var $ = function (sel, root) { return (root || document).querySelector(sel); };
var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

var Hud = PK.Hud = {
  prefs: { sound: true, speed: 1, autoNext: true, review: false },
  _raf: null
};

Hud.savePrefs = function () {
  try { localStorage.setItem('agentpoker.prefs', JSON.stringify(this.prefs)); } catch (e) { }
};

/* ================= 音效 (WebAudio 合成) ================= */
Hud.sfx = function (name) {
  if (!Hud.prefs.sound) return;
  try {
    if (!Hud._actx) Hud._actx = new (window.AudioContext || window.webkitAudioContext)();
    var ctx = Hud._actx;
    if (ctx.state === 'suspended') ctx.resume();
    var t = ctx.currentTime;
    function tone(freq, dur, type, vol, when, slide) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t + (when || 0));
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + (when || 0) + dur);
      g.gain.setValueAtTime(vol || 0.15, t + (when || 0));
      g.gain.exponentialRampToValueAtTime(0.001, t + (when || 0) + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + (when || 0)); o.stop(t + (when || 0) + dur + 0.02);
    }
    function noise(dur, vol, when) {
      var len = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var g = ctx.createGain(); g.gain.value = vol || 0.1;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600;
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start(t + (when || 0));
    }
    switch (name) {
      case 'deal': noise(0.07, 0.14); break;
      case 'flip': tone(1600, 0.05, 'square', 0.06); noise(0.03, 0.06); break;
      case 'chip': tone(2100, 0.045, 'triangle', 0.12); tone(2600, 0.05, 'triangle', 0.09, 0.03); break;
      case 'fold': tone(220, 0.09, 'sine', 0.1, 0, 140); break;
      case 'check': tone(880, 0.04, 'sine', 0.08); break;
      case 'win': tone(523, 0.12, 'triangle', 0.14); tone(659, 0.12, 'triangle', 0.14, 0.1); tone(784, 0.2, 'triangle', 0.16, 0.2); break;
      case 'elim': tone(180, 0.5, 'sine', 0.3, 0, 55); tone(90, 0.6, 'triangle', 0.2, 0.05, 40); break;
      case 'alarm': for (var i = 0; i < 3; i++) { tone(523, 0.14, 'sawtooth', 0.12, i * 0.3); tone(659, 0.14, 'sawtooth', 0.12, i * 0.3 + 0.15); } break;
      case 'level': tone(880, 0.1, 'sine', 0.1); tone(1175, 0.16, 'sine', 0.1, 0.09); break;
      case 'coin': tone(2400, 0.06, 'sine', 0.1); tone(3200, 0.08, 'sine', 0.07, 0.04); break;
      case 'click': tone(1200, 0.03, 'square', 0.04); break;
      case 'tick': tone(700, 0.03, 'sine', 0.06); break;
    }
  } catch (e) { }
};

/* ================= 通用 UI ================= */
Hud.toast = function (text, cls, ms) {
  var box = $('#toasts');
  var el = document.createElement('div');
  el.className = 'toast ' + (cls || '');
  el.textContent = text;
  box.appendChild(el);
  setTimeout(function () { el.classList.add('out'); }, ms || 2600);
  setTimeout(function () { el.remove(); }, (ms || 2600) + 400);
};

Hud.banner = function (title, sub, cls, ms) {
  var b = $('#banner');
  b.className = 'show ' + (cls || '');
  b.innerHTML = '<div class="bn-title">' + title + '</div>' + (sub ? '<div class="bn-sub">' + sub + '</div>' : '');
  clearTimeout(Hud._bnTimer);
  Hud._bnTimer = setTimeout(function () { b.className = ''; }, ms || 1800);
};

Hud.log = function (html, cls) {
  var box = $('#log-body');
  if (!box) return;
  var el = document.createElement('div');
  el.className = 'log-line ' + (cls || '');
  el.innerHTML = html;
  box.appendChild(el);
  while (box.children.length > 220) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
};

Hud.vignette = function (on, danger) {
  var v = $('#vignette');
  v.className = on ? (danger ? 'on danger' : 'on') : '';
};

/* ================= 大厅 ================= */
var STYLE_LIST = ['TAG', 'LAG', 'ROCK', 'FISH', 'BAL', 'MANIAC'];
var NAME_POOL = ['老K', '阿豪', '小美', '汤圆', '教父', '影子', '阿May', '大壮', '皮蛋', '疯子蔡'];

/* 语言切换 */
function syncLangButtons() {
  var label = PK.I18N.lang === 'zh' ? 'EN' : '中';
  var a = $('#lobby-lang'), b = $('#tb-lang');
  if (a) a.textContent = label;
  if (b) b.textContent = label;
}
document.addEventListener('click', function (e) {
  if (e.target && (e.target.id === 'lobby-lang' || e.target.id === 'tb-lang')) {
    Hud.sfx('click');
    PK.I18N.toggle();
  }
});
PK.I18N.on(function () {
  syncLangButtons();
  if (Hud._aiNames) Hud._aiNames.length = 0; // 清缓存, 新名字用新语言
  if (!$('#lobby').classList.contains('hidden')) {
    if (Hud._buildRoster) Hud._buildRoster();
    if (Hud._updateLLMHint) Hud._updateLLMHint();
  }
  if (Hud.engine && !$('#game').classList.contains('hidden')) {
    Hud.updateNameplates(Hud.engine);
    if (Hud._topbarInfo) Hud.setTopbar(Hud._topbarInfo);
    if (Hud._modeKey) $('#tb-mode').textContent = { cash: PK.t('现金局'), tourney: PK.t('锦标赛'), squid: PK.t('鱿鱼场') }[Hud._modeKey];
    var dl = $('#dealer-label'); if (dl) dl.textContent = PK.t('荷官');
    var eq = $('#eq-sub'); if (eq && !eq.textContent) eq.textContent = PK.t('等待手牌…');
    // 操作栏可见时刷新含金额的动态按钮文本(静态部分由 applyStatic 处理)
    if (Hud._legal && !$('#actionbar').classList.contains('hidden')) {
      var lg = Hud._legal;
      if (lg.canCall) $('#btn-call').innerHTML = PK.t('跟注') + ' ' + PK.fmt(lg.callAmount) + (lg.callAmount >= lg.maxTo - lg.toCall ? ' (' + PK.t('全下') + ')' : '');
      if (lg.canBet || lg.canRaise) $('#btn-raise').innerHTML = (lg.isRaise ? PK.t('加注到') + ' ' : PK.t('下注') + ' ') + '<b id="ab-raise-amt">' + PK.fmt(lg.minTo) + '</b>';
    }
    if (Hud.onSceneRefreshLang) Hud.onSceneRefreshLang();
  }
});

Hud.initLobby = function (onStart) {
  var lobby = $('#lobby');
  var state = {
    mode: 'squid',
    count: 6,
    roster: [],
    llm: PK.LLM.cfg
  };

  // 模式卡片
  $$('.mode-card', lobby).forEach(function (card) {
    card.addEventListener('click', function () {
      Hud.sfx('click');
      $$('.mode-card', lobby).forEach(function (c) { c.classList.remove('sel'); });
      card.classList.add('sel');
      state.mode = card.dataset.mode;
      $$('.mode-section', lobby).forEach(function (s) { s.classList.toggle('hidden', s.dataset.mode !== state.mode); });
    });
  });

  // 人数
  $$('#count-selector button', lobby).forEach(function (btn) {
    btn.addEventListener('click', function () {
      Hud.sfx('click');
      state.count = +btn.dataset.n;
      $$('#count-selector button', lobby).forEach(function (b) { b.classList.toggle('sel', b === btn); });
      buildRoster();
    });
  });

  function buildRoster() {
    var box = $('#roster-list');
    box.innerHTML = '';
    var used = {};
    state.roster = [];
    for (var i = 0; i < state.count; i++) {
      var row = document.createElement('div');
      row.className = 'roster-row';
      if (i === 0) {
        row.innerHTML = '<span class="rr-seat">' + PK.t('你') + '</span>' +
          '<input class="rr-name" id="hero-name" maxlength="12" value="' + (Hud._heroName || PK.t('我')) + '">' +
          '<span class="rr-style-info">' + PK.t('由你操作 · AI 可给你建议') + '</span>';
      } else {
        var name = Hud._aiNames && Hud._aiNames[i] ? Hud._aiNames[i] : pickName(used);
        var style = Hud._aiStyles && Hud._aiStyles[i] ? Hud._aiStyles[i] : STYLE_LIST[(i * 7 + 3) % 6];
        row.innerHTML = '<span class="rr-seat">AI ' + i + '</span>' +
          '<input class="rr-name" maxlength="12" value="' + name + '">' +
          '<select class="rr-style">' + STYLE_LIST.map(function (s) {
            return '<option value="' + s + '"' + (s === style ? ' selected' : '') + '>' + PK.t(PK.AI_STYLES[s].label) + ' · ' + PK.t(PK.AI_STYLES[s].desc) + '</option>';
          }).join('') + '</select>';
      }
      box.appendChild(row);
    }
  }
  Hud._buildRoster = buildRoster;
  function pickName(used) {
    var pool = PK.I18N.lang === 'en' ? PK.I18N.aiNames.en : NAME_POOL;
    for (var t = 0; t < 30; t++) {
      var n = pool[Math.floor(Math.random() * pool.length)];
      if (!used[n]) { used[n] = 1; return n; }
    }
    return 'AI' + Math.floor(Math.random() * 99);
  }

  // LLM 配置绑定
  var llm = state.llm;
  $('#llm-enabled').checked = llm.enabled;
  $('#llm-preset').innerHTML = PK.LLM.presets.map(function (p, i) {
    return '<option value="' + i + '">' + p.name + '</option>';
  }).join('') + '<option value="-1">当前自定义</option>';
  $('#llm-base').value = llm.baseUrl;
  $('#llm-key').value = llm.apiKey;
  $('#llm-model').value = llm.model;
  $('#llm-consult').value = llm.consultRate;
  $('#llm-influence').value = llm.influence;
  $('#llm-auto').checked = llm.autoAdvice;
  $('#llm-consult-val').textContent = Math.round(llm.consultRate * 100) + '%';
  $('#llm-influence-val').textContent = Math.round(llm.influence * 100) + '%';

  $('#llm-enabled').addEventListener('change', function () { llm.enabled = this.checked; saveLLM(); });
  $('#llm-preset').addEventListener('change', function () {
    var p = PK.LLM.presets[+this.value];
    if (p) { $('#llm-base').value = p.baseUrl; $('#llm-model').value = p.model; llm.baseUrl = p.baseUrl; llm.model = p.model; saveLLM(); }
  });
  $('#llm-base').addEventListener('change', function () { llm.baseUrl = this.value.trim(); saveLLM(); });
  $('#llm-key').addEventListener('change', function () { llm.apiKey = this.value.trim(); saveLLM(); });
  $('#llm-model').addEventListener('change', function () { llm.model = this.value.trim(); saveLLM(); });
  $('#llm-consult').addEventListener('input', function () {
    llm.consultRate = +this.value; $('#llm-consult-val').textContent = Math.round(llm.consultRate * 100) + '%'; saveLLM();
  });
  $('#llm-influence').addEventListener('input', function () {
    llm.influence = +this.value; $('#llm-influence-val').textContent = Math.round(llm.influence * 100) + '%'; saveLLM();
  });
  $('#llm-auto').addEventListener('change', function () { llm.autoAdvice = this.checked; saveLLM(); });
  function saveLLM() { PK.LLM.save(); updateLLMHint(); }
  function updateLLMHint() {
    var ok = llm.enabled && llm.baseUrl && llm.apiKey && llm.model;
    $('#llm-hint').textContent = ok ? PK.t('✓ 已启用 — AI 会给建议并参与人机决策') : PK.t('未启用 — 人机仅按风格+胜率+随机性决策');
  }
  Hud._updateLLMHint = updateLLMHint;
  $('#llm-test').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true; btn.textContent = PK.t('测试中…');
    try {
      llm.baseUrl = $('#llm-base').value.trim(); llm.apiKey = $('#llm-key').value.trim(); llm.model = $('#llm-model').value.trim();
      PK.LLM.save();
      await PK.LLM.test();
      Hud.toast(PK.t('✓ 连接成功') + ' (' + PK.LLM.stats.lastLatency + 'ms)', 'ok');
    } catch (e) {
      Hud.toast('✗ ' + String(e.message || e).slice(0, 120), 'err', 4200);
    }
    btn.disabled = false; btn.textContent = PK.t('测试连接');
  });
  updateLLMHint();

  $('#btn-start').addEventListener('click', function () {
    Hud.sfx('click');
    Hud._heroName = ($('#hero-name') || {}).value || PK.t('我');
    Hud._aiNames = []; Hud._aiStyles = [];
    var roster = [];
    $$('#roster-list .roster-row').forEach(function (row, i) {
      var name = $('.rr-name', row).value.trim() || (i === 0 ? PK.t('我') : 'AI' + i);
      if (i === 0) roster.push({ name: name, isHuman: true, styleKey: 'BAL' });
      else {
        var st = $('.rr-style', row).value;
        Hud._aiNames[i] = name; Hud._aiStyles[i] = st;
        roster.push({ name: name, isHuman: false, styleKey: st });
      }
    });
    var cfg = {
      mode: state.mode,
      roster: roster,
      startStack: +($('#opt-stack') || {}).value || 1000,
      revealFolds: $('#opt-reveal').checked,
      cash: { sb: +$('#cash-sb').value, bb: +$('#cash-sb').value * 2 },
      tourney: { handsPerLevel: +$('#tourney-hpl').value },
      squid: {
        deadlineHands: +$('#squid-deadline').value,
        forcedShowdown: $('#squid-forced').checked,
        bounty: $('#squid-bounty').checked,
        bountyAmount: Math.round((+$('#opt-stack').value || 1000) / 2),
        deadlineUntilHU: $('#squid-hu').checked,
        winnerTakeAll: true
      }
    };
    onStart(cfg);
  });

  var optReview = $('#opt-review');
  if (optReview) {
    optReview.checked = !!Hud.prefs.review;
    optReview.addEventListener('change', function () {
      Hud.prefs.review = optReview.checked;
      Hud.savePrefs();
    });
  }

  buildRoster();
};

Hud.showLobby = function () {
  $('#game').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
};
Hud.showGame = function () {
  $('#lobby').classList.add('hidden');
  $('#game').classList.remove('hidden');
};

/* ================= 游戏内 HUD ================= */
Hud.initGame = function (engine, scene) {
  var self = this;
  this.engine = engine;
  this.scene = scene;
  $('#labels').innerHTML = '';
  $('#log-body').innerHTML = '';
  this._plates = {};
  this._betLabels = {};

  var modeName = { cash: PK.t('现金局'), tourney: PK.t('锦标赛'), squid: PK.t('鱿鱼场') }[engine.cfg.mode];
  document.body.dataset.mode = engine.cfg.mode;
  Hud._modeKey = engine.cfg.mode;
  $('#tb-mode').textContent = modeName;
  $('#tb-deadline-wrap').classList.toggle('hidden', engine.cfg.mode !== 'squid');

  engine.players.forEach(function (p) {
    var plate = document.createElement('div');
    plate.className = 'nplate';
    plate.id = 'np-' + p.id;
    var styleTag = p.isHuman ? '<span class="np-style hero-tag">' + PK.t('你') + '</span>' :
      '<span class="np-style">' + PK.t((PK.AI_STYLES[p.styleKey] || { label: p.styleKey }).label) + '</span>';
    plate.innerHTML =
      '<div class="np-bubble"></div>' +
      '<div class="np-row1"><span class="np-name">' + esc(p.name) + '</span>' + styleTag + '</div>' +
      '<div class="np-stack"></div>' +
      '<div class="np-badges"></div>' +
      '<div class="np-status"></div>';
    $('#labels').appendChild(plate);
    var bl = document.createElement('div');
    bl.className = 'bet-label';
    bl.id = 'bl-' + p.id;
    $('#labels').appendChild(bl);
    self._plates[p.id] = plate;
    self._betLabels[p.id] = bl;
  });

  var potLabel = document.createElement('div');
  potLabel.className = 'pot-label';
  potLabel.id = 'pot-label';
  $('#labels').appendChild(potLabel);
  var piggyLabel = document.createElement('div');
  piggyLabel.className = 'piggy-label';
  piggyLabel.id = 'piggy-label';
  $('#labels').appendChild(piggyLabel);
  var dealerLabel = document.createElement('div');
  dealerLabel.className = 'dealer-label';
  dealerLabel.id = 'dealer-label';
  dealerLabel.textContent = PK.t('荷官');
  $('#labels').appendChild(dealerLabel);

  // 记牌器(默认折叠, 点标题展开)
  $('#tracker-toggle').onclick = function () {
    $('#panel-tracker').classList.toggle('open');
    Hud.sfx('click');
  };
  var grid = $('#tracker-grid');
  grid.innerHTML = '';
  var suits = [0, 1, 2, 3], ranks = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
  this._trackerCells = {};
  suits.forEach(function (s) {
    ranks.forEach(function (r) {
      var cell = document.createElement('div');
      var card = (r << 2) | s;
      cell.className = 'tc';
      cell.id = 'tc-' + card;
      cell.innerHTML = '<span class="' + ((s === 1 || s === 2) ? 'red' : '') + '">' + PK.RANK_NAME[r] + PK.SUIT_CHARS[s] + '</span>';
      grid.appendChild(cell);
      self._trackerCells[card] = cell;
    });
  });

  scene.onProject = function () { self.updateProjection(); };
  this.updateProjection();

  // 顶栏按钮
  $('#tb-sound').onclick = function () {
    Hud.prefs.sound = !Hud.prefs.sound;
    this.textContent = Hud.prefs.sound ? '🔊' : '🔇';
    savePrefs();
  };
  $('#tb-sound').textContent = Hud.prefs.sound ? '🔊' : '🔇';
  $$('#tb-speed button').forEach(function (btn) {
    btn.classList.toggle('sel', +btn.dataset.s === Hud.prefs.speed);
    btn.onclick = function () {
      Hud.prefs.speed = +btn.dataset.s;
      $$('#tb-speed button').forEach(function (b) { b.classList.toggle('sel', b === btn); });
      savePrefs();
      if (Hud.onSpeedChange) Hud.onSpeedChange(Hud.prefs.speed);
    };
  });
  $$('#tb-camera button').forEach(function (btn) {
    btn.onclick = function () { Hud.sfx('click'); scene.cameraPreset(btn.dataset.cam); };
  });
  var camWrap = $('#tb-camera');
  if (camWrap) camWrap.classList.toggle('hidden', !!scene.is2d); // 2D 模式无相机
  $('#tb-menu').onclick = function () { if (Hud.onMenu) Hud.onMenu(); };
  $('#tb-help').onclick = function () { Hud.showHelp(); };
  $('#log-toggle').onclick = function () { $('#log-panel').classList.toggle('open'); };
  savePrefs();
  function savePrefs() { Hud.savePrefs(); }
};

function esc(s) { return String(s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

Hud.updateProjection = function () {
  var self = this, scene = this.scene, engine = this.engine;
  if (!scene || !engine) return;
  engine.players.forEach(function (p) {
    var anchor = scene.anchorOf(p.id);
    var plate = self._plates[p.id];
    if (!anchor || !plate) return;
    var pt = scene.project(anchor.name.position);
    if (!pt || p.out && p.place) { plate.style.display = 'none'; }
    else {
      plate.style.display = '';
      plate.style.transform = 'translate(-50%,-100%) translate(' + pt.x.toFixed(1) + 'px,' + pt.y.toFixed(1) + 'px)';
    }
    var ba = scene.anchorOf(p.id);
    var bpt = scene.project(ba.bet.position);
    var bl = self._betLabels[p.id];
    if (bpt && p.bet > 0 && !p.folded) {
      bl.style.display = '';
      bl.textContent = PK.fmt(p.bet);
      bl.style.transform = 'translate(-50%,-50%) translate(' + bpt.x.toFixed(1) + 'px,' + bpt.y.toFixed(1) + 'px)';
    } else bl.style.display = 'none';
  });
  var potAnchor = scene.extraAnchor('pot');
  if (potAnchor) {
    var ppt = scene.project(potAnchor.position);
    var pl = $('#pot-label');
    if (ppt) {
      var pot = engine.potTotal();
      pl.style.display = pot > 0 ? '' : 'none';
      pl.textContent = PK.t('彩池') + ' ' + PK.fmt(pot);
      pl.style.transform = 'translate(-50%,-50%) translate(' + ppt.x.toFixed(1) + 'px,' + ppt.y.toFixed(1) + 'px)';
    }
  }
  var dealerA = scene.extraAnchor('dealer');
  if (dealerA) {
    var dpt = scene.project(dealerA.position);
    var dl = $('#dealer-label');
    if (dpt) {
      dl.style.display = '';
      dl.style.transform = 'translate(-50%,-100%) translate(' + dpt.x.toFixed(1) + 'px,' + dpt.y.toFixed(1) + 'px)';
    } else dl.style.display = 'none';
  }
  var piggy = scene.extraAnchor('piggy');
  if (piggy) {
    var gpt = scene.project(piggy.position);
    var gl = $('#piggy-label');
    if (gpt) {
      gl.style.display = '';
      gl.innerHTML = '🐷 ' + PK.t('奖池') + ' ' + PK.fmt(engine.piggyTotal);
      gl.style.transform = 'translate(-50%,-50%) translate(' + gpt.x.toFixed(1) + 'px,' + gpt.y.toFixed(1) + 'px)';
    }
  }
};

Hud.updateNameplates = function (engine) {
  engine.players.forEach(function (p) {
    var plate = Hud._plates[p.id];
    if (!plate) return;
    $('.np-stack', plate).textContent = PK.fmt(p.stack);
    var styleEl = $('.np-style', plate);
    if (!p.isHuman && styleEl && PK.AI_STYLES[p.styleKey]) styleEl.textContent = PK.t(PK.AI_STYLES[p.styleKey].label);
    var badges = $('.np-badges', plate);
    var html = '';
    if (engine.dealerIdx === p.id && p.dealt) html += '<span class="bd bd-d">D</span>';
    if (Hud._blindBadges[p.id]) html += '<span class="bd bd-blind">' + PK.t(Hud._blindBadges[p.id]) + '</span>';
    if (p.bounty > 0) html += '<span class="bd bd-b">💀' + p.bounty + '</span>';
    if (p.rebuys > 0) html += '<span class="bd bd-r">↻' + p.rebuys + '</span>';
    badges.innerHTML = html;
    var st = $('.np-status', plate);
    var stHtml = '';
    if (p.out) stHtml = '<span class="st st-out">' + PK.t('第') + p.place + PK.t('名') + ' ' + PK.t('出局') + '</span>';
    else if (p.folded && p.dealt) stHtml = '<span class="st st-fold">' + PK.t('弃牌') + '</span>';
    else if (p.allIn) stHtml = '<span class="st st-allin">' + PK.t('全下') + '</span>';
    else if (p.sittingOut) stHtml = '<span class="st st-fold">' + PK.t('等待重买') + '</span>';
    st.innerHTML = stHtml;
    plate.classList.toggle('turn', engine.awaiting === p);
    plate.classList.toggle('folded', !!p.folded && !!p.dealt);
    plate.classList.toggle('out', !!p.out);
  });
};

Hud.actionBubble = function (playerId, text, cls) {
  var plate = this._plates[playerId];
  if (!plate) return;
  var b = $('.np-bubble', plate);
  b.textContent = text;
  b.className = 'np-bubble show ' + (cls || '');
  clearTimeout(b._t);
  b._t = setTimeout(function () { b.className = 'np-bubble'; }, 1700);
};

Hud.setTopbar = function (info) {
  Hud._topbarInfo = info;
  $('#tb-hand').textContent = PK.I18N.lang === 'en' ? 'Hand ' + info.handNo : '第 ' + info.handNo + ' 手';
  if (info.mode === 'cash') $('#tb-level').textContent = PK.t('盲注') + ' ' + info.sb + '/' + info.bb;
  else $('#tb-level').textContent = PK.I18N.lang === 'en'
    ? 'Lv ' + info.level + ' · ' + info.sb + '/' + info.bb + (info.ante ? ' ante ' + info.ante : '')
    : '级别 ' + info.level + ' · ' + PK.t('盲注') + ' ' + info.sb + '/' + info.bb + (info.ante ? ' ' + PK.t('前注') + info.ante : '');
  if (info.mode === 'squid') {
    var d = info.handsUntilDeadline;
    var el = $('#tb-deadline');
    el.textContent = d === 1 ? PK.t('⏰ 下一手淘汰!')
      : (PK.I18N.lang === 'en' ? '⏱ Clock: ' + d + ' hands' : '⏱ 淘汰时钟 ' + d + ' 手');
    el.className = d <= 1 ? 'danger' : '';
  }
};

/* ================= 记牌器 ================= */
Hud.updateTracker = function (sets) {
  // sets: {hero:[c], board:[c], dead:[c]}
  var all = {};
  (sets.hero || []).forEach(function (c) { all[c] = 'hero'; });
  (sets.board || []).forEach(function (c) { all[c] = 'board'; });
  (sets.dead || []).forEach(function (c) { if (!all[c]) all[c] = 'dead'; });
  var seen = 0;
  var self = this;
  Object.keys(this._trackerCells).forEach(function (card) {
    var st = all[+card];
    var cell = self._trackerCells[card];
    cell.className = 'tc' + (st ? ' ' + st : '');
    if (st) seen++;
  });
  $('#tracker-seen').textContent = seen + '/52';
  $('#tracker-dead').textContent = (sets.dead || []).length;
};

/* ================= 胜率面板 ================= */
Hud.updateEquity = function (res, ctx) {
  if (!res) {
    $('#eq-ring').style.background = 'conic-gradient(#39424e 0turn, #232a33 0turn)';
    $('#eq-num').textContent = '—';
    $('#eq-sub').textContent = PK.t('等待手牌…');
    $('#eq-bar-win').style.width = '0%';
    $('#eq-bar-tie').style.width = '0%';
    $('#eq-bar-lose').style.width = '0%';
    return;
  }
  var win = res.win, tie = res.tie;
  var deg = (win + tie / 2) * 360;
  var color = win > 0.6 ? '#2ecc71' : win > 0.4 ? '#f1c40f' : '#e74c3c';
  $('#eq-ring').style.background = 'conic-gradient(' + color + ' 0turn ' + deg + 'deg, #232a33 ' + deg + 'deg 360deg)';
  $('#eq-num').textContent = Math.round(win * 100) + '%';
  $('#eq-sub').textContent = PK.I18N.lang === 'en'
    ? 'vs ' + ctx.nOpp + ' opponents · ' + res.iters + ' sims'
    : 'vs ' + ctx.nOpp + ' 名对手 · ' + res.iters + ' 次模拟';
  $('#eq-bar-win').style.width = (win * 100).toFixed(1) + '%';
  $('#eq-bar-tie').style.width = (tie * 100).toFixed(1) + '%';
  $('#eq-bar-lose').style.width = ((1 - win - tie) * 100).toFixed(1) + '%';
  $('#eq-bar-win-num').textContent = (win * 100).toFixed(1) + '%';
  $('#eq-bar-tie-num').textContent = (tie * 100).toFixed(1) + '%';
  $('#eq-bar-lose-num').textContent = ((1 - win - tie) * 100).toFixed(1) + '%';
  if (ctx.potOdds != null && ctx.potOdds > 0) {
    $('#eq-odds').innerHTML = PK.I18N.lang === 'en'
      ? 'Pot odds: need <b>' + (ctx.potOdds * 100).toFixed(1) + '%</b>' +
        (win > ctx.potOdds ? ' <span class="ok-text">' + PK.t('✓ 值得跟') + '</span>' : ' <span class="bad-text">' + PK.t('✗ 跟注亏') + '</span>')
      : '底池赔率: 需 <b>' + (ctx.potOdds * 100).toFixed(1) + '%</b> ' + PK.t('胜率') +
        (win > ctx.potOdds ? ' <span class="ok-text">' + PK.t('✓ 值得跟') + '</span>' : ' <span class="bad-text">' + PK.t('✗ 跟注亏') + '</span>');
  } else {
    $('#eq-odds').textContent = PK.t('当前无需跟注');
  }
  if (ctx.madeHand) $('#eq-made').textContent = PK.t('当前成牌: ') + ctx.madeHand;
  else $('#eq-made').textContent = '';
};

/* runout 全下概率条 */
Hud.showRunoutBars = function (entries) {
  var box = $('#runout-bars');
  box.innerHTML = '';
  box.classList.remove('hidden');
  entries.forEach(function (e) {
    var row = document.createElement('div');
    row.className = 'ro-row';
    row.id = 'ro-' + e.playerId;
    row.innerHTML = '<span class="ro-name">' + esc(e.name) + '</span>' +
      '<span class="ro-cards">' + PK.cardsName(e.cards) + '</span>' +
      '<div class="ro-bar"><div class="ro-fill" style="width:' + (e.win * 100).toFixed(1) + '%"></div></div>' +
      '<span class="ro-num">' + (e.win * 100).toFixed(1) + '%</span>';
    box.appendChild(row);
  });
};
Hud.updateRunoutBars = function (res) {
  res.forEach(function (r, i) {
    var row = $('#ro-' + r.playerId);
    if (!row) return;
    $('.ro-fill', row).style.width = (r.win * 100).toFixed(1) + '%';
    $('.ro-num', row).textContent = ((r.win + r.tie / 2) * 100).toFixed(1) + '%';
  });
};
Hud.hideRunoutBars = function () { $('#runout-bars').classList.add('hidden'); };

/* ================= 操作栏 ================= */
Hud._actionResolve = null;
Hud.showActionbar = function (legal, heroName) {
  var bar = $('#actionbar');
  bar.classList.remove('hidden');
  this._legal = legal;
  var self = this;
  $('#ab-tocall').textContent = legal.toCall > 0 ? PK.fmt(legal.toCall) : '0';
  $('#ab-odds').textContent = legal.potOdds > 0 ? (legal.potOdds * 100).toFixed(1) + '%' : '—';
  $('#btn-fold').classList.toggle('disabled', !legal.canFold);
  $('#btn-check').classList.toggle('hidden', !legal.canCheck);
  $('#btn-call').classList.toggle('hidden', !legal.canCall);
  $('#btn-call').innerHTML = PK.t('跟注') + ' ' + PK.fmt(legal.callAmount) + (legal.callAmount >= legal.maxTo - legal.toCall ? ' (' + PK.t('全下') + ')' : '');
  var canAggro = legal.canBet || legal.canRaise;
  $('#btn-raise').classList.toggle('hidden', !canAggro);
  $('#ab-raise-row').classList.toggle('hidden', !canAggro);
  $('#btn-raise').innerHTML = (legal.isRaise ? PK.t('加注到') + ' ' : PK.t('下注') + ' ') + '<b id="ab-raise-amt">' + PK.fmt(legal.minTo) + '</b>';
  $('#btn-allin').classList.toggle('hidden', !canAggro);

  var slider = $('#ab-slider');
  slider.min = legal.minTo;
  slider.max = legal.maxTo;
  slider.step = this.engine.bb;
  slider.value = legal.minTo;

  function amount() { return Math.min(legal.maxTo, Math.max(legal.minTo, +slider.value)); }
  function syncAmt() {
    var el = $('#ab-raise-amt');
    if (el) el.textContent = PK.fmt(amount());
    var isMax = amount() >= legal.maxTo;
    $('#btn-raise').classList.toggle('alldanger', isMax);
  }
  slider.oninput = syncAmt;
  syncAmt();

  $$('.ab-presets button', bar).forEach(function (btn) {
    btn.onclick = function () {
      var pot = legal.potTotal + legal.toCall * 2;
      var v;
      switch (btn.dataset.preset) {
        case 'min': v = legal.minTo; break;
        case 'third': v = legal.toCall + Math.round(pot / 3); break;
        case 'half': v = legal.toCall + Math.round(pot / 2); break;
        case 'pot': v = legal.toCall + pot; break;
        case 'max': v = legal.maxTo; break;
      }
      slider.value = v; syncAmt();
    };
  });

  function done(decision) {
    if (!Hud._actionResolve) return;
    bar.classList.add('hidden');
    var r = Hud._actionResolve;
    Hud._actionResolve = null;
    r(decision);
  }
  this._done = done;

  $('#btn-fold').onclick = function () { Hud.sfx('fold'); done({ type: 'fold' }); };
  $('#btn-check').onclick = function () { Hud.sfx('check'); done({ type: 'check' }); };
  $('#btn-call').onclick = function () { Hud.sfx('chip'); done({ type: 'call' }); };
  $('#btn-allin').onclick = function () { Hud.sfx('chip'); done({ type: 'allin' }); };
  $('#btn-raise').onclick = function () {
    Hud.sfx('chip');
    done({ type: legal.isRaise ? 'raise' : 'bet', amount: amount() });
  };
  $('#btn-llm').onclick = function () { if (Hud.onAdviceRequest) Hud.onAdviceRequest(); };

  $('#btn-llm').classList.toggle('hidden', !PK.LLM.ready());

  return new Promise(function (resolve) { Hud._actionResolve = resolve; });
};
Hud.hideActionbar = function () {
  $('#actionbar').classList.add('hidden');
  Hud._actionResolve = null;
};

/* 键盘快捷键 */
Hud.bindKeys = function () {
  document.addEventListener('keydown', function (e) {
    if ($('#game').classList.contains('hidden')) return;
    if (!Hud._actionResolve) return;
    var k = e.key.toLowerCase();
    if (k === 'f') $('#btn-fold').click();
    else if (k === 'c') { if (!$('#btn-call').classList.contains('hidden')) $('#btn-call').click(); else $('#btn-check').click(); }
    else if (k === 'a') $('#btn-allin').click();
    else if (k === 'r') { $('#ab-slider').focus(); }
    else if (k === 'enter') $('#btn-raise').click();
    else if (k === 'd') $('#btn-llm').click();
  });
};

/* ================= 盲注徽标 ================= */
Hud._blindBadges = {};
Hud.setBlindBadge = function (playerId, text) {
  this._blindBadges[playerId] = text;
};
Hud.clearBlindBadges = function () {
  this._blindBadges = {};
};

/* ================= LLM 建议卡片 ================= */
Hud.showAdvice = function (data) {
  var box = $('#advice-box');
  box.classList.remove('hidden');
  var actName = PK.t({ fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注', allin: '全下' }[data.action] || data.action);
  var amt = data.amount ? ' ' + PK.fmt(data.amount) : '';
  box.innerHTML =
    '<div class="adv-head">🤖 ' + PK.t('AI 建议') + ' <span class="adv-lat">' + (data.latency || '') + '</span></div>' +
    '<div class="adv-action">' + actName + amt + '</div>' +
    '<div class="adv-reason">' + esc(data.reason || '') + '</div>' +
    '<div class="adv-conf"><div class="adv-conf-bar" style="width:' + (data.confidence || 0) + '%"></div></div>' +
    '<div class="adv-foot">' + PK.t('置信度') + ' ' + (data.confidence || 0) + '%<button id="adv-apply">' + PK.t('采纳') + '</button></div>';
  $('#adv-apply').onclick = function () {
    if (Hud.onAdviceApply) Hud.onAdviceApply(data);
  };
};
Hud.showAdviceLoading = function () {
  var box = $('#advice-box');
  box.classList.remove('hidden');
  box.innerHTML = '<div class="adv-head">🤖 ' + PK.t('AI 建议') + '</div><div class="adv-loading"><span class="spinner"></span>' + PK.t('思考中…') + '</div>';
};
Hud.clearAdvice = function () { $('#advice-box').classList.add('hidden'); };
Hud.setLLMStatus = function (state, text) {
  var el = $('#llm-status');
  el.className = 'llm-status ' + state;
  el.textContent = text;
};

/* ================= 弹窗 ================= */
Hud.modal = function (html, opts) {
  opts = opts || {};
  return new Promise(function (resolve) {
    var root = $('#modal-root');
    root.innerHTML = '<div class="modal-mask"><div class="modal ' + (opts.cls || '') + '">' + html + '</div></div>';
    root.classList.remove('hidden');
    function close(val) {
      root.classList.add('hidden');
      root.innerHTML = '';
      resolve(val);
    }
    $$('#modal-root [data-close]').forEach(function (btn) {
      btn.onclick = function () { close(btn.dataset.close); };
    });
  });
};

Hud.showRebuy = function (playerName) {
  return this.modal(
    '<h3>' + PK.t('筹码耗尽') + '</h3><p>' + esc(playerName) + PK.t('的筹码已输光。重新买入回到牌桌吗？') + '</p>' +
    '<div class="modal-btns"><button class="btn primary" data-close="yes">' + PK.t('重新买入') + '</button><button class="btn" data-close="no">' + PK.t('离座(结束场次)') + '</button></div>'
  );
};

/* ================= 每局复盘 ================= */
Hud.showHandEndChoice = function (log) {
  var isEn = PK.I18N.lang === 'en';
  var sub = isEn ? 'Hand #' + log.handNo + ' finished · review?' : PK.t('第') + ' ' + log.handNo + ' ' + PK.t('手 · 要复盘吗?');
  return this.modal(
    '<h3>' + PK.t('本手结束') + '</h3>' +
    '<p>' + sub + '</p>' +
    '<div class="modal-btns"><button class="btn primary" data-close="next">' + PK.t('下一局') + '</button>' +
    '<button class="btn" data-close="review">' + PK.t('复盘本局') + '</button></div>'
  );
};

Hud.showReview = function (log) {
  var engine = this.engine;
  var isEn = PK.I18N.lang === 'en';
  var streetNames = [PK.t('翻牌前'), PK.t('翻牌 🌟'), PK.t('转牌'), PK.t('河牌')];
  var nameOf = {};
  log.players.forEach(function (rp) { nameOf[rp.id] = rp.name; });

  function cardHtml(c) {
    var s = c & 3;
    return '<span class="rv-card' + ((s === 1 || s === 2) ? ' red' : '') + '">' + PK.cardName(c) + '</span>';
  }
  function cardsHtml(cs) { return (cs || []).map(cardHtml).join(''); }

  /* 成牌名: showdown pots 与 handEnd result 里都有 */
  var catById = {};
  ((log.result && log.result.hands) || []).forEach(function (h) { catById[h.playerId] = h.catName; });
  log.pots.forEach(function (pot) {
    (pot.hand || []).forEach(function (h) { catById[h.playerId] = h.catName; });
  });
  var awardById = {};
  var potTotal = 0;
  log.awards.forEach(function (a) { awardById[a.pid] = (awardById[a.pid] || 0) + a.amount; potTotal += a.amount; });

  var html = '<h3>📊 ' + PK.t('复盘') + ' · ' + (isEn ? 'Hand #' : PK.t('第') + ' ') + log.handNo + (isEn ? '' : ' ' + PK.t('手')) + '</h3>';
  html += '<div class="res-sub">' + PK.t('盲注') + ' ' + log.sb + '/' + log.bb +
    (log.ante ? ' (' + PK.t('前注') + ' ' + log.ante + ')' : '') +
    ' · ' + PK.t('彩池') + ' ' + PK.fmt(potTotal) + '</div>';

  html += '<div class="rv-sec-title">' + PK.t('公共牌') + '</div><div class="rv-board">';
  if (!log.streets.length) html += '<span class="dim">—</span>';
  log.streets.forEach(function (s) {
    html += '<span class="rv-street">' + streetNames[s.street] + '</span>' + cardsHtml(s.cards);
  });
  html += '</div>';

  html += '<div class="rv-sec-title">' + PK.t('玩家') + '</div>';
  html += '<table class="res-table"><tr><th>' + PK.t('风格') + '</th><th>' + PK.t('玩家') + '</th><th>' + PK.t('底牌') + '</th><th>' + PK.t('结果') + '</th><th>' + PK.t('盈亏') + '</th></tr>';
  log.players.forEach(function (rp) {
    var p = engine.players[rp.id];
    if (!p || !rp.dealt) return;
    var hole = p.hole && p.hole.length >= 2 ? p.hole : null;
    var award = awardById[rp.id] || 0;
    var net = (rp.endStack != null ? rp.endStack : p.stack) - rp.startStack;
    var awEv = null;
    for (var ai = 0; ai < log.awards.length; ai++) if (log.awards[ai].pid === rp.id) awEv = log.awards[ai];
    var res;
    if (award > 0 && awEv && awEv.uncontested) {
      /* 无人跟注: award 含自己退回的投入, 显示净赢 */
      var netWin = award - (rp.contributed || 0);
      res = '🏆 ' + PK.t('无人跟注') + (netWin > 0 ? ' +' + PK.fmt(netWin) : '');
    } else if (award > 0) res = '🏆 +' + PK.fmt(award) + (catById[rp.id] ? ' · ' + catById[rp.id] : '');
    else if (catById[rp.id]) res = catById[rp.id];
    else if (log.elims.indexOf(rp.id) >= 0) res = '💀 ' + PK.t('被淘汰');
    else res = PK.t('弃牌');
    html += '<tr class="' + (rp.isHero ? 'hero-row' : '') + '">' +
      '<td>' + (rp.isHero ? '⭐' : '<span class="np-style">' + PK.t((PK.AI_STYLES[rp.styleKey] || { label: rp.styleKey || '' }).label) + '</span>') + '</td>' +
      '<td>' + esc(rp.name) + '</td>' +
      '<td>' + (hole ? cardsHtml(hole) : '—') + '</td>' +
      '<td>' + res + '</td>' +
      '<td>' + (net >= 0 ? '+' : '') + PK.fmt(net) + '</td></tr>';
  });
  html += '</table>';

  html += '<div class="rv-sec-title">' + PK.t('动作时间线') + '</div><div class="rv-tl">';
  var curStreet = -1;
  var actNames = { ante: PK.t('前注'), sb: PK.t('小盲'), bb: PK.t('大盲'), fold: PK.t('弃牌'), check: PK.t('过牌'), call: PK.t('跟注'), bet: PK.t('下注'), raise: PK.t('加注'), allin: PK.t('全下') };
  log.actions.forEach(function (a) {
    if (a.street !== curStreet) {
      curStreet = a.street;
      html += '<div class="rv-tl-street">—— ' + streetNames[a.street] + ' ——</div>';
    }
    var txt = actNames[a.act] || a.act;
    if (a.act === 'raise') txt = PK.t('加注到') + ' ' + PK.fmt(a.to);
    else if (a.act === 'bet' || a.act === 'call' || a.act === 'sb' || a.act === 'bb' || a.act === 'ante') txt += ' ' + PK.fmt(a.amount);
    html += '<div class="rv-tl-row' + (a.act === 'fold' ? ' dim' : '') + '"><span class="rv-tl-name">' + esc(nameOf[a.pid] != null ? nameOf[a.pid] : '?') + '</span><b>' + txt + '</b></div>';
  });
  if (!log.actions.length) html += '<div class="dim">—</div>';
  html += '</div>';

  html += '<div class="modal-btns"><button class="btn primary" data-close="next">' + PK.t('下一局') + '</button></div>';
  return this.modal(html, { cls: 'modal-review' });
};

Hud.showResults = function (data) {
  var engine = this.engine;
  var html = '<h3>' + data.title + '</h3>';
  html += '<div class="res-sub">' + data.sub + '</div>';
  html += '<table class="res-table"><tr><th></th><th>' + PK.t('玩家') + '</th><th>' + (data.mode === 'cash' ? PK.t('盈亏') : PK.t('名次/奖金')) + '</th><th>' + PK.t('手数') + '</th><th>' + PK.t('入池率') + '</th></tr>';
  data.rows.forEach(function (r) {
    html += '<tr class="' + (r.isHero ? 'hero-row' : '') + '"><td>' + r.medal + '</td><td>' + esc(r.name) + (r.styleTag ? ' <span class="np-style">' + r.styleTag + '</span>' : '') + '</td><td>' + r.main + '</td><td>' + r.hands + '</td><td>' + r.vpip + '</td></tr>';
  });
  html += '</table>';
  html += '<div class="modal-btns"><button class="btn primary" data-close="restart">' + PK.t('再来一局') + '</button><button class="btn" data-close="lobby">' + PK.t('回到大厅') + '</button></div>';
  return this.modal(html, { cls: 'modal-results' });
};

Hud.showHelp = function () {
  var html = '<h3>' + PK.t('玩法与功能') + '</h3><div class="help-body">' +
    '<p>' + PK.t('<b>三种模式</b>:现金局(盲注固定/随时重买) · 锦标赛(盲注升级/打到只剩一人/前三名分奖) · 鱿鱼场(淘汰时钟每 N 手淘汰最短码, 最后一手全员强制摊牌, 击倒对手得赏金, 奖池存进小猪罐 🐷)。') + '</p>' +
    '<p>' + PK.t('<b>记牌器</b>(左栏):绿色=公共牌, 蓝色=你的手牌, 红色=已弃牌(开启"亮弃牌"时)。实时统计已见牌。') + '</p>' +
    '<p>' + PK.t('<b>胜率</b>(右栏):蒙特卡洛模拟 vs 场上对手数, 已见死牌会从模拟中剔除; 同时显示底池赔率参考。') + '</p>' +
    '<p>' + PK.t('<b>AI 决策</b>:人机按「风格参数 × 胜率 × 随机噪声」决策; 配置大模型 API 后, AI 玩家会按比例咨询大模型并与风格决策加权融合, 也可给你实时建议。') + '</p>' +
    '<p>' + PK.t('<b>快捷键</b>:F 弃牌 · C 过牌/跟注 · R 加注(滑条) · Enter 确认加注 · A 全下 · D AI建议。') + '</p>' +
    '<p class="dim">' + PK.t('公平性: AI 与建议只用公开信息+自身手牌, 绝不偷看牌堆。') + '</p>' +
    '</div><div class="modal-btns"><button class="btn primary" data-close="ok">' + PK.t('开始游戏') + '</button></div>';
  return this.modal(html, { cls: 'modal-help' });
};

window.PK = PK;
})();
