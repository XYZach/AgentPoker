/* 德州扑克引擎: 无限注 Hold'em 状态机
 * 模式: cash 现金局 / tourney 锦标赛 / squid 鱿鱼场(淘汰时钟+赏金+强制摊牌)
 * 事件驱动: 每个方法返回事件数组, 由主控制器消费并播放动画。
 * 牌堆(engine.deck)是隐藏信息, 渲染层与 AI 不得读取。
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : global.PK;

var LEVELS = [
  [10, 20, 0], [15, 30, 0], [25, 50, 0], [50, 100, 10], [75, 150, 15],
  [100, 200, 20], [150, 300, 30], [200, 400, 40], [300, 600, 75],
  [500, 1000, 100], [750, 1500, 150], [1000, 2000, 200]
];

function Engine(cfg, rng) {
  this.cfg = cfg;
  this.rng = rng || PK.rng;
  this.players = [];
  for (var i = 0; i < cfg.roster.length; i++) {
    var r = cfg.roster[i];
    this.players.push({
      id: i, seat: i, name: r.name, isHuman: !!r.isHuman, styleKey: r.styleKey || 'BAL',
      color: r.color, stack: cfg.startStack, hole: [],
      dealt: false, folded: false, allIn: false, hasActed: false, actedBetMark: -1,
      bet: 0, contributed: 0, startStack: cfg.startStack,
      out: false, sittingOut: false, place: 0, bounty: 0, rebuys: 0, totalBuyin: cfg.startStack,
      stats: { hands: 0, vpip: 0, raises: 0, handsWon: 0, biggestPot: 0 }
    });
  }
  this.dealerIdx = this.players.length - 1;
  this.handNo = 0;
  this.level = 0;
  this.sb = cfg.cash ? cfg.cash.sb : LEVELS[0][0];
  this.bb = cfg.cash ? cfg.cash.bb : LEVELS[0][1];
  this.ante = cfg.cash ? 0 : LEVELS[0][2];
  this.handsSinceDeadline = 0;
  this.piggyTotal = 0;
  this.over = false;
  this.phase = 'idle';
  this.awaiting = null;
  this.events = [];
  this.board = [];
  this.deck = null;
  this.street = 0;
  this.currentBet = 0;
  this.minRaise = 0;
  this.fullRaiseMark = 0;
  this.pendingRunout = false;
  this.revealed = false;
  this.forced = false;
  this.lastHandResult = null;
}
PK.Engine = Engine;

Engine.prototype.emit = function (ev) { this.events.push(ev); };

Engine.prototype.alive = function () { return this.players.filter(function (p) { return !p.out; }); };
Engine.prototype.handActive = function () { return this.players.filter(function (p) { return p.dealt && !p.folded; }); };
Engine.prototype.canActPlayers = function () {
  return this.players.filter(function (p) { return p.dealt && !p.folded && !p.allIn; });
};
Engine.prototype.potTotal = function () {
  var t = 0;
  for (var i = 0; i < this.players.length; i++) t += this.players[i].contributed;
  return t;
};
Engine.prototype.eligibleCount = function () {
  return this.players.filter(function (p) { return !p.out && !p.sittingOut && p.stack > 0; }).length;
};
Engine.prototype.handsUntilDeadline = function () {
  if (this.cfg.mode !== 'squid') return Infinity;
  return Math.max(0, this.cfg.squid.deadlineHands - this.handsSinceDeadline);
};

Engine.prototype.nextDealt = function (fromIdx) {
  var n = this.players.length;
  for (var k = 1; k <= n; k++) {
    var p = this.players[(fromIdx + k) % n];
    if (p.dealt) return (fromIdx + k) % n;
  }
  return -1;
};

Engine.prototype._post = function (p, amount, kind) {
  amount = Math.min(amount, p.stack);
  p.stack -= amount;
  p.bet += amount;
  p.contributed += amount;
  if (p.stack === 0) p.allIn = true;
  this.emit({ type: 'post', playerId: p.id, amount: amount, kind: kind, allIn: p.allIn });
};

Engine.prototype.startHand = function () {
  this.events = [];
  var cfg = this.cfg, i, p;
  this.handNo++;
  this.lastHandResult = null;

  // 级别/盲注
  if (cfg.mode !== 'cash') {
    var lv = Math.min(Math.floor((this.handNo - 1) / cfg.tourney.handsPerLevel), LEVELS.length - 1);
    if (lv !== this.level || this.handNo === 1) {
      this.level = lv;
      this.sb = LEVELS[lv][0]; this.bb = LEVELS[lv][1]; this.ante = LEVELS[lv][2];
      if (this.handNo > 1) this.emit({ type: 'levelUp', level: lv + 1, sb: this.sb, bb: this.bb, ante: this.ante });
    }
  }

  // 重置手内状态
  for (i = 0; i < this.players.length; i++) {
    p = this.players[i];
    p.dealt = !p.out && !p.sittingOut && p.stack > 0;
    p.folded = false; p.allIn = false; p.hasActed = false; p.actedBetMark = -1;
    p.bet = 0; p.contributed = 0; p.hole = [];
    p.startStack = p.stack;
    if (p.dealt) p.stats.hands++;
  }

  // 庄家轮转
  this.dealerIdx = this.nextDealt(this.dealerIdx);

  var dealtCount = this.players.filter(function (q) { return q.dealt; }).length;

  // 鱿鱼: 是否为强制摊牌手(时钟最后一手)
  this.forced = false;
  if (cfg.mode === 'squid' && cfg.squid.forcedShowdown && dealtCount > 2 &&
      this.handsSinceDeadline === cfg.squid.deadlineHands - 1) {
    this.forced = true;
  }

  this.emit({
    type: 'handStart', handNo: this.handNo, dealerId: this.players[this.dealerIdx].id,
    sb: this.sb, bb: this.bb, ante: this.ante, level: this.level + 1,
    forced: this.forced, handsUntilDeadline: this.handsUntilDeadline(),
    mode: cfg.mode, dealtCount: dealtCount
  });

  // 前注
  if (this.ante > 0 && !this.forced) {
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (p.dealt && p.stack > 0) this._post(p, this.ante, 'ante');
    }
  }

  // 盲注(单挑特殊规则)
  var sbIdx, bbIdx;
  if (dealtCount === 2) {
    sbIdx = this.dealerIdx;
    bbIdx = this.nextDealt(sbIdx);
  } else {
    sbIdx = this.nextDealt(this.dealerIdx);
    bbIdx = this.nextDealt(sbIdx);
  }
  this._post(this.players[sbIdx], this.sb, 'sb');
  this._post(this.players[bbIdx], this.bb, 'bb');

  this.currentBet = this.bb;
  this.minRaise = this.bb;
  this.fullRaiseMark = this.bb;
  this.street = 0;
  this.board = [];
  this.pendingRunout = false;
  this.revealed = false;
  this.phase = 'betting';

  // 发牌(用抽牌指针, 公共牌也从同一指针继续)
  this.deck = PK.shuffle(PK.makeDeck(), this.rng);
  this.deckIdx = 0;
  for (var round = 0; round < 2; round++) {
    var idx = this.nextDealt(this.dealerIdx + this.players.length - 1); // 从庄家下一位开始
    for (var k = 0; k < dealtCount; k++) {
      var pl = this.players[idx];
      var card = this.deck[this.deckIdx++];
      pl.hole.push(card);
      this.emit({ type: 'dealHole', playerId: pl.id, card: card, faceUp: pl.isHuman, round: round });
      idx = this.nextDealt(idx);
    }
  }

  if (this.forced) {
    // 鱿鱼强制摊牌: 全部推入
    for (i = 0; i < this.players.length; i++) {
      p = this.players[i];
      if (p.dealt && p.stack > 0) this._post(p, p.stack, 'allin');
    }
    this.currentBet = 0;
    for (i = 0; i < this.players.length; i++) if (this.players[i].bet > this.currentBet) this.currentBet = this.players[i].bet;
    this.awaiting = null;
    this.pendingRunout = true;
    this.emit({ type: 'forcedStart' });
  } else {
    var firstIdx = dealtCount === 2 ? sbIdx : this.nextDealt(bbIdx);
    this.awaiting = this.players[firstIdx];
  }
  return this.events;
};

Engine.prototype.legalActions = function (p) {
  var toCall = Math.max(0, this.currentBet - p.bet);
  var maxTo = p.bet + p.stack;
  var canRaise = p.stack > toCall && (!p.hasActed || this.fullRaiseMark > p.actedBetMark || this.fullRaiseMark === 0);
  var minTo = this.currentBet === 0 ? Math.min(this.bb, maxTo) : Math.min(this.currentBet + this.minRaise, maxTo);
  return {
    toCall: toCall,
    canFold: true,
    canCheck: toCall <= 0,
    canCall: toCall > 0,
    callAmount: Math.min(toCall, p.stack),
    canBet: toCall <= 0 && p.stack > 0,
    canRaise: canRaise && toCall > 0,
    minTo: minTo,
    maxTo: maxTo,
    potTotal: this.potTotal(),
    potOdds: toCall > 0 ? toCall / (this.potTotal() + toCall) : 0,
    street: this.street,
    isRaise: this.currentBet > 0
  };
};

Engine.prototype._nextNeedingAction = function (afterIdx) {
  var n = this.players.length, cnt = 0, i, p;
  for (i = 1; i <= n; i++) {
    p = this.players[(afterIdx + i) % n];
    if (p.dealt && !p.folded && !p.allIn && (!p.hasActed || p.bet < this.currentBet)) return p;
    cnt++;
    if (cnt > n) break;
  }
  return null;
};

Engine.prototype.act = function (playerId, decision) {
  this.events = [];
  var p = this.players[playerId];
  var legal = this.legalActions(p);
  var type = decision.type, amount = decision.amount || 0;
  var self = this;

  if (type === 'check' && legal.toCall > 0) type = 'call';
  if (type === 'call' && legal.toCall <= 0) type = 'check';
  if ((type === 'bet' || type === 'raise') && !legal.canBet && !legal.canRaise) {
    type = legal.toCall > 0 ? 'call' : 'check';
  }
  if (type === 'allin') {
    if (legal.toCall >= p.stack) type = 'call';
    else if (legal.toCall <= 0) type = 'bet';
    else type = 'raise';
    amount = p.bet + p.stack;
  }
  if (type === 'fold') {
    p.folded = true;
    this.emit({ type: 'action', playerId: p.id, action: 'fold' });
    if (this.cfg.revealFolds) this.emit({ type: 'foldShow', playerId: p.id, cards: p.hole.slice() });
  } else if (type === 'check') {
    this.emit({ type: 'action', playerId: p.id, action: 'check' });
  } else if (type === 'call') {
    var callAmt = Math.min(legal.toCall, p.stack);
    this._post(p, callAmt, 'call');
    this.emit({ type: 'action', playerId: p.id, action: 'call', amount: callAmt, allIn: p.allIn });
  } else if (type === 'bet' || type === 'raise') {
    var isBet = this.currentBet === 0;
    var maxTo = p.bet + p.stack;
    var minTo = isBet ? Math.min(this.bb, maxTo) : Math.min(this.currentBet + this.minRaise, maxTo);
    // 全下允许低于最小加注额
    var to = decision.type === 'allin' ? maxTo : Math.max(minTo, Math.min(amount || minTo, maxTo));
    var delta = to - p.bet;
    this._post(p, delta, isBet ? 'bet' : 'raise');
    var raiseSize = to - this.currentBet;
    if (raiseSize >= this.minRaise || isBet) {
      this.minRaise = isBet ? to : Math.max(raiseSize, this.minRaise);
      this.fullRaiseMark = to;
      this.players.forEach(function (q) { if (q !== p) q.hasActed = false; });
    }
    if (to > this.currentBet) this.currentBet = to;
    this.emit({ type: 'action', playerId: p.id, action: isBet ? 'bet' : 'raise', amount: to, to: to, allIn: p.allIn });
  }

  p.hasActed = true;
  p.actedBetMark = this.currentBet;
  if (this.street === 0 && (type === 'call' || type === 'bet' || type === 'raise')) p.stats.vpip++;
  if (type === 'bet' || type === 'raise') p.stats.raises++;

  // 推进
  if (this.handActive().length === 1) {
    this._winByFold();
    return this.events;
  }
  var nxt = this._nextNeedingAction(p.id);
  if (nxt) {
    this.awaiting = nxt;
  } else {
    this.awaiting = null;
    if (this.canActPlayers().length <= 1 && this.handActive().length >= 2) this.pendingRunout = true;
  }
  return this.events;
};

/* 轮间推进: 翻公共牌 / runout / 摊牌 */
Engine.prototype.step = function () {
  this.events = [];
  if (this.phase === 'done') return this.events;
  if (this.handActive().length === 1) { this._winByFold(); return this.events; }

  if (this.pendingRunout) {
    if (!this.revealed) {
      this.revealed = true;
      var hands = this.handActive().map(function (p) { return { playerId: p.id, cards: p.hole.slice() }; });
      this.emit({ type: 'runoutReveal', players: hands });
      return this.events;
    }
    if (this.street < 3) { this._dealStreet(); return this.events; }
    this._showdown();
    return this.events;
  }

  if (this.street < 3) {
    this._dealStreet();
    // 重置下注轮
    this.players.forEach(function (q) { q.bet = 0; q.hasActed = false; q.actedBetMark = -1; });
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.fullRaiseMark = 0;
    if (this.canActPlayers().length <= 1 && this.handActive().length >= 2) {
      this.pendingRunout = true;
      return this.events;
    }
    var idx = this.nextDealt(this.dealerIdx);
    var n = this.players.length, tries = 0;
    while (tries < n) {
      var q = this.players[idx];
      if (q.dealt && !q.folded && !q.allIn) { this.awaiting = q; return this.events; }
      if (q.dealt && !q.folded && q.allIn) { /* 跳过 all-in */ }
      idx = this.nextDealt(idx);
      tries++;
    }
    this.pendingRunout = true;
    return this.events;
  }
  this._showdown();
  return this.events;
};

