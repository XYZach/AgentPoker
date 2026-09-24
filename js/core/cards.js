/* 牌基础工具 + 7张牌力评估器 + Chen 起手牌公式
 * 卡牌编码: card = (rank << 2) | suit, rank 2..14, suit 0..3 (♠♥♦♣)
 * 评估分值: (类别 << 20) | r1<<16 | r2<<12 | r3<<8 | r4<<4 | r5, 数值越大越强
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? (window.PK = window.PK || {}) : (global.PK = global.PK || {});

PK.SUIT_CHARS = ['\u2660', '\u2665', '\u2666', '\u2663']; // ♠ ♥ ♦ ♣
PK.SUIT_NAMES = ['黑桃', '红桃', '方块', '梅花'];
PK.RANK_NAME = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
PK.CAT_NAMES = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];

PK.cardRank = function (c) { return c >> 2; };
PK.cardSuit = function (c) { return c & 3; };
PK.cardName = function (c) { return PK.RANK_NAME[c >> 2] + PK.SUIT_CHARS[c & 3]; };
PK.catName = function (cat) { return (typeof PK.t === 'function') ? PK.t(PK.CAT_NAMES[cat]) : PK.CAT_NAMES[cat]; };
PK.cardsName = function (cs) { return cs.map(PK.cardName).join(' '); };

PK.makeDeck = function () {
  var d = [];
  for (var r = 2; r <= 14; r++) for (var s = 0; s < 4; s++) d.push((r << 2) | s);
  return d;
};

/* 可复现随机数(测试用) */
PK.mulberry32 = function (seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
PK.rng = Math.random;

PK.shuffle = function (arr, rng) {
  rng = rng || Math.random;
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
};

/* ---------- 7 张评估(热路径,复用类型化数组) ---------- */
var _rc = new Uint8Array(16), _sc = new Uint8Array(4), _sm = new Int32Array(4);

function straightHigh(m) {
  for (var hi = 14; hi >= 5; hi--) {
    var need = (1 << hi) | (1 << (hi - 1)) | (1 << (hi - 2)) | (1 << (hi - 3)) | (1 << (hi - 4));
    if ((m & need) === need) return hi;
  }
  return 0;
}

/* 返回整数分值; cards 为牌编码数组, n 张(5..7) */
PK.evalScore = function (cards, n) {
  if (!n) n = cards.length;
  var rc = _rc, sc = _sc, sm = _sm;
  rc.fill(0); sc[0] = sc[1] = sc[2] = sc[3] = 0; sm[0] = sm[1] = sm[2] = sm[3] = 0;
  var allm = 0, i, c, r, s;
  for (i = 0; i < n; i++) {
    c = cards[i]; r = c >> 2; s = c & 3;
    rc[r]++; sc[s]++; sm[s] |= 1 << r; allm |= 1 << r;
  }
  var fs = -1;
  for (s = 0; s < 4; s++) if (sc[s] >= 5) fs = s;
  if (fs >= 0) {
    var fm = sm[fs];
    if (fm & (1 << 14)) fm |= (1 << 1); // A 作 1 组成 A-5
    var sfh = straightHigh(fm);
    if (sfh) return (8 << 20) | (sfh << 16); // 同花顺
  }
  var quad = 0, trips = [], pairs = [];
  for (r = 14; r >= 2; r--) {
    var cnt = rc[r];
    if (cnt === 4) quad = r;
    else if (cnt === 3) trips.push(r);
    else if (cnt === 2) pairs.push(r);
  }
  if (quad) {
    var k4 = 0;
    for (r = 14; r >= 2; r--) if (rc[r] > 0 && r !== quad) { k4 = r; break; }
    return (7 << 20) | (quad << 16) | (k4 << 12);
  }
  if (trips.length >= 2) return (6 << 20) | (trips[0] << 16) | (trips[1] << 12);
  if (trips.length === 1 && pairs.length >= 1) return (6 << 20) | (trips[0] << 16) | (pairs[0] << 12);
  if (fs >= 0) {
    var sc5 = (5 << 20), got = 0;
    for (r = 14; r >= 2 && got < 5; r--) if (sm[fs] & (1 << r)) { sc5 |= r << (16 - 4 * got); got++; }
    return sc5;
  }
  var am = allm | ((allm & (1 << 14)) ? (1 << 1) : 0);
  var sh = straightHigh(am);
  if (sh) return (4 << 20) | (sh << 16);
  if (trips.length === 1) {
    var ks = [];
    for (r = 14; r >= 2 && ks.length < 2; r--) if (rc[r] > 0 && r !== trips[0]) ks.push(r);
    return (3 << 20) | (trips[0] << 16) | (ks[0] << 12) | (ks[1] << 8);
  }
  if (pairs.length >= 2) {
    var k2 = 0;
    for (r = 14; r >= 2; r--) if (rc[r] > 0 && r !== pairs[0] && r !== pairs[1]) { k2 = r; break; }
    return (2 << 20) | (pairs[0] << 16) | (pairs[1] << 12) | (k2 << 8);
  }
  if (pairs.length === 1) {
    var kp = [];
    for (r = 14; r >= 2 && kp.length < 3; r--) if (rc[r] > 0 && r !== pairs[0]) kp.push(r);
    return (1 << 20) | (pairs[0] << 16) | (kp[0] << 12) | (kp[1] << 8) | (kp[2] << 4);
  }
  var hi5 = [];
  for (r = 14; r >= 2 && hi5.length < 5; r--) if (rc[r] > 0) hi5.push(r);
  return (hi5[0] << 16) | (hi5[1] << 12) | (hi5[2] << 8) | (hi5[3] << 4) | hi5[4];
};

/* 评估并返回最优 5 张明细(摊牌高亮用) */
PK.evalDetailed = function (cards, n) {
  if (!n) n = cards.length;
  var score = PK.evalScore(cards, n);
  var cat = (score >> 20) & 0xf;
  var ranks5 = [];
  for (var k = 0; k < 5; k++) ranks5.push((score >> (16 - 4 * k)) & 0xf);
  var need = {}, i;
  if (cat === 8 || cat === 4) { // 顺子类: 取高牌向下的连续 5 个 rank(含 A-5)
    var top = ranks5[0], suit = -1;
    if (cat === 8) for (var s2 = 0; s2 < 4; s2++) { /* 找出同花 suit */ }
    var set = {};
    for (var rr = top; rr >= top - 4; rr--) set[rr === 0 ? 1 : rr] = true; // top=5 时 rr 走到 1
    var picks = [];
    if (cat === 8) {
      // 找同花 suit
      var cnt = [0, 0, 0, 0];
      for (i = 0; i < n; i++) cnt[cards[i] & 3]++;
      for (var s3 = 0; s3 < 4; s3++) if (cnt[s3] >= 5) suit = s3;
      for (i = 0; i < n && picks.length < 5; i++) {
        var cd = cards[i], rk = cd >> 2;
        var eq = (rk === 14 && top === 5) ? 1 : rk;
        if ((cd & 3) === suit && set[eq] && !picks.some(function (p) { return (p >> 2) === eq; })) picks.push(cd);
      }
    } else {
      for (i = 0; i < n && picks.length < 5; i++) {
        var cd2 = cards[i], rk2 = cd2 >> 2;
        var eq2 = (rk2 === 14 && top === 5) ? 1 : rk2;
        if (set[eq2] && !picks.some(function (p) { return ((p >> 2) === 14 ? 1 : (p >> 2)) === eq2; })) picks.push(cd2);
      }
    }
    return { score: score, cat: cat, catName: PK.catName(cat), best5: picks };
  }
  if (cat === 7) { need[ranks5[0]] = 4; need[ranks5[1]] = -1; }
  else if (cat === 6) { need[ranks5[0]] = 3; need[ranks5[1]] = -2; }
  else if (cat === 5) { for (i = 0; i < 5; i++) need[ranks5[i]] = 'F'; }
  else if (cat === 3) { need[ranks5[0]] = 3; need[ranks5[1]] = -1; need[ranks5[2]] = -1; }
  else if (cat === 2) { need[ranks5[0]] = 2; need[ranks5[1]] = 2; need[ranks5[2]] = -1; }
  else if (cat === 1) { need[ranks5[0]] = 2; need[ranks5[1]] = -1; need[ranks5[2]] = -1; need[ranks5[3]] = -1; }
  else { for (i = 0; i < 5; i++) need[ranks5[i]] = 1; }
  var picks2 = [];
  // 先挑指定 rank 数量的
  var order = [ranks5[0], ranks5[1], ranks5[2], ranks5[3], ranks5[4]];
  for (i = 0; i < order.length && picks2.length < 5; i++) {
    var want = order[i];
    if (want === 0 || want === undefined) continue;
    if (need[want] === 'F') {
      // 同花:该 rank 的牌必须属于同花 suit
      var cnt2 = [0, 0, 0, 0];
      for (var j = 0; j < n; j++) cnt2[cards[j] & 3]++;
      var fs2 = 0; for (var s4 = 0; s4 < 4; s4++) if (cnt2[s4] >= 5) fs2 = s4;
      for (var j2 = 0; j2 < n && picks2.length < 5; j2++) if (cards[j2] >> 2 === want && (cards[j2] & 3) === fs2) picks2.push(cards[j2]);
    } else if (need[want] > 0) {
      var got = 0;
      for (var j3 = 0; j3 < n && got < need[want]; j3++) if (cards[j3] >> 2 === want) { picks2.push(cards[j3]); got++; }
    }
  }
  // 再补负数标记的单张 kicker
  for (i = 0; i < order.length && picks2.length < 5; i++) {
    if (order[i] === 0 || order[i] === undefined) continue;
    if (need[order[i]] < 0) {
      for (var j4 = 0; j4 < n; j4++) {
        if (cards[j4] >> 2 === order[i] && !picks2.includes(cards[j4])) { picks2.push(cards[j4]); break; }
      }
    }
  }
  if (picks2.length !== 5) { // 兜底:任意 5 张
    picks2 = cards.slice(0, 5);
  }
  return { score: score, cat: cat, catName: PK.catName(cat), best5: picks2 };
};

/* 手牌+公共牌的当前成牌标签(玩家状态提示); A 高同花顺显示为皇家同花顺 */
PK.madeLabel = function (cards) {
  if (!cards || cards.length < 2) return null;
  var det = PK.evalDetailed(cards);
  var royal = det.cat === 8 && ((det.score >> 16) & 0xf) === 14;
  return royal ? '皇家同花顺' : PK.CAT_NAMES[det.cat];
};

/* ---------- Chen 起手牌公式(AI 翻牌前用) ---------- */
PK.chen = function (c1, c2) {
  var r1 = Math.max(c1 >> 2, c2 >> 2), r2 = Math.min(c1 >> 2, c2 >> 2);
  var suited = (c1 & 3) === (c2 & 3);
  var pts;
  if (r1 === r2) {
    pts = r1 === 14 ? 20 : Math.max(5, (r1 === 13 ? 8 : r1 === 12 ? 7 : r1 === 11 ? 6 : r1 / 2) * 2);
  } else {
    pts = r1 === 14 ? 10 : r1 === 13 ? 8 : r1 === 12 ? 7 : r1 === 11 ? 6 : r1 / 2;
    if (suited) pts += 2;
    var gap = r1 - r2 - 1;
    pts -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && r1 < 12) pts += 1;
  }
  return Math.max(0, Math.ceil(pts * 2) / 2);
};

/* Chen 分映射为 0..1 质量(AI 用) */
PK.chenQ = function (c1, c2) {
  var c = PK.chen(c1, c2);
  var q = (c + 1) / 21;
  return q > 1 ? 1 : q < 0 ? 0 : q;
};

/* 常态分布随机数(Box-Muller) */
PK.gauss = function (rng) {
  rng = rng || Math.random;
  var u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

PK.fmt = function (n) { return (n | 0).toLocaleString('en-US'); };
})();
