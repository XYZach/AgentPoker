/* 2D 场景: 纯 DOM/CSS 渲染(参考图: 蓝色桌布椭圆桌 + 深色背景)
 * 与 3D 版(Scene3D)同 API, main.js/hud.js 无需感知差异。
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : (window.PK = {});
var T = PK.TWEEN;

var DENOMS = [
  { v: 1000, c: '#f4d03f' }, { v: 500, c: '#9b59b6' }, { v: 100, c: '#4a6580' },
  { v: 25, c: '#27ae60' }, { v: 5, c: '#e74c3c' }, { v: 1, c: '#ecf0f1' }
];
function chipsFor(amount) {
  var out = [], rem = Math.max(0, Math.round(amount));
  for (var i = 0; i < DENOMS.length && rem > 0; i++) {
    var n = Math.floor(rem / DENOMS[i].v);
    if (n > 0) { out.push({ n: Math.min(n, 6), c: DENOMS[i].c }); rem -= n * DENOMS[i].v; }
  }
  return out.length ? out : [{ n: 1, c: '#ecf0f1' }];
}

function el(tag, cls, parent) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function Scene2D(container, opts) {
  this.mode = (opts && opts.mode) || 'cash';
  this.is2d = true;
  this.container = container;
  this.speed = 1;
  this._root = el('div', 'scene2d' + (this.mode === 'squid' ? ' squid' : ''), container);
  this._cards = [];       // {root, inner, card, playerId, community, mucked, heroCard, x, y, w, h, place}
  this._chips = {};       // playerId -> el
  this._potChips = null;
  this._avatars = {};
  this._anchors = {};
  this._extra = {};
  this._seats = {};
  this._communityCount = 0;
  this._dealerBtn = null;
  this._piggy = null;
  this._W = 0; this._H = 0;
  this.onProject = null;

  this._buildStatic();
  this._layout();
  this._onResize = this._layout.bind(this);
  window.addEventListener('resize', this._onResize);
  this._startLoop();
  window.__pkScene = this; // 调试钩子
}

/* ---------- 静态元素 ---------- */
Scene2D.prototype._buildStatic = function () {
  var r = this._root;
  this._table = el('div', 't2d-table', r);
  this._rail = el('div', 't2d-rail', r);
  this._felt = el('div', 't2d-felt', r);
  this._line = el('div', 't2d-line', r);
  this._logo = el('div', 't2d-logo', r);
  this._logo.textContent = this.mode === 'squid' ? 'SQUID HOLD\'EM' : 'NO LIMIT HOLD\'EM';
  // 弃牌堆标记
  this._muckMark = el('div', 't2d-muck', r);
  this._muckMark.textContent = PK.t('弃牌堆');
  // 荷官
  this._dealerAv = el('div', 'av2d dealer' + (this.mode === 'squid' ? ' squiddealer' : ''), r);
  this._dealerAv.innerHTML = '<span class="av2d-face">' + (this.mode === 'squid' ? '◯' : '🂠') + '</span>';
  // 鱿鱼存钱罐
  if (this.mode === 'squid') {
    this._piggy = el('div', 'piggy2d', r);
    this._piggy.textContent = '🐷';
  }
  // 红闪
  this._flash = el('div', 'flash2d', r);
};

