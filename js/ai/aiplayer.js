/* AI 玩家决策引擎: 六种风格 + 胜率 + 随机性
 * 决策依据 = 风格参数 × 胜率/赔率 × 位置 × 噪声
 * (配置 LLM 后由主控制器在风格决策之上再混合大模型意见)
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : global.PK;

var STYLES = {
  TAG:   { label: '紧凶', desc: '选牌严格,下注激进', vpip: 0.24, pfr: 0.17, agg: 0.68, bluff: 0.14, sticky: 0.35, sizing: 0.66, betEq: 0.60, raiseEq: 0.72, callMargin: 0.02 },
  LAG:   { label: '松凶', desc: '什么牌都打,频繁施压', vpip: 0.42, pfr: 0.30, agg: 0.82, bluff: 0.32, sticky: 0.50, sizing: 0.82, betEq: 0.48, raiseEq: 0.60, callMargin: -0.02 },
  ROCK:  { label: '紧弱', desc: '只玩大牌,被动跟注', vpip: 0.15, pfr: 0.05, agg: 0.25, bluff: 0.04, sticky: 0.72, sizing: 0.45, betEq: 0.74, raiseEq: 0.85, callMargin: 0.09 },
  FISH:  { label: '松弱', desc: '什么牌都跟,极少加注', vpip: 0.58, pfr: 0.04, agg: 0.18, bluff: 0.05, sticky: 0.92, sizing: 0.50, betEq: 0.78, raiseEq: 0.90, callMargin: -0.14 },
  BAL:   { label: '均衡', desc: '攻守兼备的标准打法', vpip: 0.29, pfr: 0.19, agg: 0.55, bluff: 0.20, sticky: 0.45, sizing: 0.60, betEq: 0.55, raiseEq: 0.68, callMargin: 0.0 },
  MANIAC:{ label: '疯狂', desc: '无差别加注,极不稳定', vpip: 0.78, pfr: 0.65, agg: 0.95, bluff: 0.48, sticky: 0.62, sizing: 1.05, betEq: 0.30, raiseEq: 0.42, callMargin: -0.08 }
};
PK.AI_STYLES = STYLES;

/* 每个 AI 会话期随机微调一点风格,增加个性 */
var moodCache = {};
function styleOf(p) {
  var base = STYLES[p.styleKey] || STYLES.BAL;
  if (!moodCache[p.id]) {
    var m = {};
    ['vpip', 'pfr', 'agg', 'bluff', 'sticky', 'sizing', 'betEq', 'raiseEq', 'callMargin'].forEach(function (k) {
      m[k] = base[k] * (0.9 + Math.random() * 0.2);
    });
    m.label = base.label; m.desc = base.desc;
    moodCache[p.id] = m;
  }
  return moodCache[p.id];
}
PK.AI_resetMood = function () { moodCache = {}; };

function nOpponentsOf(engine, p) {
  return engine.handActive().filter(function (q) { return q.id !== p.id; }).length;
}

/* 位置系数: 0=最先行动 1=庄家位 */
function positionFactor(engine, p) {
  var act = engine.players.filter(function (q) { return q.dealt; });
  var order = [], idx = engine.dealerIdx;
  for (var i = 0; i < act.length; i++) { idx = engine.nextDealt(idx); order.push(idx); }
  // preflop 行动顺序从 BB 后开始; 简化: 用距庄家的座位序
  var pos = order.indexOf(p.id);
  return act.length <= 1 ? 0.5 : pos / (act.length - 1);
}

function effectiveStackBB(engine, p) {
  var opps = engine.handActive().filter(function (q) { return q.id !== p.id && !q.allIn; });
  var minStack = p.stack;
  opps.forEach(function (q) { minStack = Math.min(minStack, q.stack + q.bet); });
  return minStack / engine.bb;
}

