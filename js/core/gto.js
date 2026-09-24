/* ================= GTO 翻前范围表 =================
 * 离线算好的简化 GTO 开牌范围 (数据固化, 无浏览器实时求解)。
 * 覆盖: 翻前未加注底池 (RFI) 按位置给 169 个起手牌类标 加注/弃牌。
 * 翻后不覆盖 —— 继续用胜率 + 底池赔率 (浏览器内跑 CFR 不现实)。
 *==================================================*/
(function () {
  'use strict';
  var PK = (typeof window !== 'undefined') ? (window.PK = window.PK || {}) : (global.PK = global.PK || {});

  /* 13x13 矩阵: 行=高牌(A..2), 上三角=同花, 下三角=不同花, 对角=口袋对 */
  var OPEN = {
    EP: ['55+', 'A9s+', 'A5s', 'KTs+', 'QJs', 'JTs', 'T9s', 'AJo+', 'KQo'],
    MP: ['22+', 'A7s+', 'A5s', 'K9s+', 'Q9s+', 'J9s+', 'T9s', '98s', '87s', '76s', 'ATo+', 'KJo+'],
    CO: ['22+', 'A2s+', 'K9s+', 'Q9s+', 'J9s+', 'T9s', '98s', '87s', '76s', 'A9o+', 'KTo+', 'QTo+', 'JTo'],
    BTN: ['22+', 'A2s+', 'K2s+', 'Q4s+', 'J6s+', 'T6s+', '96s+', '86s+', '76s', '65s', '54s', 'A7o+', 'K9o+', 'QTo+', 'JTo'],
    SB: ['22+', 'A2s+', 'K5s+', 'Q5s+', 'J7s+', 'T7s+', '96s+', '86s+', '76s', '65s', '54s', 'A7o+', 'K9o+', 'Q9o+', 'J9o+', 'T9o']
  };

  /* 混合策略(简化 GTO): 范围边界牌的部分加注频率 0~1 (solver 输出的近似)。
   * 只放 OPEN 之外的牌; freq() 里 OPEN 内的牌恒为 1 */
  var MIXED = {
    EP:  { 'ATo': 0.5, 'A8s': 0.3, 'QTs': 0.45, 'J9s': 0.35, 'K9s': 0.35, 'T8s': 0.3, 'A9o': 0.3, 'KJo': 0.4 },
    MP:  { 'A6s': 0.5, 'K8s': 0.45, 'Q8s': 0.4, 'J8s': 0.4, '97s': 0.3, 'A9o': 0.45, 'QJo': 0.4, 'JTo': 0.35, 'KTo': 0.4, 'T9o': 0.3 },
    CO:  { 'K8s': 0.55, 'Q8s': 0.45, 'J8s': 0.45, 'T8s': 0.4, '97s': 0.35, '65s': 0.4, '54s': 0.35, 'A8o': 0.5, 'K9o': 0.4, 'Q9o': 0.35, 'J9o': 0.35, 'T9o': 0.3 },
    BTN: { 'Q3s': 0.4, 'Q2s': 0.3, 'J5s': 0.45, 'J4s': 0.35, 'T5s': 0.45, 'T4s': 0.3, '95s': 0.35, '85s': 0.35, '75s': 0.3, '64s': 0.3, 'A6o': 0.5, 'A5o': 0.45, 'A4o': 0.35, 'K8o': 0.35, 'Q9o': 0.4, 'J9o': 0.35, 'T9o': 0.3, '98o': 0.25 },
    SB:  { 'K4s': 0.5, 'K3s': 0.4, 'K2s': 0.35, 'Q4s': 0.4, 'Q3s': 0.3, 'J6s': 0.5, 'J5s': 0.4, 'J4s': 0.35, 'T6s': 0.45, 'T5s': 0.35, '95s': 0.4, '85s': 0.35, '75s': 0.3, '64s': 0.3, 'A6o': 0.45, 'A5o': 0.4, 'A4o': 0.35, 'A3o': 0.3, 'K8o': 0.3, 'Q8o': 0.3, 'J8o': 0.3, 'T8o': 0.25, '98o': 0.25 }
  };

  var CHAR2RANK = { A: 14, K: 13, Q: 12, J: 11, T: 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
  /* 手牌类标签: 10 用 'T' (标准记法), 与范围串一致 — 不能用 RANK_NAME ('10') */
  var RANK_CHAR = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T', 9: '9', 8: '8', 7: '7', 6: '6', 5: '5', 4: '4', 3: '3', 2: '2' };

  /* 范围串 -> 手牌类集合 ('AA' / 'KQs' / 'KQo') */
  function parseRange(str) {
    var set = {};
    String(str).split(',').forEach(function (tok) {
      tok = tok.trim();
      if (!tok) return;
      var plus = /\+$/.test(tok);
      if (plus) tok = tok.slice(0, -1);
      var suited = /s$/.test(tok), offsuit = /o$/.test(tok);
      var r1 = CHAR2RANK[tok[0]], r2 = CHAR2RANK[tok[1]];
      if (!r1 || !r2) return;
      if (r1 === r2) { /* 口袋对: '55+' = 55..AA */
        for (var r = r1; r <= 14; r++) set[RANK_CHAR[r] + RANK_CHAR[r]] = true;
      } else if (r1 > r2) {
        addHighLow(set, r1, r2, plus, suited);
      } else {
        addHighLow(set, r2, r1, plus, suited);
      }
    });
    return set;
  }

  /* 高牌 fixed, 低牌从 lo 往上加到 hi-1 ('K9s+' = K9s..KQs) */
  function addHighLow(set, hi, lo, plus, suited) {
    var suffix = suited ? 's' : 'o';
    var top = plus ? hi - 1 : lo;
    for (var l = lo; l <= top; l++) set[RANK_CHAR[hi] + RANK_CHAR[l] + suffix] = true;
  }

  /* 底牌 [c1,c2] -> 手牌类 */
  function handClass(hole) {
    if (!hole || hole.length < 2) return null;
    var r1 = hole[0] >> 2, r2 = hole[1] >> 2;
    var hi = Math.max(r1, r2), lo = Math.min(r1, r2);
    if (hi === lo) return RANK_CHAR[hi] + RANK_CHAR[lo];
    return RANK_CHAR[hi] + RANK_CHAR[lo] + ((hole[0] & 3) === (hole[1] & 3) ? 's' : 'o');
  }

  /* RFI 范围表: { EP: Set, MP: Set, ... } (惰性缓存) */
  var _cache = null;
  function tables() {
    if (!_cache) {
      _cache = {};
      ['EP', 'MP', 'CO', 'BTN', 'SB'].forEach(function (pos) { _cache[pos] = parseRange(OPEN[pos]); });
    }
    return _cache;
  }

  /* 加注频率 0~1: OPEN 内 = 1, 混合表 = 频率, 其余 = 0 */
  function freq(pos, cls) {
    if (!cls) return 0;
    var t = tables()[pos];
    if (t && t[cls]) return 1;
    var m = MIXED[pos];
    return (m && m[cls]) || 0;
  }

  /* 玩家位置: dealerIdx 起步序 0=BTN 1=SB 2=BB, 末位=CO 次末=MP 其余=EP */
  function positionOf(engine, playerId) {
    var n = engine.players.length;
    var dealt = [], idx = engine.dealerIdx % n;
    for (var k = 0; k < n; k++) {
      var q = engine.players[idx];
      if (q.dealt && !q.out) dealt.push(q.id);
      idx = (idx + 1) % n;
    }
    var m = dealt.length;
    if (m === 0) return null;
    var off = dealt.indexOf(playerId);
    if (off < 0) return null;
    if (m === 2) return off === 0 ? 'BTN' : 'BB'; /* 单挑: 庄=BTN/SB */
    if (m === 3) return ['BTN', 'SB', 'BB'][off];
    if (off === 0) return 'BTN';
    if (off === 1) return 'SB';
    if (off === 2) return 'BB';
    if (off === m - 1) return 'CO';
    if (off === m - 2) return 'MP';
    return 'EP';
  }

  /* 翻前建议: 未加注底池 -> { cls, pos, act: 'raise'|'fold'|'check' } | null
   * BB 未加注时免费过牌 (act 'check'); 面对 3bet/加注不覆盖 */
  function advice(engine, playerId) {
    if (!engine || engine.street !== 0) return null;
    var hero = engine.players[playerId];
    if (!hero || !hero.dealt || hero.folded) return null;
    if (engine.currentBet > engine.bb) return null;
    var pos = positionOf(engine, playerId);
    if (!pos) return null;
    var cls = handClass(hero.hole);
    if (!cls) return null;
    if (pos === 'BB') return { cls: cls, pos: 'BB', act: 'check', freq: 0 };
    var f = freq(pos, cls);
    return { cls: cls, pos: pos, act: f >= 0.5 ? 'raise' : 'fold', freq: f };
  }

  PK.GTO = {
    handClass: handClass,
    parseRange: parseRange,
    tables: tables,
    freq: freq,
    positionOf: positionOf,
    advice: advice
  };
})();