/* ---------- 布局 ---------- */
Scene2D.prototype._layout = function () {
  var W = this.container.clientWidth || window.innerWidth;
  var H = this.container.clientHeight || window.innerHeight;
  this._W = W; this._H = H;
  var cx = W / 2, cy = H * 0.44;
  // 紧凑模式(7人以上)桌子缩小, 给四周座位与铭牌留空间
  var fx = this._compact ? 0.29 : 0.34, fy = this._compact ? 0.29 : 0.34;
  var RX = Math.min(W * fx, 640), RY = Math.min(H * fy, RX * 0.56);
  this.cx = cx; this.cy = cy; this.RX = RX; this.RY = RY;

  var tw = RX * 2, th = RY * 2;
  this._table.style.cssText += ';width:' + tw + 'px;height:' + th + 'px;left:' + (cx - RX) + 'px;top:' + (cy - RY) + 'px;';
  this._rail.style.cssText += ';width:' + (tw + 34) + 'px;height:' + (th + 34) + 'px;left:' + (cx - RX - 17) + 'px;top:' + (cy - RY - 17) + 'px;';
  this._felt.style.cssText += ';width:' + tw + 'px;height:' + th + 'px;left:' + (cx - RX) + 'px;top:' + (cy - RY) + 'px;';
  this._line.style.cssText += ';width:' + (tw * 0.74) + 'px;height:' + (th * 0.74) + 'px;left:' + (cx - RX * 0.74) + 'px;top:' + (cy - RY * 0.74) + 'px;';
  this._logo.style.left = cx + 'px'; this._logo.style.top = (cy + RY * 0.34) + 'px';

  /* 发牌源 = 荷官位置(桌布上缘居中), 无独立牌堆 */
  this._muck = { x: cx - RX * 0.72, y: cy - RY * 0.2 };
  this._muckMark.style.left = this._muck.x + 'px';
  this._muckMark.style.top = this._muck.y + 'px';

  // 荷官: 桌布上缘内侧, 标签在头像上方
  this._dealerAv.style.left = cx + 'px';
  this._dealerAv.style.top = (cy - RY * 0.72) + 'px';
  this._deck = { x: cx, y: cy - RY * 0.72 };
  this._extra.dealer = { position: { x: cx, y: cy - RY * 0.72 - 27, z: 0 } };

  this._pot = { x: cx, y: cy - RY * 0.36 };
  this._extra.pot = { position: { x: this._pot.x, y: this._pot.y - 40, z: 0 } };

  if (this._piggy) {
    this._piggy.style.left = (cx - RX * 0.6) + 'px';
    this._piggy.style.top = (cy - RY * 0.68) + 'px';
    this._extra.piggy = { position: { x: cx - RX * 0.6, y: cy - RY * 0.68 - 27, z: 0 } };
  }

  // 玩家座位: 初始布点 -> 全局避让 -> 写 DOM
  var self = this;
  Object.keys(this._seats).forEach(function (pid) {
    self._layoutSeat(+pid);
  });
  this._resolveOverlaps();
  Object.keys(this._seats).forEach(function (pid) {
    self._applySeat(+pid);
  });
  // 已落位卡牌重排(摊牌展开的牌保持展开位)
  this._cards.forEach(function (c) {
    if (c.mucked || c._flying) return;
    var p = self._cardPlace(c.place);
    if (!p) return;
    if (c._revealed && c.place && c.place.type === 'hole' && c.place.playerId !== 0) {
      var o = self._holeOffset(c.place.playerId, c.place.k, true);
      var s = self._seats[c.place.playerId];
      if (s) p = { x: s.card.x + o.x, y: s.card.y + o.y };
    }
    self._placeCard(c, p.x, p.y);
  });
  if (this._dealerBtn && this._dealerBtnTo != null) this._positionDealerBtn(this._dealerBtnTo);
};

Scene2D.prototype._seatAngle = function (i, n) {
  if (i === 0) return 0;
  var m = n - 1;
  var right = Math.ceil(m / 2), left = m - right;
  var idx = i - 1;
  // 顺时针行动: 先左弧(348°→200°)再右弧(160°→12°)
  var a0 = this._compact ? 25 : 12, a1 = this._compact ? 155 : 160;
  if (idx < left) return this._arcAngle(360 - a0, 360 - a1, (idx + 0.5) / left);
  return this._arcAngle(a1, a0, ((idx - left) + 0.5) / right);
};

/* 椭圆弧长均匀采样: t∈[0,1] 映射到 [deg0,deg1] 内弧长等分点(侧面角度间隔自动放大) */
Scene2D.prototype._arcAngle = function (deg0, deg1, t) {
  var a = this.RX, b = this.RY;
  var N = 180, sum = [0], total = 0;
  for (var k = 1; k <= N; k++) {
    var d = deg0 + (deg1 - deg0) * k / N;
    var r = d * Math.PI / 180;
    total += Math.sqrt(a * a * Math.sin(r) * Math.sin(r) + b * b * Math.cos(r) * Math.cos(r));
    sum[k] = total;
  }
  var target = total * t;
  for (k = 0; k <= N; k++) if (sum[k] >= target) break;
  if (k === 0) k = 1;
  var f = (target - sum[k - 1]) / Math.max(1e-6, sum[k] - sum[k - 1]);
  return (deg0 + (deg1 - deg0) * (k - 1 + f) / N) * Math.PI / 180;
};

Scene2D.prototype._layoutSeat = function (pid) {
  var s = this._seats[pid];
  if (!s) return;
  /* 角度索引用 pid(座位序号): s.seat 在首次布局后被覆盖为 {x,y} 坐标对象, 不能再当索引用 */
  var th = this._seatAngle(pid, this._seatCount);
  var dx = Math.sin(th), dy = Math.cos(th);
  s.dx = dx; s.dy = dy;
  var RX = this.RX, RY = this.RY, cx = this.cx, cy = this.cy;
  if (pid === 0) {
    // 玩家自己: 头像在桌沿外(底部偏左), 大牌贴头像右侧且整体在桌内, 铭牌在头像上方
    s.seat = { x: cx - Math.max(120, RX * 0.34), y: cy + RY * 1.13 };
    s.plate = { x: s.seat.x, y: s.seat.y - 52 };
    // 牌贴头像右侧、整体在桌内; 下注筹码在牌右侧(label 投影在筹码上方 86px, 避开公共牌带)
    s.card = { x: s.seat.x + 106, y: cy + RY * 0.7 };
    s.bet = { x: s.seat.x + 216, y: cy + RY * 0.78 };
    // 成牌标签跟手牌水平居中(操作栏弹出时 CSS 自动上移叠牌底避让)
    if (this._made) {
      this._made.style.left = s.card.x + 'px';
      this._made.style.top = (s.card.y + 49) + 'px';
    }
  } else {
    // 座位轨迹: 椭圆点 + 径向法向外推 42px(盒对角支撑 ~37px + 余量), 保证头像盒完全在桌外
    var px = RX * dx, py = RY * dy;
    var L = Math.sqrt(px * px + py * py) || 1;
    var gap = 42;
    s.seat = { x: cx + px + px / L * gap, y: cy + py + py / L * gap };
    // 手牌/下注沿「座位→桌心」插值, 牌在桌内
    s.bet = { x: s.seat.x + (cx - s.seat.x) * 0.55, y: s.seat.y + (cy - s.seat.y) * 0.55 };
    s.card = { x: s.seat.x + (cx - s.seat.x) * 0.3, y: s.seat.y + (cy - s.seat.y) * 0.3 };
    // 铭牌绑定初值: 底部/顶部座位紧贴头像上方, 中间带(侧座)紧贴头像下方; 由求解器微调
    if (dy > 0.35 || dy <= -0.3) {
      s.plate = { x: s.seat.x, y: s.seat.y - 34 };
    } else {
      s.plate = { x: s.seat.x, y: s.seat.y + 26 + RECTS.plateH + 4 };
    }
  }
};

