/* Node 逻辑测试: 评估器 / 胜率 / 引擎 fuzz
 * 用法: node tests/run-tests.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = {
  window: undefined,
  global: {},
  console, Math, setTimeout, performance: { now: () => Date.now() },
};
ctx.global = ctx; // 让模块里的 global.PK 挂到同一对象
vm.createContext(ctx);
for (const f of ['js/core/cards.js', 'js/core/equity.js', 'js/core/engine.js', 'js/core/gto.js', 'js/ai/aiplayer.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const PK = ctx.PK;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', msg); }
}
function section(name) { console.log('== ' + name + ' =='); }

/* ---------- 评估器 ---------- */
section('evaluator');
const C = (r, s) => (r << 2) | s; // rank, suit
function score(cs) { return PK.evalScore(cs, cs.length); }

ok(score([C(14,0),C(13,0),C(12,0),C(11,0),C(10,0),C(5,1),C(9,1)]) >> 20 === 8, 'royal flush cat');
ok(score([C(14,0),C(2,0),C(3,0),C(4,0),C(5,0),C(9,1),C(9,2)]) >> 20 === 8, 'wheel straight flush');
ok((score([C(14,0),C(2,0),C(3,0),C(4,0),C(5,0),C(9,1),C(9,2)]) >> 16 & 0xf) === 5, 'wheel high=5');
ok(score([C(9,0),C(9,1),C(9,2),C(9,3),C(5,1),C(6,2),C(7,0)]) >> 20 === 7, 'quads');
ok(score([C(9,0),C(9,1),C(9,2),C(2,3),C(2,1),C(6,2),C(7,0)]) >> 20 === 6, 'full house (trips+pair)');
ok(score([C(9,0),C(9,1),C(9,2),C(3,3),C(3,1),C(6,2),C(7,0)]) >> 20 === 6, 'full house (two trips)');
ok(score([C(14,0),C(11,0),C(9,0),C(7,0),C(5,0),C(13,1),C(12,2)]) >> 20 === 5, 'flush');
ok(score([C(14,0),C(11,0),C(9,0),C(7,0),C(5,0),C(13,1),C(12,2)]) === ((5<<20)|(14<<16)|(11<<12)|(9<<8)|(7<<4)|5), 'flush ranks packed');
ok(score([C(14,0),C(13,1),C(12,0),C(11,2),C(10,3),C(7,1),C(5,2)]) >> 20 === 4, 'straight not flush');
ok(score([C(14,0),C(2,1),C(3,2),C(4,3),C(5,0),C(13,1),C(12,2)]) >> 20 === 4, 'wheel straight');
ok(score([C(9,0),C(9,1),C(9,2),C(2,3),C(3,1),C(6,2),C(7,0)]) >> 20 === 3, 'trips');
ok(score([C(9,0),C(9,1),C(2,2),C(2,3),C(3,1),C(6,2),C(7,0)]) >> 20 === 2, 'two pair');
ok(score([C(9,0),C(9,1),C(2,2),C(3,3),C(4,1),C(6,2),C(7,0)]) >> 20 === 1, 'one pair');
ok(score([C(14,0),C(11,1),C(9,2),C(7,3),C(5,1),C(3,2),C(2,3)]) >> 20 === 0, 'high card');
// kicker 对比
ok(score([C(14,0),C(14,1),C(9,2),C(7,3),C(6,1),C(4,2),C(3,0)]) > score([C(14,2),C(14,3),C(8,1),C(6,0),C(4,3),C(3,2),C(2,1)]), 'pair kicker A96>A85');
ok(score([C(13,0),C(13,1),C(2,2),C(3,3),C(4,1),C(6,2),C(7,0)]) < score([C(14,2),C(14,3),C(2,1),C(3,0),C(4,2),C(5,3),C(6,1)]), 'AA>KK');
ok(score([C(8,0),C(8,1),C(8,2),C(8,3),C(5,1),C(5,2),C(6,0)]) > score([C(14,0),C(14,1),C(14,2),C(2,3),C(3,1),C(6,2),C(7,0)]), 'quads>trips');
// detailed best5
const det = PK.evalDetailed([C(14,0),C(14,1),C(2,2),C(3,3),C(4,1),C(6,2),C(7,0)]);
ok(det.best5.length === 5 && det.best5.filter(c => c>>2===14).length === 2, 'detailed best5 pair');
const detSf = PK.evalDetailed([C(14,0),C(2,0),C(3,0),C(4,0),C(5,0),C(9,1),C(9,2)]);
ok(detSf.best5.length === 5 && detSf.best5.every(c => (c&3)===0), 'detailed wheel SF all spades');
ok(detSf.best5.includes(C(14,0)), 'wheel SF uses ace');