/* 翻牌前决策 */
function preflop(engine, p, style, rng) {
  var legal = engine.legalActions(p);
  var q = PK.chenQ(p.hole[0], p.hole[1]);
  var posF = positionFactor(engine, p);
  var nOpp = nOpponentsOf(engine, p);
  var noise = PK.gauss(rng) * 0.045;

  // 鱿鱼时钟压力: 临近淘汰且自己是短码 → 拼命
  var urgency = 0;
  if (engine.cfg.mode === 'squid' && engine.handsUntilDeadline() <= 1) {
    var minStack = Infinity;
    engine.alive().forEach(function (a) { minStack = Math.min(minStack, a.stack); });
    if (p.stack <= minStack * 1.4) urgency = 0.18;
  }

  var vpipEff = Math.min(0.95, style.vpip * (0.75 + 0.55 * posF) + urgency);
  var qAdj = q * (0.92 + 0.16 * posF) + noise;

  // 短码 push/fold
  var effBB = effectiveStackBB(engine, p);
  if (effBB <= 10 && legal.toCall > 0) {
    var pushThresh = 0.62 - 0.30 * posF - urgency; // 位置越后越松
    if (qAdj > pushThresh) return { type: 'allin' };
    if (legal.toCall <= engine.bb) return (qAdj > 0.25) ? { type: 'call' } : { type: 'fold' };
    return { type: 'fold' };
  }

  if (legal.toCall <= 0) {
    // 可以过牌或开加注
    var openRoll = rng();
    var pfrEff = Math.min(0.9, style.pfr * (0.8 + 0.5 * posF) + urgency * 0.5);
    if (openRoll < pfrEff || qAdj > 0.72) {
      /* 开牌原则: 2~3bb 为基, 每个已跟注入池的玩家 +1bb */
      var limpers = 0;
      engine.players.forEach(function (q) { if (q.id !== p.id && !q.folded && q.hasActed && q.bet >= engine.bb) limpers++; });
      var size = engine.bb * (2.2 + style.sizing * 0.6 + rng() * 0.5) + limpers * engine.bb;
      var to = Math.round(Math.max(size, engine.currentBet * 2.5));
      return { type: 'raise', amount: Math.min(to, legal.maxTo) };
    }
    return { type: 'check' };
  }

  // 面对下注/加注
  var potOdds = legal.potOdds;
  var eqEst = 0.30 + 0.55 * qAdj;            // 单挑近似
  eqEst *= Math.max(0.35, 1 - 0.13 * (nOpp - 1)); // 多人衰减
  var raiseCount = 1;
  if (engine.currentBet > engine.bb * 3) raiseCount = 2;
  if (engine.currentBet > engine.bb * 7) raiseCount = 3;
  qAdj *= Math.pow(0.88, raiseCount - 1);

  var wantPlay = qAdj > (1 - vpipEff) * 0.55 || (style.sticky > 0.6 && rng() < style.sticky * 0.5);
  var callOK = eqEst + style.sticky * 0.06 > potOdds + style.callMargin;
  var callSize = legal.toCall / (p.stack + p.bet);

  // 超大盘(含全下): 用蒙特卡洛胜率(只对已全下的对手模拟) 对比底池赔率决策。
  // Chen Q 硬阈值在此严重过紧(hero 满码全下时 AI 几乎必弃, 须 AK 级才跟), 游戏无对抗性。
  if (callSize > 0.5) {
    var nAllin = 0;
    engine.handActive().forEach(function (q) { if (q.id !== p.id && q.allIn) nAllin++; });
    var eqA = eqEst;
    if (PK.Equity && p.hole && p.hole.length >= 2) {
      var rA = PK.Equity.simulate(p.hole, [], Math.max(1, nAllin), [], 260, rng);
      eqA = rA.win + rA.tie * 0.5;
    }
    eqA = Math.max(0.02, Math.min(0.99, eqA + PK.gauss(rng) * 0.03));
    var marginA = 0.10 + style.callMargin * 0.6;   // 风格承载松紧: fish 爱跟, ROCK 更紧
    if (eqA > potOdds + marginA + 0.14 && rng() < style.agg * 0.7) return { type: 'allin' };
    if (eqA > potOdds + marginA) return { type: 'call' };
    return { type: 'fold' };
  }

  if (!wantPlay && !callOK) return { type: 'fold' };
  if (callSize > 0.35 && eqEst < 0.55) return { type: 'fold' }; // 大注面前没货不跟

  // 3bet
  if ((qAdj > 0.62 + style.callMargin && rng() < style.agg) || rng() < style.bluff * 0.35) {
    /* 3bet 原则: 上次加注的 3~3.7 倍, 每个冷跟注者 +1bb */
    var coldCallers = 0;
    engine.players.forEach(function (q) { if (q.id !== p.id && !q.folded && !q.allIn && q.hasActed && q.bet >= engine.currentBet) coldCallers++; });
    if (engine.currentBet > engine.bb) coldCallers = Math.max(0, coldCallers - 1); /* 去掉加注者本人 */
    var to3 = Math.round(engine.currentBet * (3 + style.sizing * 0.6) + coldCallers * engine.bb);
    if (to3 >= legal.maxTo * 0.72) return { type: 'allin' };
    return { type: 'raise', amount: Math.min(to3, legal.maxTo) };
  }
  return { type: 'call' };
}