Engine.prototype._dealStreet = function () {
  this.street++;
  var cnt = this.street === 1 ? 3 : 1;
  var cards = [];
  for (var i = 0; i < cnt; i++) {
    var c = this.deck[this.deckIdx++];
    this.board.push(c);
    cards.push(c);
  }
  this.emit({ type: 'street', street: this.street, cards: cards, board: this.board.slice() });
};

Engine.prototype._winByFold = function () {
  var winner = this.handActive()[0];
  var amount = this.potTotal();
  winner.stack += amount;
  if (amount > winner.stats.biggestPot) winner.stats.biggestPot = amount;
  winner.stats.handsWon++;
  this.emit({ type: 'award', playerId: winner.id, amount: amount, uncontested: true });
  this._finishHand({ pots: [{ amount: amount, winners: [winner.id], contributors: this.players.filter(function (q) { return q.contributed > 0; }).map(function (q) { return q.id; }) }] });
  this.lastHandResult = { winners: [{ playerId: winner.id, amount: amount }], uncontested: true };
  this.emit({ type: 'handEnd', handNo: this.handNo, result: this.lastHandResult });
};

Engine.prototype._bustTargets = function () {
  // 本手中被清空的玩家(仍在局内、未离场)
  return this.players.filter(function (p) { return p.dealt && p.stack === 0 && !p.out && !p.sittingOut; });
};