/* ---------- 成牌标签 ---------- */
section('madeLabel');
ok(PK.madeLabel([C(14,0),C(14,1)]) === '一对', 'made hole pair');
ok(PK.madeLabel([C(14,0),C(9,1),C(9,2),C(9,3),C(5,0),C(6,1),C(7,2)]) === '三条', 'made trips');
ok(PK.madeLabel([C(9,0),C(9,1),C(2,2),C(2,3),C(3,1),C(6,2),C(7,0)]) === '两对', 'made two pair');
ok(PK.madeLabel([C(14,0),C(11,1),C(9,2),C(7,3),C(5,1),C(3,2),C(2,3)]) === '高牌', 'made high card');
ok(PK.madeLabel([C(14,0),C(11,0),C(9,0),C(7,0),C(5,0),C(13,1),C(12,2)]) === '同花', 'made flush');
ok(PK.madeLabel([C(8,0),C(9,0),C(10,0),C(11,0),C(12,0),C(2,1),C(3,2)]) === '同花顺', 'made straight flush');
ok(PK.madeLabel([C(9,0),C(10,0),C(11,0),C(12,0),C(13,0),C(2,1),C(3,2)]) === '同花顺', 'made K-high SF not royal');
ok(PK.madeLabel([C(10,0),C(11,0),C(12,0),C(13,0),C(14,0),C(2,1),C(3,2)]) === '皇家同花顺', 'made royal flush');
ok(PK.madeLabel([C(14,0),C(2,0),C(3,0),C(4,0),C(5,0),C(9,1),C(9,2)]) === '同花顺', 'made wheel SF');
ok(PK.madeLabel([C(8,0),C(8,1),C(8,2),C(5,1),C(5,2),C(6,0),C(7,0)]) === '葫芦', 'made full house');
ok(PK.madeLabel([C(8,0),C(8,1),C(8,2),C(8,3),C(5,1),C(5,2),C(6,0)]) === '四条', 'made quads');
ok(PK.madeLabel([C(14,0)]) === null, 'made needs 2+ cards');

/* ---------- 胜率 ---------- */
section('equity');
const rng = PK.mulberry32(42);
let r = PK.Equity.simulate([C(14,0),C(14,1)], [], 1, [], 3000, rng);
ok(r.win > 0.80 && r.win < 0.90, 'AA vs 1 random ≈ 85% (got ' + (r.win*100).toFixed(1) + ')');
r = PK.Equity.simulate([C(7,0),C(2,1)], [], 1, [], 3000, rng);
ok(r.win > 0.28 && r.win < 0.42, '72o vs 1 random ≈ 35% (got ' + (r.win*100).toFixed(1) + ')');
r = PK.Equity.simulate([C(14,0),C(14,1)], [], 5, [], 4000, rng);
ok(r.win > 0.42 && r.win < 0.58, 'AA vs 5 ≈ 49% (got ' + (r.win*100).toFixed(1) + ')');
r = PK.Equity.simulate([C(14,0),C(14,1)], [C(14,2),C(14,3),C(7,1)], 1, [], 2000, rng);
ok(r.win > 0.95, 'quads on board ≈ 98% (got ' + (r.win*100).toFixed(1) + ')');
const rm = PK.Equity.multi([[C(14,0),C(14,1)],[C(7,1),C(2,2)]], [C(5,0),C(6,0),C(9,3)], 2000, rng);
ok(Math.abs(rm[0].win + rm[1].win + rm[0].tie - 1) < 1e-6, 'multi probabilities sum');
ok(rm[0].win > 0.75, 'AA vs 72 on board dominates (exact 80.8, got ' + (rm[0].win*100).toFixed(1) + ')');
const t0 = Date.now();
PK.Equity.simulate([C(11,1),C(10,1)], [C(2,0)], 4, [], 5000, PK.rng);
console.log('  5000 iters x5 hands eval time:', (Date.now()-t0) + 'ms');