/* 写回 DOM/锚点 */
Scene2D.prototype._applySeat = function (pid) {
  var s = this._seats[pid];
  if (!s) return;
  var av = this._avatars[pid];
  if (av) { av.style.left = s.seat.x + 'px'; av.style.top = s.seat.y + 'px'; }
  this._anchors[pid].name.position = { x: s.plate.x, y: s.plate.y, z: 0 };
  this._anchors[pid].bet.position = { x: s.bet.x, y: s.bet.y - 86, z: 0 }; // 标签居中于筹码堆上方
  var chips = this._chips[pid];
  if (chips) { chips.style.left = s.bet.x + 'px'; chips.style.top = s.bet.y + 'px'; }
};

var RECTS = {
  plateW: 124, plateH: 88, av: 28,
  cardsW: 64, cardsH: 66,       // 两侧手牌占位(叠放微错开, 收紧)
  heroCardsW: 140, heroCardsH: 96,
  betW: 62, betH: 104          // 下注标签+筹码堆
};
function seatRects(pid, s) {
  var isHero = pid === 0;
  var cw = isHero ? RECTS.heroCardsW : RECTS.cardsW;
  var ch = isHero ? RECTS.heroCardsH : RECTS.cardsH;
  return {
    av: { l: s.seat.x - RECTS.av, t: s.seat.y - RECTS.av, r: s.seat.x + RECTS.av, b: s.seat.y + RECTS.av },
    plate: { l: s.plate.x - RECTS.plateW / 2, t: s.plate.y - RECTS.plateH, r: s.plate.x + RECTS.plateW / 2, b: s.plate.y },
    cards: { l: s.card.x - cw / 2, t: s.card.y - ch / 2, r: s.card.x + cw / 2, b: s.card.y + ch / 2 },
    bet: { l: s.bet.x - RECTS.betW / 2, t: s.bet.y - 96, r: s.bet.x + RECTS.betW / 2, b: s.bet.y + 6 }
  };
}
function hitR(a, b) { return !(a.r < b.l || b.r < a.l || a.b < b.t || b.b < a.t); }