Engine.prototype._showdown = function () {
  var self = this;
  var contenders = this.handActive();
  var evals = {};
  contenders.forEach(function (p) {
    var cs = p.hole.concat(self.board);
    evals[p.id] = PK.evalDetailed(cs, cs.length);
  });

  // 边池: 按贡献层级切分(弃牌者的钱也进池); 无资格赢家的层级(死钱)下沉到低层池
  var contributors = this.players.filter(function (p) { return p.contributed > 0; });
  var levels = [];
  contributors.forEach(function (p) { if (levels.indexOf(p.contributed) < 0) levels.push(p.contributed); });
  levels.sort(function (a, b) { return a - b; });
  var pots = [], prev = 0, deadCarry = 0;
  levels.forEach(function (L) {
    var amount = 0;
    contributors.forEach(function (p) { amount += Math.max(0, Math.min(p.contributed, L) - Math.min(p.contributed, prev)); });
    var eligible = contenders.filter(function (p) { return p.contributed >= L; }).map(function (p) { return p.id; });
    if (eligible.length === 0) {
      deadCarry += amount; // 只有弃牌者钱进的层级, 下沉
    } else {
      var amt = amount + deadCarry;
      deadCarry = 0;
      if (amt > 0) pots.push({ amount: amt, eligible: eligible, contributors: contributors.filter(function (p) { return p.contributed > prev; }).map(function (p) { return p.id; }), level: L });
    }
    prev = L;
  });
  if (deadCarry > 0 && pots.length) pots[pots.length - 1].amount += deadCarry;

  this.emit({
    type: 'reveal',
    players: contenders.map(function (p) {
      return { playerId: p.id, cards: p.hole.slice(), catName: evals[p.id].catName, best5: evals[p.id].best5.slice(), score: evals[p.id].score };
    })
  });

  var potResults = [];
  var resultWinners = {};
  pots.forEach(function (pot) {
    var best = -1, winners = [];
    pot.eligible.forEach(function (pid) {
      if (evals[pid].score > best) { best = evals[pid].score; winners = [pid]; }
      else if (evals[pid].score === best) winners.push(pid);
    });
    var share = Math.floor(pot.amount / winners.length);
    var rem = pot.amount - share * winners.length;
    var ordered = winners.slice().sort(function (a, b) { return a - b; });
    winners.forEach(function (pid) { resultWinners[pid] = (resultWinners[pid] || 0) + share; });
    if (rem > 0) resultWinners[ordered[0]] += rem;
    potResults.push({
      amount: pot.amount, winners: winners, share: share, rem: rem, ordered: ordered,
      contributors: pot.contributors,
      potIndex: potResults.length, hand: winners.map(function (pid) { return { playerId: pid, catName: evals[pid].catName, best5: evals[pid].best5.slice() }; })
    });
  });

  // 发放(含余数 chip)
  potResults.forEach(function (pot) {
    pot.winners.forEach(function (pid) { self.players[pid].stack += pot.share; });
    if (pot.rem > 0) self.players[pot.ordered[0]].stack += pot.rem;
  });
  Object.keys(resultWinners).forEach(function (pid) {
    var p = self.players[+pid];
    var amt = resultWinners[+pid];
    if (amt > p.stats.biggestPot) p.stats.biggestPot = amt;
    p.stats.handsWon++;
    self.emit({ type: 'award', playerId: p.id, amount: amt });
  });

  this.emit({ type: 'showdown', pots: potResults });
  this._finishHand({ pots: potResults });
  this.lastHandResult = {
    winners: Object.keys(resultWinners).map(function (pid) { return { playerId: +pid, amount: resultWinners[+pid] }; }),
    uncontested: false,
    hands: contenders.map(function (p) { return { playerId: p.id, catName: evals[p.id].catName }; })
  };
  this.emit({ type: 'handEnd', handNo: this.handNo, result: this.lastHandResult });
};