/* ---------- 引擎 fuzz ---------- */
section('engine fuzz');
function mkCfg(mode, n, extra) {
  const roster = [];
  for (let i = 0; i < n; i++) roster.push({ name: 'P' + i, isHuman: false, styleKey: ['TAG','LAG','ROCK','FISH','BAL','MANIAC','TAG','LAG','BAL'][i] });
  const cfg = Object.assign({ mode, startStack: 1000, revealFolds: true, roster }, extra || {});
  if (mode === 'cash') cfg.cash = { sb: 5, bb: 10 };
  if (mode === 'tourney') cfg.tourney = { handsPerLevel: 8 };
  if (mode === 'squid') {
    cfg.tourney = { handsPerLevel: 8 };
    cfg.squid = { deadlineHands: 5, forcedShowdown: true, bounty: true, bountyAmount: 500, deadlineUntilHU: true, winnerTakeAll: true };
  }
  return cfg;
}
function driveRandomly(engine, maxHands) {
  let hands = 0, actions = 0;
  while (!engine.over && hands < maxHands) {
    engine.startHand();
    hands++;
    let guard = 0;
    while (engine.phase !== 'done' && guard++ < 500) {
      if (engine.awaiting) {
        const p = engine.awaiting;
        const legal = engine.legalActions(p);
        // 随机但偏向合理: 60% call/check, 25% fold, 15% raise
        const roll = engine.rng();
        let d;
        if (roll < 0.25 && !(legal.toCall === 0 && engine.rng() < 0.7)) d = { type: 'fold' };
        else if (roll < 0.85) d = legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
        else {
          const to = legal.minTo + Math.floor(engine.rng() * Math.max(1, (legal.maxTo - legal.minTo) / 2));
          d = { type: legal.isRaise ? 'raise' : 'bet', amount: to };
          if (engine.rng() < 0.2) d = { type: 'allin' };
        }
        engine.act(p.id, d);
        actions++;
      } else {
        engine.step();
      }
    }
    if (guard >= 500) throw new Error('hand did not terminate (mode ' + engine.cfg.mode + ' hand ' + hands + ')');
    // 现金局: 自动重买, 防止人数不足
    if (engine.cfg.mode === 'cash') {
      engine.players.forEach(p => { if (p.sittingOut) engine.rebuy(p.id); });
    }
  }
  return { hands, actions };
}

for (const mode of ['cash', 'tourney', 'squid']) {
  for (const n of [2, 4, 9]) {
    const rng2 = PK.mulberry32(1234 + n);
    const eng = new PK.Engine(mkCfg(mode, n), rng2);
    const res = driveRandomly(eng, mode === 'cash' ? 300 : 1000);
    let total = 0;
    eng.players.forEach(p => { total += p.stack; ok(p.stack >= 0, p.name + ' stack>=0 (got ' + p.stack + ')'); });
    const bountyIn = mode === 'squid' ? eng.players.reduce((s, p) => s + p.bounty, 0) * 500 : 0;
    if (mode === 'cash') {
      const buyins = eng.players.reduce((s2, p) => s2 + p.totalBuyin, 0);
      ok(total === buyins, mode + '/' + n + ' cash chip conservation: total=' + total + ' buyins=' + buyins);
      ok(!eng.over, 'cash never auto-ends');
    } else {
      ok(eng.over, mode + '/' + n + ' terminates (' + res.hands + ' hands)');
      const alive = eng.alive();
      ok(alive.length === 1, mode + '/' + n + ' one winner left');
      // 淘汰名次: 1..N 且不重复
      const places = eng.players.filter(p => p.out).map(p => p.place).sort((a,b)=>a-b);
      const uniq = new Set(places);
      ok(uniq.size === places.length, mode + '/' + n + ' unique places');
      ok(places[places.length-1] < n + 1, mode + '/' + n + ' places in range');
    }
    console.log('  ' + mode + '/' + n + ': ' + res.hands + ' hands, ' + res.actions + ' actions OK');
  }
}