/* 全局避让: 手牌向桌心收, 铭牌躲开一切障碍(含其他座位与 HUD 面板) */
Scene2D.prototype._resolveOverlaps = function () {
  var W = this._W, H = this._H, cx = this.cx, cy = this.cy, RY = this.RY;
  var panels = [
    { l: 0, t: 0, r: cx + 400, b: 54 },
    { l: 0, t: 56, r: 224, b: Math.min(472, H) },
    { l: W - 244, t: 56, r: W, b: Math.min(478, H) },
    { l: cx - 330, t: H - 170, r: cx + 330, b: H },
    { l: W - 272, t: H - 215, r: W, b: H },
    { l: 0, t: H - 204, r: 254, b: H }
  ];
  var self = this;
  var pids = Object.keys(this._seats).map(Number).sort(function (a, b) { return a - b; });
  // 紧凑模式尺寸
  RECTS.plateW = this._compact ? 104 : 124;
  RECTS.plateH = this._compact ? 80 : 92;
  RECTS.cardsW = this._compact ? 54 : 64;
  RECTS.cardsH = this._compact ? 58 : 66;
  function obstaclesFor(pid) {
    var list = [];
    pids.forEach(function (q) {
      if (q === pid) return;
      var R = seatRects(q, self._seats[q]);
      list.push(R.av, R.cards, R.bet, R.plate);
    });
    return list;
  }
  // 四方向求解: 返回新坐标或 null (centered=true 时 x,y 为矩形中心, 否则为底边中心)
  function solve(x, y, w, h, obs, allowPanels, dirs, step, maxN, clampFn, centered) {
    var best = null, bestN = 99;
    for (var d = 0; d < dirs.length; d++) {
      var px = x, py = y;
      for (var n = 1; n <= maxN; n++) {
        px += dirs[d].x * step; py += dirs[d].y * step;
        var rect = centered
          ? { l: px - w / 2, t: py - h / 2, r: px + w / 2, b: py + h / 2 }
          : { l: px - w / 2, t: py - h, r: px + w / 2, b: py };
        if (clampFn && !clampFn(px, py)) break;
        var ok = true;
        for (var i = 0; i < obs.length; i++) if (hitR(rect, obs[i])) { ok = false; break; }
        if (ok && (allowPanels || !hitPanels(rect))) {
          if (n < bestN) { bestN = n; best = { d: d, n: n }; }
          break;
        }
      }
    }
    if (!best) return null;
    return { x: x + dirs[best.d].x * step * best.n, y: y + dirs[best.d].y * step * best.n };
  }
  var round;
  for (round = 0; round < 3; round++) {
    pids.forEach(function (pid) {
      if (pid === 0) return;
      var s = self._seats[pid];
      var own = seatRects(pid, s);
      var cw = RECTS.cardsW, ch = RECTS.cardsH;
      // 1) 手牌: 优先桌心, 其次切向两侧, 最后向外; 避开桌面中央(公共牌/底池/荷官)
      var cobs = obstaclesFor(pid).concat([own.plate, own.av, own.bet,
        { l: cx - 170, t: cy - 45, r: cx + 170, b: cy + 45 },
        { l: cx - 50, t: cy - 130, r: cx + 50, b: cy + 30 },
        { l: cx - 32, t: cy - RY * 0.72 - 32, r: cx + 32, b: cy - RY * 0.72 + 32 }
      ]);
      var cdirs = [
        { x: -s.dx, y: -s.dy }, { x: -s.dy, y: s.dx },
        { x: s.dy, y: -s.dx }, { x: s.dx, y: s.dy },
        { x: 1, y: 0 }, { x: -1, y: 0 }
      ];
      var sol = solve(s.card.x, s.card.y, cw, ch, cobs, false, cdirs, 9, 28, function (px, py) {
        return px > 56 && px < W - 56 && py > 118 && py < H - 108;
      }, true);
      if (sol) { s.card.x = sol.x; s.card.y = sol.y; }
      // 2) 铭牌: 六方向求解(桌心/外/切向×2/水平×2), 先严格避面板, 失败再放宽(仍避开其他铭牌)
      own = seatRects(pid, s); // 手牌已移动, 重建自身矩形
      var pobs = obstaclesFor(pid).concat([own.av, own.cards, own.bet,
        { l: cx - 40, t: cy - RY * 0.72 - 40, r: cx + 40, b: cy - RY * 0.72 + 40 }, // 荷官
        { l: cx - 95, t: cy - RY * 0.36 - 66, r: cx + 95, b: cy - RY * 0.36 + 6 }   // 彩池标签
      ]);
      var pdirs = [
        { x: -s.dx, y: -s.dy }, { x: s.dx, y: s.dy },
        { x: -s.dy, y: s.dx }, { x: s.dy, y: -s.dx },
        { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 0.7, y: 0.7 }, { x: -0.7, y: 0.7 }, { x: 0.7, y: -0.7 }, { x: -0.7, y: -0.7 }
      ];
      var clampP = function (px, py) { return px > 74 && px < W - 74 && py > 142 && py < H - 58; };
      var otherPlates = [];
      pids.forEach(function (q) { if (q !== pid) otherPlates.push(seatRects(q, self._seats[q]).plate); });
      /* 放宽轮: 仍须避开他人铭牌与头像(压头像会遮挡座位标识) */
      var relaxedObs = [own.av, own.cards, own.bet].concat(otherPlates);
      pids.forEach(function (q) { if (q !== pid) relaxedObs.push(seatRects(q, self._seats[q]).av); });
      sol = solve(s.plate.x, s.plate.y, RECTS.plateW, RECTS.plateH, pobs, false, pdirs, 7, 42, clampP);
      if (!sol) sol = solve(s.plate.x, s.plate.y, RECTS.plateW, RECTS.plateH, relaxedObs, true, pdirs, 7, 42, clampP);
      if (!sol) {
        /* 顶部座位上方空间不足时, 反转锚定方向(above<->below)再试 */
        var flippedY = (s.plate.y < s.seat.y) ? s.seat.y + 26 + RECTS.plateH + 4 : s.seat.y - 34;
        sol = solve(s.plate.x, flippedY, RECTS.plateW, RECTS.plateH, relaxedObs, true, pdirs, 7, 42, clampP);
      }
      if (sol) { s.plate.x = sol.x; s.plate.y = sol.y; }
      // 屏幕钳制
      s.plate.x = Math.max(74, Math.min(W - 74, s.plate.x));
      s.plate.y = Math.max(142, Math.min(H - 58, s.plate.y));
      s.card.x = Math.max(60, Math.min(W - 60, s.card.x));
      s.card.y = Math.max(120, Math.min(H - 110, s.card.y));
    });
  }
  function hitPanels(r) {
    for (var k = 0; k < panels.length; k++) if (hitR(r, panels[k])) return true;
    return false;
  }
};

