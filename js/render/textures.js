/* 程序化 Canvas 纹理: 扑克牌面/牌背/桌布/筹码/面具 等 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : (window.PK = {});
var Tex = PK.Tex = { _cache: {} };

function canvas(w, h) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
Tex.canvas = canvas;

function toTex(c, aniso) {
  var t = new THREE.CanvasTexture(c);
  t.anisotropy = aniso || 4;
  if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
  return t;
}

var SUIT_CHAR = ['\u2660', '\u2665', '\u2666', '\u2663'];
var SUIT_RED = [false, true, true, false];
var RANK_STR = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

/* 标准点数排布(0..1 相对坐标, x 左->右, y 上->下) */
var PIPS = {
  2: [[0.5, 0.18], [0.5, 0.82]],
  3: [[0.5, 0.18], [0.5, 0.5], [0.5, 0.82]],
  4: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.82], [0.7, 0.82]],
  5: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.5], [0.3, 0.82], [0.7, 0.82]],
  6: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.5], [0.7, 0.5], [0.3, 0.82], [0.7, 0.82]],
  7: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.3, 0.82], [0.7, 0.82]],
  8: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.34], [0.3, 0.5], [0.7, 0.5], [0.5, 0.66], [0.3, 0.82], [0.7, 0.82]],
  9: [[0.3, 0.18], [0.7, 0.18], [0.3, 0.39], [0.7, 0.39], [0.5, 0.5], [0.3, 0.61], [0.7, 0.61], [0.3, 0.82], [0.7, 0.82]],
  10: [[0.3, 0.18], [0.7, 0.18], [0.5, 0.29], [0.3, 0.39], [0.7, 0.39], [0.3, 0.61], [0.7, 0.61], [0.5, 0.71], [0.3, 0.82], [0.7, 0.82]]
};

/* 扑克牌面 256x358 */
Tex.cardFace = function (card) {
  var key = 'cf' + card;
  if (Tex._cache[key]) return Tex._cache[key];
  var W = 256, H = 358, r = card >> 2, s = card & 3;
  var c = canvas(W, H), x = c.getContext('2d');
  // 白底圆角
  x.fillStyle = '#fdfdf8';
  roundRect(x, 3, 3, W - 6, H - 6, 20);
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 3;
  roundRect(x, 3, 3, W - 6, H - 6, 20);
  x.stroke();
  var col = SUIT_RED[s] ? '#c8102e' : '#1a1a2e';
  x.fillStyle = col;
  // 角标(左上 + 右下倒转)
  var rs = RANK_STR[r];
  x.font = 'bold 56px Georgia, serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(rs, 38, 44);
  x.font = '44px Georgia, serif';
  x.fillText(SUIT_CHAR[s], 38, 92);
  x.save();
  x.translate(W - 38, H - 92); x.rotate(Math.PI);
  x.font = 'bold 56px Georgia, serif';
  x.fillText(rs, 0, 0);
  x.font = '44px Georgia, serif';
  x.fillText(SUIT_CHAR[s], 0, 48);
  x.restore();
  // 中央区域
  if (r >= 11) {
    // JQK: 大字母 + 装饰框 + 两个花色
    x.save();
    x.strokeStyle = col; x.lineWidth = 5;
    roundRect(x, 74, 92, W - 148, H - 184, 14); x.stroke();
    x.font = 'bold 150px Georgia, serif';
    x.fillText(rs, W / 2, H / 2 - 18);
    x.font = '64px Georgia, serif';
    x.fillText(SUIT_CHAR[s], W / 2, 108);
    x.fillText(SUIT_CHAR[s], W / 2, H - 108);
    x.restore();
  } else if (r === 14) {
    x.font = '170px Georgia, serif';
    x.fillText(SUIT_CHAR[s], W / 2, H / 2);
  } else {
    var pips = PIPS[r];
    x.font = '72px Georgia, serif';
    pips.forEach(function (pt) {
      var py = pt[1];
      x.save();
      x.translate(pt[0] * W, py * H);
      if (py > 0.5) x.rotate(Math.PI);
      x.fillText(SUIT_CHAR[s], 0, 0);
      x.restore();
    });
  }
  Tex._cache[key] = toTex(c);
  return Tex._cache[key];
};

function roundRect(x, a, b, w, h, r) {
  x.beginPath();
  x.moveTo(a + r, b);
  x.arcTo(a + w, b, a + w, b + h, r);
  x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r);
  x.arcTo(a, b, a + w, b, r);
  x.closePath();
}

/* 牌背: mode 'classic' 藏蓝 / 'squid' 鱿鱼粉青 */
Tex.cardBack = function (mode) {
  var key = 'cb' + mode;
  if (Tex._cache[key]) return Tex._cache[key];
  var W = 256, H = 358;
  var c = canvas(W, H), x = c.getContext('2d');
  var bg = mode === 'squid' ? '#0e3a3f' : '#1c2461';
  var accent = mode === 'squid' ? '#ff2d78' : '#3f51b5';
  var accent2 = mode === 'squid' ? '#00e5c3' : '#7986cb';
  x.fillStyle = bg;
  roundRect(x, 3, 3, W - 6, H - 6, 20); x.fill();
  x.strokeStyle = accent; x.lineWidth = 6;
  roundRect(x, 14, 14, W - 28, H - 28, 14); x.stroke();
  x.strokeStyle = accent2; x.lineWidth = 2;
  roundRect(x, 26, 26, W - 52, H - 52, 10); x.stroke();
  // 网格纹
  x.strokeStyle = accent2; x.lineWidth = 1.5; x.globalAlpha = 0.35;
  for (var i = 40; i < W - 30; i += 22) {
    x.beginPath(); x.moveTo(i, 32); x.lineTo(i - 14, H - 32); x.stroke();
  }
  for (var j = 52; j < H - 30; j += 22) {
    x.beginPath(); x.moveTo(30, j); x.lineTo(W - 30, j - 14); x.stroke();
  }
  x.globalAlpha = 1;
  // 中心徽记
  x.fillStyle = accent;
  x.font = '84px serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(mode === 'squid' ? '\u25CE' : '\u2660', W / 2, H / 2);
  x.font = 'bold 26px sans-serif';
  x.fillStyle = accent2;
  x.fillText(mode === 'squid' ? 'SQUID' : 'HOLD\u2019EM', W / 2, H / 2 + 68);
  Tex._cache[key] = toTex(c);
  return Tex._cache[key];
};