// 边池专项: 三人不同额度全下
section('side pots');
{
  const eng = new PK.Engine(mkCfg('cash', 3), PK.mulberry32(7));
  eng.startHand();
  // P0 庄家, P1 SB, P2 BB (3人局)
  const p = eng.players;
  // 强制构造: P1 allin 100, P2 allin 400, P0 call 400
  eng.act(p[1].id, { type: 'raise', amount: 100 });
  eng.act(p[2].id, { type: 'raise', amount: 400 });
  eng.act(p[0].id, { type: 'call' });
  // P1 还需补 300? 不—— P1 已 allin(100), 轮不到; P0 call 400 完成
  while (eng.phase !== 'done') { if (eng.awaiting) eng.act(eng.awaiting.id, { type: 'call' }); else eng.step(); }
  const total = p.reduce((s, q) => s + q.stack, 0);
  ok(total === 3000, 'side pot chip conservation total=' + total);
  // 每手发牌重置: contributed/bet/hole 清零
  ok(eng.potTotal() >= 0, 'potTotal readable after hand');
  eng.startHand();
  ok(eng.potTotal() === 15, 'new hand starts with only blinds in pot (got ' + eng.potTotal() + ')');
  ok(eng.players.every(q => q.hole.length === 2), 'all dealt 2 hole cards');
}
// 两人局盲注与行动顺序
section('heads-up');
{
  const eng = new PK.Engine(mkCfg('cash', 2), PK.mulberry32(9));
  eng.startHand();
  const d = eng.players[eng.dealerIdx];
  const legal = eng.legalActions(d);
  ok(eng.awaiting === d, 'HU: dealer/SB acts first preflop');
  ok(d.bet === 5, 'HU: dealer posted SB 5 (got ' + d.bet + ')');
  eng.act(d.id, { type: 'call' });
  eng.act(eng.awaiting.id, { type: 'check' });
  eng.step(); // flop
  const nd = eng.players[eng.dealerIdx];
  ok(eng.awaiting && eng.awaiting !== nd, 'HU: BB acts first postflop');
}
// runout: 两人全下后自动发完公共牌
section('runout');
{
  const eng = new PK.Engine(mkCfg('cash', 2), PK.mulberry32(11));
  eng.startHand();
  eng.act(eng.awaiting.id, { type: 'allin' });
  eng.act(eng.awaiting.id, { type: 'call' });
  ok(eng.awaiting === null, 'after allin-call no one to act');
  let streets = 0, guard = 0, revealed = false;
  while (eng.phase !== 'done' && guard++ < 20) {
    const evs = eng.step();
    evs.forEach(e => { if (e.type === 'street') streets++; if (e.type === 'runoutReveal') revealed = true; });
  }
  ok(revealed, 'runout reveals hands');
  ok(streets === 3, 'runout deals 3 streets (got ' + streets + ')');
  ok(eng.phase === 'done', 'runout finishes hand');
}
// 鱿鱼时钟: 短码会被淘汰
section('squid deadline');
{
  // 关闭强制摊牌, 只跟注打法 -> 时钟到点淘汰最短码
  const cfg = mkCfg('squid', 5);
  cfg.squid.forcedShowdown = false;
  cfg.squid.deadlineHands = 4;
  cfg.startStack = 1000;
  const eng = new PK.Engine(cfg, PK.mulberry32(2024));
  const events = [];
  let hands = 0;
  while (!eng.over && hands < 200) {
    eng.startHand(); hands++;
    let g = 0;
    while (eng.phase !== 'done' && g++ < 300) {
      if (eng.awaiting) eng.act(eng.awaiting.id, eng.awaiting.bet < eng.currentBet ? { type: 'call' } : { type: 'check' });
      else eng.step();
    }
    events.push(...eng.events.filter(e => ['deadline', 'forcedStart', 'bounty', 'eliminate'].includes(e.type)).map(e => e.type));
  }
  const deadlineCount = events.filter(e => e === 'deadline').length;
  ok(deadlineCount >= 1, 'deadline elimination fired (got ' + deadlineCount + ' in ' + hands + ' hands)');
  ok(!events.includes('forcedStart'), 'no forced hand when disabled');
  ok(eng.over, 'squid game ends');
  // 赏金: 自然出局应发赏金
  const bountySum = eng.players.reduce((s, p) => s + p.bounty, 0);
  ok(bountySum >= 1, 'bounties awarded (got ' + bountySum + ')');
  ok(eng.piggyTotal > 0, 'piggy bank fills (got ' + eng.piggyTotal + ')');
  console.log('  squid: ' + hands + ' hands, ' + deadlineCount + ' deadlines, ' + bountySum + ' bounties, piggy ' + eng.piggyTotal);
}
// 强制摊牌手: 开启时全员全下
{
  const cfg = mkCfg('squid', 3);
  cfg.squid.deadlineHands = 3;
  cfg.squid.forcedShowdown = true;
  const eng = new PK.Engine(cfg, PK.mulberry32(31));
  let forcedFired = false, forcedHandNo = 0, hands = 0;
  while (!eng.over && hands < 200) {
    const startEvs = eng.startHand(); hands++;
    if (startEvs.some(e => e.type === 'forcedStart')) { forcedFired = true; forcedHandNo = hands; }
    let g = 0;
    while (eng.phase !== 'done' && g++ < 200) {
      if (eng.awaiting) eng.act(eng.awaiting.id, { type: 'check' });
      else eng.step();
    }
  }
  ok(forcedFired, 'forced showdown hand fires');
  ok(forcedHandNo === 3, 'forced hand at deadline (got hand ' + forcedHandNo + ')');
  ok(eng.over, 'squid game eventually ends (' + hands + ' hands)');
}