/* 翻牌后决策: equity 为蒙特卡洛胜率(主控制器计算注入) */
function postflop(engine, p, style, rng, equity) {
  var legal = engine.legalActions(p);
  var e = Math.max(0.02, Math.min(0.99, equity + PK.gauss(rng) * 0.05));
  var pot = legal.potTotal;
  var toCall = legal.toCall;
  var potOdds = legal.potOdds;
  var nOpp = nOpponentsOf(engine, p);
  var street = engine.street; // 1 flop 2 turn 3 river
  var bluffRoll = rng() < style.bluff * (street === 3 ? 1 : 0.8);
  var semiBluff = rng() < style.bluff * 0.6;

  if (toCall <= 0) {
    var shouldBet = e > style.betEq + (street === 1 ? 0.03 : 0) || (e > style.betEq - 0.1 && rng() < style.agg * 0.5);
    if (shouldBet || bluffRoll) {
      var frac = style.sizing * (0.7 + rng() * 0.6);
      var amt = Math.round(pot * frac / engine.bb) * engine.bb;
      amt = Math.max(engine.bb, Math.min(amt, Math.round(legal.maxTo)));
      // 大牌大注
      if (e > 0.85) amt = Math.round(amt * 1.3);
      if (amt >= legal.maxTo * 0.6 || (e > 0.9 && amt >= legal.maxTo * 0.4)) return { type: 'allin' };
      return { type: 'bet', amount: amt };
    }
    return { type: 'check' };
  }

  // 面对下注
  var foldThresh = potOdds + style.callMargin + (style.sticky - 0.5) * -0.08;
  var bigBet = toCall > pot * 0.9;
  var hugeBet = toCall > (p.stack + p.bet) * 0.5;

  if (e < foldThresh) {
    // 偶尔诈唬加注(半诈唊)
    if (semiBluff && e > potOdds * 0.45 && toCall < (p.stack + p.bet) * 0.25) {
      var toS = Math.round((engine.currentBet * 2.6 + pot * 0.3));
      return { type: 'raise', amount: Math.min(toS, legal.maxTo) };
    }
    if (hugeBet) return { type: 'fold' };
    return { type: 'fold' };
  }

  // 加注区
  if (e > style.raiseEq && rng() < style.agg) {
    var toR = Math.round(engine.currentBet * (2.3 + style.sizing * 0.7) + pot * 0.15);
    if (toR >= legal.maxTo * 0.7 || (e > 0.9 && hugeBet)) return { type: 'allin' };
    return { type: 'raise', amount: Math.min(toR, legal.maxTo) };
  }
  if (bluffRoll && e > 0.3 && !hugeBet && rng() < style.agg * 0.7) {
    var toB = Math.round(engine.currentBet * 2.7);
    return { type: 'raise', amount: Math.min(toB, legal.maxTo) };
  }

  // 大注面前谨慎
  if (bigBet && e < potOdds + 0.08 && style.sticky < 0.7) return { type: 'fold' };
  if (hugeBet && e < 0.5) return { type: 'fold' };
  return { type: 'call' };
}

/* 主入口: engine 当前局, p 待行动 AI; equityFn(p) 返回该 AI 视角的胜率 */
PK.AI_decide = function (engine, p, equityFn, rng) {
  rng = rng || Math.random;
  var style = styleOf(p);
  if (engine.forced) return { type: 'check' }; // 强制摊牌不会走到这
  try {
    if (engine.street === 0) return preflop(engine, p, style, rng);
    var eq = equityFn ? equityFn(p) : 0.4;
    return postflop(engine, p, style, rng, eq);
  } catch (err) {
    return { type: 'check' };
  }
};

PK.AI_styleOf = styleOf;

if (typeof window !== 'undefined') window.PK = PK; else global.PK = PK;
})();