/* 手牌两张的相对偏移: hero 平铺大牌; AI 盖牌叠放微错开(省桌面); 摊牌时展开露牌面 */
Scene2D.prototype._holeOffset = function (playerId, k, revealed) {
  if (playerId === 0) return { x: k === 0 ? -36 : 36, y: 0 };
  if (revealed) return { x: k === 0 ? -24 : 24, y: k === 0 ? 4 : -4 };
  var d = this._compact ? 6 : 7;
  return { x: k === 0 ? -d : d, y: k === 0 ? 3 : -3 };
};

Scene2D.prototype._cardPlace = function (place) {
  if (!place) return null;
  if (place.type === 'community') {
    var spacing = 56;
    return { x: this.cx + (place.idx - 2) * spacing, y: this.cy - this.RY * 0.02 };
  }
  var s = this._seats[place.playerId];
  if (!s) return null;
  var o = this._holeOffset(place.playerId, place.k, false);
  return { x: s.card.x + o.x, y: s.card.y + o.y };
};

/* ---------- 玩家 ---------- */
Scene2D.prototype.buildPlayers = function (players) {
  var self = this;
  this._seatCount = players.length;
  this._compact = players.length >= 7; // 紧凑模式: 缩小铭牌与手牌
  document.body.classList.toggle('pk-compact', this._compact);
  var SHIRT = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22', '#16a085', '#8e6e53', '#c0392b', '#2980b9'];
  players.forEach(function (p) {
    self._seats[p.id] = { seat: p.seat };
    var isSquid = self.mode === 'squid' && !p.isHuman;
    var av = el('div', 'av2d' + (p.isHuman ? ' hero' : '') + (isSquid ? ' guard' : ''), self._root);
    var faceTxt = p.isHuman ? PK.t('我') : (isSquid ? ['◯', '△', '□'][p.id % 3] : p.name.slice(0, 1));
    av.innerHTML = '<span class="av2d-face">' + faceTxt + '</span><span class="av2d-name">' + (p.isHuman ? '' : '') + '</span>';
    if (!p.isHuman && !isSquid) av.style.setProperty('--avc', SHIRT[p.id % SHIRT.length]);
    if (isSquid && p.styleKey === 'MANIAC') av.classList.add('frontman');
    self._avatars[p.id] = av;
    self._anchors[p.id] = { name: { position: { x: 0, y: 0, z: 0 } }, bet: { position: { x: 0, y: 0, z: 0 } } };
  });
  /* hero 成牌标签: 挂在手牌下方, 提示当前成牌(结合公共牌) */
  this._made = el('div', 'hero-made hidden', this._root);
  this._madeKey = null;
  this._layout();
};

/* ---------- 卡牌 ---------- */
Scene2D.prototype._makeCard = function (card, w, h) {
  var root = el('div', 'c2', this._root);
  root.style.width = w + 'px';
  root.style.height = h + 'px';
  var inner = el('div', 'c2i', root);
  var front = el('div', 'c2f c2-front', inner);
  var r = card >> 2, s = card & 3;
  var red = (s === 1 || s === 2) ? ' red' : '';
  front.innerHTML =
    '<span class="c2-corner' + red + '"><b>' + PK.RANK_NAME[r] + '</b><i>' + PK.SUIT_CHARS[s] + '</i></span>' +
    '<span class="c2-big' + red + '">' + PK.SUIT_CHARS[s] + '</span>';
  el('div', 'c2f c2-back' + (this.mode === 'squid' ? ' sq' : ''), inner);
  return { root: root, inner: inner, card: card, w: w, h: h, x: 0, y: 0 };
};

Scene2D.prototype._placeCard = function (c, x, y) {
  c.x = x; c.y = y;
  c.root.style.transform = 'translate(' + (x - c.w / 2) + 'px,' + (y - c.h / 2) + 'px)' + (c._rot || '');
};

Scene2D.prototype.dealHole = function (playerId, card, k, faceUp) {
  var self = this;
  var isHero = faceUp;
  var cw = isHero ? 64 : (this._compact ? 36 : 42);
  var chh = isHero ? 90 : (this._compact ? 50 : 59);
  var c = this._makeCard(card, cw, chh);
  c.playerId = playerId; c.heroCard = isHero; c.place = { type: 'hole', playerId: playerId, k: k };
  c._flying = true;
  this._cards.push(c);
  this._placeCard(c, this._deck.x, this._deck.y);
  c.inner.style.transform = 'rotateY(180deg)';
  this._dealerSweep();
  var target = this._cardPlace(c.place) || { x: this._deck.x, y: this._deck.y };
  var from = { x: this._deck.x, y: this._deck.y };
  return T.add({
    dur: 300 / this.speed, ease: T.Ease.outQuad,
    onUpdate: function (t) {
      var x = from.x + (target.x - from.x) * t;
      var y = from.y + (target.y - from.y) * t - Math.sin(Math.PI * t) * 30;
      c.root.style.transform = 'translate(' + (x - c.w / 2) + 'px,' + (y - c.h / 2) + 'px) rotate(' + ((1 - t) * 12 - 6) + 'deg)';
    }
  }).then(function () {
    c._flying = false;
    self._placeCard(c, target.x, target.y);
    if (faceUp) {
      return T.add({
        dur: 260 / self.speed, ease: T.Ease.outCubic,
        onUpdate: function (t) { c.inner.style.transform = 'rotateY(' + (180 - 180 * t) + 'deg)'; }
      });
    }
  });
};