/* ---------- 深度不变量: 每手资金对账 ---------- */
section('per-hand accounting');
{
  // 每手: post 投入总额 === award 发放总额 (含边池/余数/退还, 三模式通用)
  for (const mode of ['cash', 'tourney', 'squid']) {
    let checked = 0, splitPots = 0, allinHands = 0;
    const eng = new PK.Engine(mkCfg(mode, 9), PK.mulberry32(777));
    for (let hand = 0; hand < 60 && !eng.over; hand++) {
      const evs = [...eng.startHand()];
      let g = 0;
      while (eng.phase !== 'done' && g++ < 500) {
        if (eng.awaiting) {
          const p = eng.awaiting;
          const legal = eng.legalActions(p);
          const roll = engineRng(eng);
          let d;
          if (roll < 0.35) d = { type: 'fold' };           // 多弃牌拉长对局
          else if (roll < 0.92) d = legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
          else {
            const to = legal.minTo + Math.floor(engineRng(eng) * Math.max(1, (legal.maxTo - legal.minTo) / 3));
            d = { type: legal.isRaise ? 'raise' : 'bet', amount: to };
          }
          evs.push(...eng.act(p.id, d));
        } else evs.push(...eng.step());
      }
      if (g >= 500) { ok(false, mode + ' hand ' + (hand + 1) + ' did not terminate'); break; }
      const posted = evs.filter(e => e.type === 'post').reduce((s, e) => s + e.amount, 0);
      const awarded = evs.filter(e => e.type === 'award').reduce((s, e) => s + e.amount, 0);
      if (posted !== awarded) ok(false, mode + ' hand ' + (hand + 1) + ' posted ' + posted + ' != awarded ' + awarded);
      if (evs.some(e => e.type === 'runoutReveal')) allinHands++;
      if (evs.some(e => e.type === 'showdown' && e.pots.length > 1)) splitPots++;
      if (evs.some(e => e.type === 'showdown')) {
        const sd = evs.find(e => e.type === 'showdown');
        sd.pots.forEach(pot => ok(pot.amount > 0 && pot.winners.length >= 1, mode + ' pot valid'));
      }
      // handEnd 后无待行动者
      if (eng.phase === 'done' && eng.awaiting !== null) ok(false, mode + ' awaiting not null after handEnd');
      checked++;
      if (mode === 'cash') eng.players.forEach(p => { if (p.sittingOut) eng.rebuy(p.id); });
    }
    ok(checked >= 10, mode + ' accounting checked enough hands (' + checked + ')');
    console.log('  ' + mode + ': ' + checked + ' hands balanced, ' + splitPots + ' side-pot hands, ' + allinHands + ' allin runouts');
  }
  function engineRng(eng) { return eng.rng(); }
}
// squid 全局守恒: sum(stack) + deadline 移除额 = 初始 + bounty 发放额
{
  const cfg = mkCfg('squid', 5);
  cfg.squid.deadlineHands = 4;
  const eng = new PK.Engine(cfg, PK.mulberry32(31337));
  let deadlineRemoved = 0, bountyPaid = 0;
  const init = 5 * 1000;
  let hands = 0;
  while (!eng.over && hands < 300) {
    const evs = [...eng.startHand()];
    let g = 0;
    while (eng.phase !== 'done' && g++ < 500) {
      if (eng.awaiting) {
        const p = eng.awaiting;
        const legal = eng.legalActions(p);
        const roll = eng.rng();
        let d;
        if (roll < 0.3) d = { type: 'fold' };
        else if (roll < 0.8) d = legal.toCall > 0 ? { type: 'call' } : { type: 'check' };
        else { const to = legal.minTo + Math.floor(eng.rng() * Math.max(1, (legal.maxTo - legal.minTo) / 2)); d = { type: legal.isRaise ? 'raise' : 'bet', amount: to }; }
        evs.push(...eng.act(p.id, d));
      } else evs.push(...eng.step());
    }
    evs.forEach(e => {
      if (e.type === 'deadline') deadlineRemoved += e.amount;
      if (e.type === 'bounty') bountyPaid += e.amount;
    });
    hands++;
  }
  const sum = eng.players.reduce((s, p) => s + p.stack, 0);
  ok(sum + deadlineRemoved === init + bountyPaid, 'squid conservation: sum ' + sum + ' + removed ' + deadlineRemoved + ' == init ' + init + ' + bounty ' + bountyPaid);
  ok(eng.over, 'squid ends (' + hands + ' hands)');
}
// tourney 全局守恒(无 bounty 凭空发放): sum(alive stack) 恒 = n*startStack
{
  const eng = new PK.Engine(mkCfg('tourney', 4), PK.mulberry32(999));
  let hands = 0;
  while (!eng.over && hands < 300) {
    eng.startHand(); hands++;
    let g = 0;
    while (eng.phase !== 'done' && g++ < 500) {
      if (eng.awaiting) eng.act(eng.awaiting.id, eng.rng() < 0.5 ? { type: 'call' } : { type: 'fold' });
      else eng.step();
    }
    const s = eng.alive().reduce((a, p) => a + p.stack, 0);
    if (s !== 4000) { ok(false, 'tourney conservation broken at hand ' + hands + ': ' + s); break; }
  }
  ok(eng.over, 'tourney ends with conservation intact (' + hands + ' hands)');
}