/* 收尾: 出局判定/赏金/鱿鱼时钟/结束检查 */
Engine.prototype._finishHand = function (info) {
  var self = this;
  var cfg = this.cfg;

  // 出局处理(按起手码数从小到大 = 名次更低)
  var busted = this._bustTargets().sort(function (a, b) { return a.startStack - b.startStack || a.id - b.id; });
  busted.forEach(function (v) {
    if (cfg.mode === 'cash') {
      v.sittingOut = true;
      self.emit({ type: 'needRebuy', playerId: v.id });
    } else {
      var place = self.alive().length;
      v.out = true;
      v.place = place;
      self.piggyTotal += cfg.startStack;
      self.emit({ type: 'eliminate', playerId: v.id, place: place, reason: 'bust' });
      // 赏金: 找包含其贡献的最后一个池的赢家
      if (cfg.mode === 'squid' && cfg.squid.bounty) {
        var killer = null;
        for (var i = info.pots.length - 1; i >= 0; i--) {
          var pot = info.pots[i];
          if (pot.contributors && pot.contributors.indexOf(v.id) >= 0 && pot.winners.length) { killer = pot.winners[0]; break; }
        }
        if (killer !== null && killer !== v.id) {
          var bAmt = cfg.squid.bountyAmount;
          self.players[killer].stack += bAmt;
          self.players[killer].bounty++;
          self.emit({ type: 'bounty', playerId: killer, amount: bAmt, victimId: v.id });
        }
      }
    }
  });

  // 鱿鱼淘汰时钟
  if (cfg.mode === 'squid') {
    this.handsSinceDeadline++;
    var minAlive = this.cfg.squid.deadlineUntilHU ? 2 : 1;
    if (this.handsSinceDeadline >= cfg.squid.deadlineHands && this.alive().length > minAlive) {
      var alive = this.alive();
      var lowStack = Infinity;
      alive.forEach(function (p) { if (p.stack < lowStack) lowStack = p.stack; });
      var lows = alive.filter(function (p) { return p.stack === lowStack; });
      var victim = lows[Math.floor(this.rng() * lows.length)];
      var amount = victim.stack;
      this.piggyTotal += amount;
      victim.stack = 0;
      victim.out = true;
      victim.place = this.alive().length + 1;
      this.handsSinceDeadline = 0;
      this.emit({ type: 'deadline', playerId: victim.id, amount: amount, piggy: this.piggyTotal, place: victim.place });
    }
  }

  // 结束检查
  if (cfg.mode !== 'cash' && this.alive().length <= 1) {
    var winner = this.alive()[0];
    if (winner) { winner.place = 1; winner.stats.handsWon++; }
    var standings = this.players.slice().sort(function (a, b) { return (a.place || 99) - (b.place || 99) || b.stack - a.stack; });
    var pool = this.players.length * cfg.startStack;
    var payouts = cfg.mode === 'squid' && cfg.squid.winnerTakeAll ? [1] : (this.players.length >= 3 ? [0.5, 0.3, 0.2] : [0.7, 0.3]);
    var prizes = {};
    standings.forEach(function (p, i) { prizes[p.id] = Math.round((payouts[i] || 0) * pool); });
    this.over = true;
    this.emit({ type: 'gameOver', mode: cfg.mode, standings: standings.map(function (p) { return { playerId: p.id, name: p.name, place: p.place || i0(p), stack: p.stack, prize: prizes[p.id] || 0, bounty: p.bounty, out: p.out }; }), prizes: prizes, pool: pool });
    function i0(p) { return 99; }
  }
  this.phase = 'done';
};

Engine.prototype.rebuy = function (playerId) {
  var p = this.players[playerId];
  p.stack = this.cfg.startStack;
  p.sittingOut = false;
  p.rebuys++;
  p.totalBuyin += this.cfg.startStack;
  this.emit({ type: 'rebuy', playerId: playerId, amount: this.cfg.startStack });
  return this.events;
};

Engine.prototype.standUp = function (playerId) {
  var p = this.players[playerId];
  p.out = true;
  if (this.eligibleCount() < 2 && !this.over) {
    this.over = true;
    this.emit({ type: 'gameOver', mode: this.cfg.mode, standings: [{ playerId: p.id, name: p.name, place: 1 }], prizes: {}, pool: 0, quit: true });
  }
  return this.events;
};

/* 当前街名 */
Engine.prototype.streetName = function () {
  return ['翻牌前', '翻牌', '转牌', '河牌'][this.street];
};

if (typeof window !== 'undefined') window.PK = PK; else global.PK = PK;
})();