Scene2D.prototype.dealCommunity = function (cards) {
  var self = this;
  this._dealerSweep();
  var ps = [];
  cards.forEach(function (card, i) {
    var idx = self._communityCount + i;
    var c = self._makeCard(card, 50, 70);
    c.community = true; c.place = { type: 'community', idx: idx };
    c._flying = true;
    self._cards.push(c);
    self._placeCard(c, self._deck.x, self._deck.y);
    c.inner.style.transform = 'rotateY(180deg)';
    var target = self._cardPlace(c.place);
    var from = { x: self._deck.x, y: self._deck.y };
    ps.push(T.add({
      dur: 320 / self.speed, ease: T.Ease.outQuad,
      onUpdate: function (t) {
        var x = from.x + (target.x - from.x) * t;
        var y = from.y + (target.y - from.y) * t - Math.sin(Math.PI * t) * 34;
        c.root.style.transform = 'translate(' + (x - c.w / 2) + 'px,' + (y - c.h / 2) + 'px)';
      }
    }).then(function () {
      c._flying = false;
      self._placeCard(c, target.x, target.y);
      return T.add({
        dur: 240 / self.speed, ease: T.Ease.outCubic,
        onUpdate: function (t) { c.inner.style.transform = 'rotateY(' + (180 - 180 * t) + 'deg)'; }
      });
    }));
  });
  this._communityCount += cards.length;
  return Promise.all(ps);
};

Scene2D.prototype.revealHole = function (playerId) {
  var self = this;
  var s = this._seats[playerId];
  var mine = this._cards.filter(function (c) { return c.playerId === playerId && !c.mucked && !c.heroCard; });
  return Promise.all(mine.map(function (c) {
    /* 叠放手牌摊牌时展开到两侧, 翻面同时移位, 露出两张牌面 */
    c._revealed = true;
    var k = c.place ? c.place.k : 0;
    var o = self._holeOffset(playerId, k, true);
    var tx = s ? s.card.x + o.x : c.x, ty = s ? s.card.y + o.y : c.y;
    var fx = c.x, fy = c.y;
    return T.add({
      dur: 300 / self.speed, ease: T.Ease.outCubic,
      onUpdate: function (t) {
        c.inner.style.transform = 'rotateY(' + (180 - 180 * t) + 'deg)';
        var x = fx + (tx - fx) * t, y = fy + (ty - fy) * t;
        c.root.style.transform = 'translate(' + (x - c.w / 2) + 'px,' + (y - c.h / 2) + 'px)';
      }
    }).then(function () { self._placeCard(c, tx, ty); });
  }));
};

Scene2D.prototype.muckCards = function (playerId) {
  var self = this;
  var mine = this._cards.filter(function (c) { return c.playerId === playerId && !c.mucked; });
  return Promise.all(mine.map(function (c) {
    c.mucked = true;
    /* hero 弃牌: 牌留在面前变灰(正面朝上不收走); AI 弃牌: 背面飞向弃牌堆 */
    if (c.heroCard) {
      c.root.classList.add('folded-grey');
      return Promise.resolve();
    }
    var from = { x: c.x, y: c.y };
    var to = self._muck;
    return T.add({
      dur: 300 / self.speed, ease: T.Ease.inQuad,
      onUpdate: function (t) {
        var x = from.x + (to.x - from.x) * t;
        var y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * 26;
        c.root.style.transform = 'translate(' + (x - c.w / 2) + 'px,' + (y - c.h / 2) + 'px)';
        c.root.style.opacity = 1 - Math.max(0, (t - 0.7) / 0.3);
      }
    }).then(function () { c.root.remove(); });
  }));
};

Scene2D.prototype.highlightCards = function (cards) {
  this.clearHighlights();
  this._cards.forEach(function (c) {
    if (c.mucked || cards.indexOf(c.card) < 0) return;
    c.root.classList.add('win');
    c.root.style.transform += ' translateY(-8px)';
  });
};
Scene2D.prototype.clearHighlights = function () {
  this._cards.forEach(function (c) {
    c.root.classList.remove('win');
    if (!c._flying && !c.mucked) c.root.style.transform = 'translate(' + (c.x - c.w / 2) + 'px,' + (c.y - c.h / 2) + 'px)';
  });
};

/* ---------- 筹码 ---------- */
Scene2D.prototype._chipStack = function (amount, x, y) {
  var wrap = el('div', 'chips2d', this._root);
  var denoms = chipsFor(amount);
  var total = 0;
  denoms.forEach(function (d) { total += d.n; });
  total = Math.min(total, 10);
  for (var i = 0; i < total; i++) {
    var d = denoms.length ? denoms[i % denoms.length] : { c: '#ecf0f1' };
    var chip = el('div', 'chip2d', wrap);
    chip.style.bottom = (i * 5) + 'px';
    chip.style.background = d.c;
  }
  wrap.style.left = x + 'px';
  wrap.style.top = y + 'px';
  return wrap;
};