/* ---------- 不足额全下不重开行动 ---------- */
section('short allin');
{
  const eng = new PK.Engine(mkCfg('cash', 3), PK.mulberry32(5));
  eng.startHand();
  const p = eng.players;
  eng.act(p[1].id, { type: 'call' });   // SB call 5
  eng.act(p[2].id, { type: 'check' });
  eng.step();                            // flop
  eng.act(p[0].id, { type: 'bet', amount: 100 });
  eng.act(p[1].id, { type: 'raise', amount: 300 }); // minRaise 已到 200
  // P2 剩 350: 全下到 360, 加注量 60 < minRaise 200 —— 不应重置 P0/P1 行动权
  p[2].stack = 350;
  eng.act(p[2].id, { type: 'allin' });
  ok(eng.currentBet === 350, 'short allin sets currentBet (got ' + eng.currentBet + ')');
  ok(eng.awaiting === p[0], 'action returns to first bettor (not reopened)');
  eng.act(p[0].id, { type: 'call' });
  eng.act(p[1].id, { type: 'call' });
  // P1: SB5+call5+flop300+call50=360, P2: BB10+allin350=360, P0: flop100+call250=350
  const posted = p.reduce((s, q) => s + q.contributed, 0);
  ok(posted === 1070, 'three-way pot (got ' + posted + ')');
}

/* ---------- 重买 ---------- */
section('rebuy');
{
  const eng = new PK.Engine(mkCfg('cash', 3), PK.mulberry32(13));
  eng.startHand();
  eng.players[0].stack = 0;
  eng.players[0].allIn = true;
  eng._finishHand({ pots: [] }); // 触发 busted 判定 -> sittingOut (需 dealt=true)
  ok(eng.players[0].sittingOut === true, 'busted player sits out');
  const buyinBefore = eng.players[0].totalBuyin;
  eng.rebuy(0);
  ok(eng.players[0].stack === 1000, 'rebuy restores stack');
  ok(eng.players[0].totalBuyin === buyinBefore + 1000, 'rebuy adds to totalBuyin');
  eng.startHand();
  ok(eng.players[0].dealt === true, 'rebuys back into next hand');
}