/* 桌布 1024x1024(映射到椭圆桌面) */
Tex.felt = function (mode) {
  var key = 'felt' + mode;
  if (Tex._cache[key]) return Tex._cache[key];
  var S = 1024;
  var c = canvas(S, S), x = c.getContext('2d');
  var base = mode === 'squid' ? '#0b4f4a' : '#1e5c3f';
  var line = mode === 'squid' ? 'rgba(0,229,195,0.5)' : 'rgba(255,235,150,0.55)';
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  // 噪点
  for (var i = 0; i < 9000; i++) {
    x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.03) + ')';
    x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // 暗角
  var g = x.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, mode === 'squid' ? 'rgba(0,30,30,0.55)' : 'rgba(0,20,10,0.5)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  // 下注线(椭圆)
  x.strokeStyle = line;
  x.lineWidth = 5;
  x.beginPath();
  x.ellipse(S / 2, S / 2, S * 0.40, S * 0.40, 0, 0, Math.PI * 2);
  x.stroke();
  // 中心文字
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = mode === 'squid' ? 'rgba(255,45,120,0.5)' : 'rgba(255,235,150,0.5)';
  x.font = 'bold 54px serif';
  x.fillText(mode === 'squid' ? '\u25CE SQUID HOLD\u2019EM' : '\u2660 TEXAS HOLD\u2019EM \u2660', S / 2, S / 2 + 4);
  x.font = '30px sans-serif';
  x.fillStyle = 'rgba(255,255,255,0.28)';
  x.fillText('NO\u00B7LIMIT', S / 2, S / 2 + 56);
  Tex._cache[key] = toTex(c, 8);
  return Tex._cache[key];
};

/* 筹码面(顶面) color: hex */
Tex.chipTop = function (color) {
  var key = 'ct' + color;
  if (Tex._cache[key]) return Tex._cache[key];
  var S = 128;
  var c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = color;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.fill();
  // 边缘白块
  x.fillStyle = '#f4f2ec';
  for (var i = 0; i < 8; i++) {
    var a0 = i * Math.PI / 4 - 0.16, a1 = i * Math.PI / 4 + 0.16;
    x.beginPath();
    x.moveTo(S / 2, S / 2);
    x.arc(S / 2, S / 2, S / 2, a0, a1);
    x.closePath(); x.fill();
  }
  x.fillStyle = color;
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 5;
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 3;
  x.beginPath(); x.arc(S / 2, S / 2, S * 0.30, 0, Math.PI * 2); x.stroke();
  Tex._cache[key] = toTex(c);
  return Tex._cache[key];
};

/* 筹码侧面条纹 */
Tex.chipSide = function (color) {
  var key = 'cs' + color;
  if (Tex._cache[key]) return Tex._cache[key];
  var W = 256, H = 32;
  var c = canvas(W, H), x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, W, H);
  x.fillStyle = '#f4f2ec';
  for (var i = 0; i < 8; i++) x.fillRect(i * 32 + 10, 0, 12, H);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, H - 4, W, 4);
  x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, 0, W, 3);
  var t = toTex(c);
  t.wrapS = THREE.RepeatWrapping;
  Tex._cache[key] = t;
  return t;
};

/* 鱿鱼守卫面具: shape 'circle'|'triangle'|'square' */
Tex.mask = function (shape) {
  var key = 'mk' + shape;
  if (Tex._cache[key]) return Tex._cache[key];
  var S = 256;
  var c = canvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#14141c';
  x.beginPath(); x.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#f4f2ec';
  x.lineWidth = 10;
  x.lineJoin = 'round';
  var m = S * 0.26;
  x.beginPath();
  if (shape === 'circle') x.arc(S / 2, S / 2, m, 0, Math.PI * 2);
  else if (shape === 'square') x.rect(S / 2 - m, S / 2 - m, m * 2, m * 2);
  else { x.moveTo(S / 2, S / 2 - m); x.lineTo(S / 2 + m, S / 2 + m); x.lineTo(S / 2 - m, S / 2 + m); x.closePath(); }
  x.stroke();
  Tex._cache[key] = toTex(c);
  return Tex._cache[key];
};

/* 圆形文字贴图(庄家钮 D / 数字等) */
Tex.label = function (text, fg, bg, size) {
  var key = 'lb' + text + fg + bg + size;
  if (Tex._cache[key]) return Tex._cache[key];
  var S = size || 128;
  var c = canvas(S, S), x = c.getContext('2d');
  if (bg) {
    x.fillStyle = bg;
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = fg || '#222';
  x.font = 'bold ' + Math.floor(S * 0.5) + 'px sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, S / 2, S / 2 + 2);
  Tex._cache[key] = toTex(c);
  return Tex._cache[key];
};

Tex.roundRect = roundRect;
})();