Scene2D.prototype.setBet = function (playerId, amount) {
  if (this._chips[playerId]) { this._chips[playerId].remove(); delete this._chips[playerId]; }
  var s = this._seats[playerId];
  if (!s || !amount || amount <= 0) return;
  this._chips[playerId] = this._chipStack(amount, s.bet.x, s.bet.y);
};

Scene2D.prototype.collectBets = function () {
  var self = this;
  var groups = Object.keys(this._chips).map(function (pid) { return self._chips[pid]; });
  this._chips = {};
  if (!groups.length) return Promise.resolve();
  return Promise.all(groups.map(function (g) {
    var from = { x: parseFloat(g.style.left), y: parseFloat(g.style.top) };
    return T.add({
      dur: 280 / self.speed, ease: T.Ease.inQuad,
      onUpdate: function (t) {
        g.style.left = (from.x + (self._pot.x - from.x) * t) + 'px';
        g.style.top = (from.y + (self._pot.y - from.y) * t) + 'px';
        g.style.opacity = 1 - Math.max(0, (t - 0.75) / 0.25);
      }
    }).then(function () { g.remove(); });
  }));
};

Scene2D.prototype.setPot = function (amount) {
  if (this._potChips) { this._potChips.remove(); this._potChips = null; }
  if (amount > 0) this._potChips = this._chipStack(amount, this._pot.x, this._pot.y + 12);
};

Scene2D.prototype.awardPot = function (winnerId, amount) {
  var self = this;
  var s = this._seats[winnerId];
  if (this._potChips) { this._potChips.remove(); this._potChips = null; }
  if (!s) return Promise.resolve();
  var fly = this._chipStack(amount, this._pot.x, this._pot.y + 12);
  var from = { x: this._pot.x, y: this._pot.y + 12 };
  return T.add({
    dur: 520 / this.speed, ease: T.Ease.outCubic,
    onUpdate: function (t) {
      fly.style.left = (from.x + (s.bet.x - from.x) * t) + 'px';
      fly.style.top = (from.y + (s.bet.y - from.y) * t - Math.sin(Math.PI * t) * 60) + 'px';
    }
  }).then(function () { fly.remove(); });
};

/* ---------- 庄家钮 ---------- */
Scene2D.prototype._positionDealerBtn = function (playerId) {
  var s = this._seats[playerId];
  if (!s || !this._dealerBtn) return;
  this._dealerBtn.style.left = (s.card.x + 34) + 'px';
  this._dealerBtn.style.top = (s.card.y + 26) + 'px';
};
Scene2D.prototype.moveDealerButton = function (playerId) {
  if (!this._dealerBtn) {
    this._dealerBtn = el('div', 'dbtn2d', this._root);
    this._dealerBtn.textContent = 'D';
  }
  this._dealerBtnTo = playerId;
  var s = this._seats[playerId];
  if (!s) return Promise.resolve();
  var self = this;
  var from = { x: parseFloat(this._dealerBtn.style.left) || this.cx, y: parseFloat(this._dealerBtn.style.top) || this.cy };
  if (!this._dealerBtn.style.left) { this._positionDealerBtn(playerId); return Promise.resolve(); }
  var to = { x: s.card.x + 34, y: s.card.y + 26 };
  var btn = this._dealerBtn;
  return T.add({
    dur: 360 / this.speed, ease: T.Ease.outCubic,
    onUpdate: function (t) {
      btn.style.left = (from.x + (to.x - from.x) * t) + 'px';
      btn.style.top = (from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * 30) + 'px';
    }
  });
};

/* ---------- 荷官/特效 ---------- */
Scene2D.prototype._dealerSweep = function () {
  if (this._dealerSweeping || !this._dealerAv) return;
  this._dealerSweeping = true;
  var self = this;
  var av = this._dealerAv;
  T.add({
    dur: 320 / this.speed, ease: T.Ease.outCubic,
    onUpdate: function (t) { av.style.setProperty('--sweep', Math.sin(Math.PI * t) * -12 + 'px'); }
  }).then(function () { self._dealerSweeping = false; });
};

Scene2D.prototype.confetti = function (playerId) {
  var s = this._seats[playerId];
  if (!s) return;
  var colors = ['#ffd166', '#ff2d78', '#00e5c3', '#9b59b6', '#f4f2ec'];
  var self = this;
  for (var i = 0; i < 40; i++) {
    var f = el('div', 'confetti2d', this._root);
    f.style.background = colors[i % colors.length];
    f.style.left = s.seat.x + 'px';
    f.style.top = (s.seat.y - 20) + 'px';
    var vx = (Math.random() - 0.5) * 240, vy = -(140 + Math.random() * 220);
    var x = s.seat.x, y = s.seat.y - 20;
    var iv = setInterval(function (ff, xx, yy, vxx, vyy) {
      var life = 0;
      return function () {
        life += 0.032;
        vyy += 14;
        xx += vxx * 0.032; yy += vyy * 0.032;
        ff.style.left = xx + 'px'; ff.style.top = yy + 'px';
        ff.style.opacity = Math.max(0, 1 - life / 2);
        if (life > 2 || yy > self._H + 20) { clearInterval(iv); ff.remove(); }
      };
    }(f, x, y, vx, vy), 32);
  }
};