/* ---------- GTO 翻前范围表 ---------- */
section('gto');
{
  ok(PK.GTO.handClass([C(14, 0), C(13, 1)]) === 'AKo', 'handClass AKo');
  ok(PK.GTO.handClass([C(13, 0), C(13, 2)]) === 'KK', 'handClass KK');
  ok(PK.GTO.handClass([C(12, 1), C(11, 1)]) === 'QJs', 'handClass QJs');
  ok(PK.GTO.handClass([C(5, 0), C(2, 3)]) === '52o', 'handClass 52o');
  ok(PK.GTO.handClass([C(14, 2), C(5, 2)]) === 'A5s', 'handClass A5s');

  const tbl = PK.GTO.tables();
  ok(Object.keys(tbl.EP).length === 26, 'EP range = 26 classes');
  ok(Object.keys(tbl.MP).length === 40, 'MP range = 40 classes');
  ok(Object.keys(tbl.CO).length === 49, 'CO range = 49 classes');
  ok(Object.keys(tbl.BTN).length === 75, 'BTN range = 75 classes');
  ok(Object.keys(tbl.SB).length === 72, 'SB range = 72 classes');
  ok(tbl.BTN['K2s'] === true && tbl.EP['K2s'] === undefined, 'K2s: BTN raise, EP fold');
  ok(tbl.EP['AA'] === true && tbl.SB['72o'] === undefined, 'AA always in range, 72o never');
  ok(tbl.CO['A2s'] === true && tbl.MP['A2s'] === undefined, 'A2s: CO raise, MP fold');
  ok(tbl.MP['ATo'] === true && tbl.MP['A9o'] === undefined, 'ATo in MP, A9o not');
  ok(tbl.SB['T9o'] === true && tbl.BTN['T9o'] === undefined && tbl.BTN['T9s'] === true, 'T9o in SB only; BTN has T9s');
  // '+' 展开边界: 'K9s+' = K9s..KQs (不含 KK)
  const k9 = PK.GTO.parseRange('K9s+');
  ok(k9['K9s'] && k9['KTs'] && k9['KJs'] && k9['KQs'] && !k9['KK'], 'K9s+ expands to KQs, no pair');
  const p55 = PK.GTO.parseRange('55+');
  ok(p55['55'] && p55['AA'] && !p55['44'], '55+ expands to AA');

  // mock engine: 6 人桌, dealerIdx=3 -> 0=EP 1=MP 2=CO 3=BTN 4=SB 5=BB
  function mockEng(street, currentBet, heroHole) {
    const players = [];
    for (let i = 0; i < 6; i++) {
      players.push({ id: i, dealt: true, folded: false, out: false, hole: i === 0 ? heroHole : [C(2, 0), C(3, 1)], bet: 0, stack: 1000, hasActed: false });
    }
    return {
      street: street, currentBet: currentBet, bb: 10, dealerIdx: 3, players: players,
      legalActions: function (p) {
        const toCall = Math.max(0, this.currentBet - p.bet);
        return { toCall: toCall, canCheck: toCall <= 0, canCall: toCall > 0, canBet: toCall <= 0, canRaise: toCall > 0, potOdds: 0, potTotal: 0, isRaise: this.currentBet > 0 };
      }
    };
  }
  const adv = (street, cb, hole, dealerIdx) => {
    const e = mockEng(street, cb, hole);
    if (dealerIdx !== undefined) e.dealerIdx = dealerIdx;
    return PK.GTO.advice(e, 0);
  };
  ok(adv(0, 10, [C(14, 0), C(13, 0)]).act === 'raise' && adv(0, 10, [C(14, 0), C(13, 0)]).pos === 'EP', 'AKs EP -> raise');
  ok(adv(0, 10, [C(5, 0), C(4, 1)]).act === 'fold', '54o EP -> fold');
  ok(adv(0, 10, [C(2, 2), C(2, 3)]).act === 'fold', '22 not in EP range (starts 55)');
  ok(adv(0, 10, [C(2, 2), C(2, 3)], 2).act === 'raise', '22 in MP range');
  ok(adv(0, 10, [C(2, 2), C(2, 3)], 0) !== null && adv(0, 10, [C(2, 2), C(2, 3)], 0).pos === 'BTN' && adv(0, 10, [C(2, 2), C(2, 3)], 0).act === 'raise', 'dealerIdx=0 hero=BTN raises 22');
  ok(adv(0, 10, [C(7, 0), C(2, 1)]).act === 'fold', '72o EP -> fold');
  ok(adv(1, 0, [C(14, 0), C(13, 0)]) === null, 'postflop -> null');
  ok(adv(0, 30, [C(14, 0), C(13, 0)]) === null, 'facing raise -> null');
  ok(adv(0, 10, [C(14, 0), C(13, 0)]).cls === 'AKs', 'hand class carried in advice');
  // dealerIdx=4 -> hero(0)=BB -> 免费过牌
  const e4 = mockEng(0, 10, [C(14, 0), C(13, 0)]);
  e4.dealerIdx = 4;
  const b1 = PK.GTO.advice(e4, 0);
  ok(b1.pos === 'BB' && b1.act === 'check', 'BB unopened -> free check');
  // 单挑: dealerIdx=0 -> 0=BTN(SB) 1=BB
  const hu = mockEng(0, 10, [C(14, 0), C(13, 0)]);
  hu.players = [hu.players[0], hu.players[1]];
  hu.dealerIdx = 0;
  const h1 = PK.GTO.advice(hu, 0);
  ok(h1.pos === 'BTN' && h1.act === 'raise', 'HU dealer -> BTN chart raise');
  const h2 = PK.GTO.advice(hu, 1);
  ok(h2.pos === 'BB' && h2.act === 'check', 'HU BB -> check');
  // 3 人桌: dealerIdx=2 -> 2=BTN 0=SB 1=BB
  const t3 = mockEng(0, 10, [C(14, 0), C(13, 0)]);
  t3.players = [t3.players[0], t3.players[1], t3.players[2]];
  t3.dealerIdx = 2;
  const s1 = PK.GTO.advice(t3, 0);
  ok(s1.pos === 'SB' && s1.act === 'raise', '3max dealer+1 = SB uses SB chart');
  const s2 = PK.GTO.advice(t3, 1);
  ok(s2.pos === 'BB' && s2.act === 'check', '3max dealer+2 = BB check');
  // 混合策略频率: 纯加注=1, 边界牌 0~1, 弃牌=0; advice 按频率 >=0.5 选动作
  ok(PK.GTO.freq('EP', 'AA') === 1, 'EP AA freq = 1');
  ok(PK.GTO.freq('EP', 'KJs') === 1, 'EP KJs pure raise (inside KTs+)');
  ok(PK.GTO.freq('EP', 'A8s') > 0 && PK.GTO.freq('EP', 'A8s') < 1, 'EP A8s mixed freq in (0,1)');
  ok(PK.GTO.freq('EP', '72o') === 0, 'EP 72o freq = 0');
  ok(PK.GTO.freq('BTN', 'A6o') === 0.5 && PK.GTO.freq('SB', 'T8o') === 0.25, 'mixed table values read through');
  ok(PK.GTO.freq('MP', 'KJs') === 1, 'MP KJs pure raise (already in MP range)');
  // 混合牌的 advice: ATo EP 频率 0.5 >= 0.5 -> raise; K9s EP 0.35 -> fold
  const eM = mockEng(0, 10, [C(14, 0), C(10, 1)]); // ATo
  const m1 = PK.GTO.advice(eM, 0);
  ok(m1.act === 'raise' && m1.freq === 0.5, 'EP ATo mixed -> raise (freq 0.5)');
  const eF = mockEng(0, 10, [C(13, 0), C(9, 0)]); // K9s (EP mixed 0.35)
  const f1 = PK.GTO.advice(eF, 0);
  ok(f1.act === 'fold' && f1.freq === 0.35, 'EP K9s mixed 0.35 -> fold recommendation');
}

