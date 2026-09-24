/* 蒙特卡洛胜率: 单手 vs N 个随机对手 / 多手全亮 runout 摊牌概率
 * 已知牌(手牌/公共牌/弃牌死牌)从牌池剔除, 不偷看引擎牌堆。
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : global.PK;

var Equity = PK.Equity = {};

/* hero2: [c,c]; board: 已亮公共牌; nOpp: 对手数; dead: 已知死牌; iters */
Equity.simulate = function (hero2, board, nOpp, dead, iters, rng) {
  rng = rng || Math.random;
  var known = hero2.slice(), i;
  if (board) for (i = 0; i < board.length; i++) known.push(board[i]);
  if (dead) for (i = 0; i < dead.length; i++) known.push(dead[i]);
  var pool = PK.makeDeck();
  var poolLen = pool.length;
  // 从池中剔除已知牌
  var kset = {};
  for (i = 0; i < known.length; i++) kset[known[i]] = 1;
  var avail = [];
  for (i = 0; i < poolLen; i++) if (!kset[pool[i]]) avail.push(pool[i]);
  var A = avail.length;

  var needBoard = 5 - (board ? board.length : 0);
  var need = needBoard + nOpp * 2;
  if (need > A) need = A;

  var cards7 = new Array(7), win = 0, tie = 0, done = 0;
  var heroScore, oppScore, best, tieFlag;

  for (var it = 0; it < iters; it++) {
    // 部分洗牌: 前 need 张随机
    for (var d = 0; d < need; d++) {
      var j = d + Math.floor(rng() * (A - d));
      var t = avail[d]; avail[d] = avail[j]; avail[j] = t;
    }
    var idx = 0;
    cards7[0] = hero2[0]; cards7[1] = hero2[1];
    for (var b = 0; b < needBoard; b++) cards7[2 + b] = avail[idx++];
    heroScore = PK.evalScore(cards7, 2 + needBoard);
    best = heroScore; tieFlag = false;
    for (var o = 0; o < nOpp; o++) {
      cards7[0] = avail[idx++]; cards7[1] = avail[idx++];
      for (var b2 = 0; b2 < needBoard; b2++) cards7[2 + b2] = avail[b2];
      oppScore = PK.evalScore(cards7, 2 + needBoard);
      if (oppScore > best) { best = oppScore; tieFlag = false; }
      else if (oppScore === best) tieFlag = true;
    }
    if (best === heroScore) { if (tieFlag) tie++; else win++; }
    done++;
  }
  return { win: win / done, tie: tie / done, lose: 1 - (win + tie) / done, iters: done };
};

/* 多手全亮(全下 runout): hands = [[c,c],...]; 返回每手 win/tie */
Equity.multi = function (hands, board, iters, rng) {
  rng = rng || Math.random;
  var known = [], i, j;
  for (i = 0; i < hands.length; i++) known.push(hands[i][0], hands[i][1]);
  if (board) for (i = 0; i < board.length; i++) known.push(board[i]);
  var kset = {};
  for (i = 0; i < known.length; i++) kset[known[i]] = 1;
  var pool = PK.makeDeck(), avail = [];
  for (i = 0; i < pool.length; i++) if (!kset[pool[i]]) avail.push(pool[i]);
  var A = avail.length;
  var needBoard = 5 - (board ? board.length : 0);
  var nb = board ? board.length : 0;
  var n = hands.length;
  var res = []; for (i = 0; i < n; i++) res.push({ win: 0, tie: 0 });
  var cards7 = new Array(7);
  var scores = new Array(n);

  for (var it = 0; it < iters; it++) {
    for (var d = 0; d < needBoard; d++) {
      var jj = d + Math.floor(rng() * (A - d));
      var t = avail[d]; avail[d] = avail[jj]; avail[jj] = t;
    }
    for (var h = 0; h < n; h++) {
      cards7[0] = hands[h][0]; cards7[1] = hands[h][1];
      for (var kb = 0; kb < nb; kb++) cards7[2 + kb] = board[kb];
      for (var b = 0; b < needBoard; b++) cards7[2 + nb + b] = avail[b];
      scores[h] = PK.evalScore(cards7, 7);
    }
    var best = -1, cnt = 0;
    for (var h2 = 0; h2 < n; h2++) { if (scores[h2] > best) { best = scores[h2]; cnt = 1; } else if (scores[h2] === best) cnt++; }
    for (var h3 = 0; h3 < n; h3++) {
      if (scores[h3] === best) { if (cnt > 1) res[h3].tie++; else res[h3].win++; }
    }
  }
  for (i = 0; i < n; i++) { res[i].win /= iters; res[i].tie /= iters; }
  return res;
};

/* 异步分块模拟(避免阻塞渲染): 返回 Promise, onDone(result) */
Equity.runAsync = function (params, onDone) {
  var hero2 = params.hero2, board = params.board || [], nOpp = params.nOpp || 1, dead = params.dead || [];
  var totalIters = params.iters || 2000, chunk = params.chunk || 250;
  var rng = params.rng || Math.random;
  var win = 0, tie = 0, done = 0, cancelled = false;

  // 复用 simulate 的池逻辑但分块: 简单起见每块调用 simulate 累加
  function step() {
    if (cancelled) return;
    var r = Equity.simulate(hero2, board, nOpp, dead, chunk, rng);
    win += r.win * r.iters; tie += r.tie * r.iters; done += r.iters;
    if (done < totalIters) {
      if (typeof window !== 'undefined' && window.requestAnimationFrame) window.requestAnimationFrame(step);
      else setTimeout(step, 0);
    } else {
      var res = { win: win / done, tie: tie / done, lose: 1 - (win + tie) / done, iters: done };
      if (onDone) onDone(res);
    }
  }
  step();
  return { cancel: function () { cancelled = true; } };
};
})();