Scene2D.prototype.eliminate = function (playerId, squid) {
  var av = this._avatars[playerId];
  var self = this;
  this._flash.classList.add('on');
  setTimeout(function () { self._flash.classList.remove('on'); }, 650);
  if (!av) return Promise.resolve();
  av.classList.add('out');
  return T.add({ dur: 700 / this.speed, ease: T.Ease.outQuad, onUpdate: function () { } });
};

Scene2D.prototype.piggyCoins = function (playerId, amount) {
  var s = this._seats[playerId];
  if (!s || !this._piggy) return;
  var self = this;
  var n = Math.min(10, 3 + Math.floor(amount / 300));
  var pigPos = { x: parseFloat(this._piggy.style.left), y: parseFloat(this._piggy.style.top) };
  for (var i = 0; i < n; i++) {
    var dot = el('div', 'coin2d', this._root);
    var from = { x: s.seat.x, y: s.seat.y };
    var delay = i * 45;
    setTimeout(function (dd, ff, dur) {
      return function () {
        T.add({
          dur: dur / self.speed, ease: T.Ease.outCubic,
          onUpdate: function (t) {
            dd.style.left = (ff.x + (pigPos.x - ff.x) * t) + 'px';
            dd.style.top = (ff.y + (pigPos.y - ff.y) * t - Math.sin(Math.PI * t) * 90) + 'px';
            dd.style.opacity = 1 - Math.max(0, (t - 0.85) / 0.15);
          }
        }).then(function () { dd.remove(); });
      };
    }(dot, from, 650 + i * 40), delay);
  }
  this._piggy.classList.remove('bounce');
  void this._piggy.offsetWidth;
  this._piggy.classList.add('bounce');
};

Scene2D.prototype.setAvatarState = function (playerId, state) {
  var av = this._avatars[playerId];
  if (!av) return;
  if (state === 'folded') av.classList.add('folded');
  else av.classList.remove('folded');
};
Scene2D.prototype.setThinking = function (playerId, on) {
  var av = this._avatars[playerId];
  if (av) av.classList.toggle('thinking', !!on);
};

Scene2D.prototype.clearHandVisuals = function () {
  var self = this;
  this._cards.forEach(function (c) { c.root.remove(); });
  this._cards = [];
  Object.keys(this._chips).forEach(function (pid) { self._chips[pid].remove(); delete self._chips[pid]; });
  if (this._potChips) { this._potChips.remove(); this._potChips = null; }
  this._communityCount = 0;
};
Scene2D.prototype.resetAvatarStates = function () {
  var self = this;
  Object.keys(this._avatars).forEach(function (pid) {
    self._avatars[pid].classList.remove('folded', 'out');
  });
};

/* ---------- 兼容 3D API 的空操作 ---------- */
Scene2D.prototype.setCinematic = function () { };
Scene2D.prototype.cameraPreset = function () { };

Scene2D.prototype.project = function (v) {
  return { x: v.x, y: v.y };
};
Scene2D.prototype.anchorOf = function (playerId) { return this._anchors[playerId]; };
Scene2D.prototype.extraAnchor = function (key) { return this._extra[key]; };

/* ---------- 主循环 ---------- */
Scene2D.prototype._startLoop = function () {
  var self = this;
  function frame(now) {
    T.update(now);
    if (self.onProject) self.onProject();
    self._raf = requestAnimationFrame(frame);
  }
  this._raf = requestAnimationFrame(frame);
  this._ticker = setInterval(function () {
    T.update(performance.now());
    if (self.onProject) self.onProject();
  }, 33);
};

Scene2D.prototype.setSpeed = function (s) { this.speed = s; };

/* 语言切换时刷新场景内文字 */
Scene2D.prototype.refreshLang = function () {
  this._logo.textContent = this.mode === 'squid' ? 'SQUID HOLD\'EM' : 'NO LIMIT HOLD\'EM';
  this._muckMark.textContent = PK.t('弃牌堆');
  var heroAv = this._avatars[0];
  if (heroAv) {
    var face = heroAv.querySelector('.av2d-face');
    if (face) face.textContent = PK.t('我');
  }
  if (this._made && this._madeKey) this._made.textContent = PK.t(this._madeKey);
};

/* hero 成牌标签: 传中文 key(存储以便切语言重译), null 隐藏 */
Scene2D.prototype.setHeroMade = function (key) {
  this._madeKey = key || null;
  if (!key) { this._made.classList.add('hidden'); return; }
  this._made.textContent = PK.t(key);
  this._made.classList.remove('hidden');
};

Scene2D.prototype.destroy = function () {
  cancelAnimationFrame(this._raf);
  if (this._ticker) clearInterval(this._ticker);
  window.removeEventListener('resize', this._onResize);
  document.body.classList.remove('pk-compact');
  this._root.remove();
};

PK.Scene2D = Scene2D;
})();