/* ---------- AI 面对全下的应对 ---------- */
section('ai vs allin');
{
  // hero 满码全下 60 次, 各风格 AI 不应全弃(Chen 硬阈值过紧的回归测试)
  const equitySim = (p, nOpp) => {
    const r = PK.Equity.simulate(p.hole, [], nOpp, [], 300, Math.random);
    return r.win + r.tie * 0.5;
  };
  const N = 60;
  const res = {};
  for (let i = 0; i < N; i++) {
    const eng = new PK.Engine(mkCfg('cash', 6), Math.random);
    eng.startHand();
    eng.act(0, { type: 'allin' });
    eng.handActive().forEach(q => {
      if (q.id === 0 || q.allIn) return;
      const d = PK.AI_decide(eng, q, pp => equitySim(pp, 1), Math.random);
      if (!res[q.styleKey]) res[q.styleKey] = { fold: 0, call: 0 };
      if (d.type === 'fold') res[q.styleKey].fold++;
      else res[q.styleKey].call++;
    });
  }
  Object.keys(res).forEach(k => {
    ok(res[k].call > 0, k + ' never calls a full-stack allin (fold ' + res[k].fold + ')');
  });
  // 松弱(FISH) 应比紧弱(ROCK) 更爱跟全下
  if (res.FISH && res.ROCK) {
    const fp = res.FISH.call / (res.FISH.call + res.FISH.fold);
    const rp = res.ROCK.call / (res.ROCK.call + res.ROCK.fold);
    ok(fp > rp, 'FISH call% (' + Math.round(fp * 100) + ') should exceed ROCK (' + Math.round(rp * 100) + ')');
  }
  // hero 短码(10BB) 全下: 总跟注数 > 0
  let shortCalls = 0;
  for (let i = 0; i < 30; i++) {
    const eng = new PK.Engine(mkCfg('cash', 6), Math.random);
    eng.startHand();
    eng.players[0].stack = 100 - eng.players[0].bet;
    eng.act(0, { type: 'allin' });
    eng.handActive().forEach(q => {
      if (q.id === 0 || q.allIn) return;
      const d = PK.AI_decide(eng, q, pp => equitySim(pp, 1), Math.random);
      if (d.type === 'call' || d.type === 'allin') shortCalls++;
    });
  }
  ok(shortCalls > 0, 'nobody ever calls a short allin');
}

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
