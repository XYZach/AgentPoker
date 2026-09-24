/* 压力测试: AI 加注尺寸原则 + AI-vs-AI 全流程对局守恒律
 * 用法: node tests/stress.js   (SEED=n 可复现, 默认随机种子)
 * 与 run-tests.js 互补: 覆盖 v29 尺寸原则与整场模拟不变量
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = { window: undefined, global: {}, console, Math, setTimeout, performance: { now: () => Date.now() } };
ctx.global = ctx;
vm.createContext(ctx);
for (const f of ['js/core/cards.js', 'js/core/equity.js', 'js/core/engine.js', 'js/core/gto.js', 'js/ai/aiplayer.js']) {
  let code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  if (f.indexOf('aiplayer') >= 0) {
    /* 把静默吞异常改成计数, fuzz 中断言零异常 */
    /* mood 微调用 Math.random 会让同种子结果不稳定, 固定为中点 1.0 */
    code = code.replace('0.9 + Math.random() * 0.2', '1.0');
    code = code.replace("} catch (err) {\n    return { type: 'check' };",
      "} catch (err) {\n    global.__aiErrors = (global.__aiErrors || 0) + 1;\n    if (global.__aiErrors < 4) console.error('AIERR:', err && err.stack);\n    return { type: 'check' };");
  }
  vm.runInContext(code, ctx, { filename: f });
}
const PK = ctx.PK;
const C = (r, s) => (r << 2) | s;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL:', msg); }
}
function section(name) { console.log('== ' + name + ' =='); }

const SEED = Number(process.env.SEED) || (Date.now() % 2147483647);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);

/* ---------- 1. AI 加注尺寸原则 (v29) ---------- */
section('ai sizing principles');

function mkEng(currentBet, heroBet, limpers, opener, cold) {
  const players = [];
  for (let i = 0; i < 6; i++) {
    players.push({ id: i, name: 'P' + i, dealt: true, folded: false, out: false, allIn: false,
      hole: i === 0 ? [C(14, 0), C(14, 1)] : [C(2, i % 4), C(3, (i + 1) % 4)],
      bet: 0, stack: 2000, hasActed: false, styleKey: 'BAL', stats: { vpip: 0, pfr: 0, raises: 0, hands: 0, handsWon: 0, biggestPot: 0, sd: 0, sdWon: 0 } });
  }
  players[0].bet = heroBet;
  players[5].bet = 5;
  if (!opener) {
    for (let i = 0; i < limpers; i++) { players[2 + i].bet = 10; players[2 + i].hasActed = true; }
  } else {
    players[2].bet = currentBet; players[2].hasActed = true;
    if (cold) { players[3].bet = currentBet; players[3].hasActed = true; players[4].bet = currentBet; players[4].hasActed = true; }
  }
  return {
    handNo: 1, street: 0, bb: 10, sb: 5, ante: 0, dealerIdx: 4, currentBet, minRaise: 10,
    board: [], cfg: { mode: 'cash' }, events: [], players,
    alive() { return players.filter(q => !q.out); },
    handActive() { return players.filter(q => q.dealt && !q.folded && !q.out); },
    potTotal() { return players.reduce((s, q) => s + q.bet, 0); },
    streetName() { return 'preflop'; },
    handsUntilDeadline() { return Infinity; },
    nextDealt(i) { return (i + 1) % players.length; },
    legalActions(p) {
      const toCall = Math.max(0, this.currentBet - p.bet);
      const maxTo = p.bet + p.stack;
      const minTo = this.currentBet === 0 ? Math.min(this.bb, maxTo) : Math.min(this.currentBet + this.minRaise, maxTo);
      return { toCall, canFold: true, canCheck: toCall <= 0, canCall: toCall > 0, callAmount: Math.min(toCall, p.stack), canBet: toCall <= 0 && p.stack > 0, canRaise: p.stack > toCall, minTo, maxTo, potTotal: this.potTotal(), potOdds: toCall > 0 ? toCall / (this.potTotal() + toCall) : 0, street: 0, isRaise: this.currentBet > 0 };
    },
    act(pid, d) {
      const p = players[pid];
      const legal = this.legalActions(p);
      if (d.type === 'raise' || d.type === 'bet') {
        const to = Math.max(legal.minTo, Math.min(d.amount, legal.maxTo));
        p.bet = to; this.currentBet = Math.max(this.currentBet, to); p.hasActed = true;
        return [{ action: 'raise', to }];
      }
      p.hasActed = true;
      return [];
    },
    emit() {},
  };
}

function probe(mk) {
  const tos = [];
  for (let k = 0; k < 200; k++) {
    const e = mk();
    const d = PK.AI_decide(e, e.players[0], () => 0.9, rng);
    if (d.type === 'raise' || d.type === 'bet') tos.push(d.amount);
  }
  return tos;
}
const avg = a => a.reduce((s, t) => s + t, 0) / a.length;

let a = probe(() => mkEng(10, 10, 0, false, false));
ok(a.length > 0 && a.every(t => t >= 24 && t <= 34), 'open: 2.4~3.4bb, got ' + JSON.stringify(a.slice(0, 8)));
let b = probe(() => mkEng(10, 10, 2, false, false));
ok(b.length > 0 && b.every(t => t >= 44 && t <= 53), 'open+2limp: 4.4~5.3bb, got ' + JSON.stringify(b.slice(0, 8)));
ok(avg(b) > avg(a) + 15, 'limp adds ~1bb each: ' + avg(a).toFixed(1) + ' -> ' + avg(b).toFixed(1));
let c = probe(() => mkEng(30, 0, 0, true, false));
ok(c.length > 0 && c.every(t => t >= 88 && t <= 115), '3bet: ~3x of 30, got ' + JSON.stringify(c.slice(0, 8)));
let d = probe(() => mkEng(30, 0, 0, true, true));
ok(d.length > 0 && avg(d) > avg(c) + 15 && avg(d) < avg(c) + 25, 'cold callers add ~1bb each: ' + avg(c).toFixed(1) + ' -> ' + avg(d).toFixed(1));

/* ---------- 2. AI-vs-AI 整场模拟: 守恒律 + 合法性 ----------
 * 驱动协议与 main.js 一致: awaiting 时 act, awaiting 空且手未完时 step()
 * (act 只推进下注轮; 翻街/摊牌/runout 由 step 驱动)
 */
section('ai full-game simulation');

const MODES = ['cash', 'tourney', 'squid'];
const STYLES = ['TAG', 'LAG', 'ROCK', 'FISH', 'BAL', 'MANIAC'];
let totalHands = 0, totalRaises = 0, badConservation = 0, badNaN = 0, illegal = 0, sizingBad = 0, stuckHands = 0;
const consDbg = [];

for (let g = 0; g < 12; g++) {
  const mode = MODES[g % 3];
  const cfg = {
    mode,
    startStack: 1500,
    roster: [0, 1, 2, 3, 4, 5].map(i => ({ name: 'P' + i, isHuman: false, styleKey: STYLES[(g + i) % 6] })),
    cash: mode === 'cash' ? { sb: 10, bb: 20 } : undefined,
    tourney: mode === 'tourney' ? { handsPerLevel: 8 } : undefined,
    squid: mode === 'squid' ? { deadlineHands: 10, forcedShowdown: true, bounty: true, bountyAmount: 500, deadlineUntilHU: true, winnerTakeAll: true } : undefined
  };
  const e = new PK.Engine(cfg, rng);
  let hands = 0;
  while (!e.over && hands < 150) {
    e.startHand();
    hands++; totalHands++;
    const total0 = e.players.reduce((s, p) => s + p.stack + p.contributed, 0) + (e.piggyTotal || 0);
    let guard = 0, handDone = false;
    while (guard++ < 300 && !handDone) {
      if (e.awaiting) {
        const p = e.awaiting;
        const legal = e.legalActions(p);
        const d = PK.AI_decide(e, p, () => 0.2 + rng() * 0.6, rng);
        const types = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
        if (types.indexOf(d.type) < 0) illegal++;
        if ((d.type === 'raise' || d.type === 'bet') && typeof d.amount === 'number') {
          if (d.amount < legal.minTo - 0.5 || d.amount > legal.maxTo + 0.5) illegal++;
        }
        if (e.street === 0 && (d.type === 'raise' || d.type === 'bet') && typeof d.amount === 'number'
            && d.type !== 'allin' && d.amount < legal.maxTo - 0.5) { /* 全下/贴全下被 clamp, 不适用尺寸原则 */
          const cb = e.currentBet, bb = e.bb;
          const nIn = e.players.filter(q => q.id !== p.id && q.dealt && !q.folded && q.hasActed && q.bet >= bb && q.bet <= cb).length; /* limper=平跟到 cb */
          if (cb <= bb) {
            const lo = 2.0 * bb, hi = (3.8 + nIn) * bb + 1.5; /* open or raise-over-limpers (3.3~3.7x + 1bb each) */
            if (d.amount >= lo && d.amount <= hi) { totalRaises++; }
            else { sizingBad++; if (consDbg.length < 5) consDbg.push({ kind: 'size', amt: d.amount, cb, bb, nIn }); }
          } else {
            const ratio = d.amount / cb;
            if (ratio < 2.4 || ratio > 4.6) { sizingBad++; if (consDbg.length < 5) consDbg.push({ kind: 'reraise', amt: d.amount, cb, bb, ratio }); }
            else totalRaises++;
          }
        }
        const ret = e.act(p.id, d);
        if (ret.some(ev => Number.isNaN(ev.amount) || Number.isNaN(ev.to))) badNaN++;
      } else {
        if (e.phase === 'done') break;
        if (e.lastHandResult) { handDone = true; break; } /* 本手已结束(发奖完成) */
        e.step();
      }
      /* NaN 状态检查 */
      e.players.forEach(p2 => { if (Number.isNaN(p2.stack) || Number.isNaN(p2.bet) || Number.isNaN(p2.contributed)) badNaN++; });
      /* 守恒: 仅手内(发奖后 contributed 残留到下一手 startHand 才清, 不算违规) */
      if (!e.lastHandResult) {
        const totalNow = e.players.reduce((s, q) => s + q.stack + q.contributed, 0) + (e.piggyTotal || 0);
        if (Math.abs(totalNow - total0) > 0.5) {
          badConservation++;
          if (consDbg.length < 5) consDbg.push({ kind: 'cons', mode, hand: e.handNo, d0: total0, d1: totalNow, piggy: e.piggyTotal, players: e.players.map(q => q.id + ':' + q.stack + '/' + q.contributed).join(' ') });
        }
      }
    }
    if (!handDone && !e.over && guard >= 300) stuckHands++;
  }
  if (mode !== 'cash') ok(hands < 150 || e.over, 'game terminates: mode=' + mode + ' hands=' + hands);
}

ok(stuckHands === 0, 'no stuck hands in driver (' + stuckHands + ')');
ok(badNaN === 0, 'no NaN in engine state (' + badNaN + ')');
ok(badConservation === 0, 'chip conservation holds every step (' + badConservation + ' violations in ' + totalHands + ' hands)');
ok(illegal === 0, 'all AI actions legal (' + illegal + ' illegal)');
ok(sizingBad === 0, 'all preflop raises in principled band (' + sizingBad + ' bad of ' + totalRaises + ')');
ok(!ctx.__aiErrors, 'AI_decide never threw (' + (ctx.__aiErrors || 0) + ' exceptions)');
if (consDbg.length) console.log('DBG:', JSON.stringify(consDbg.slice(0, 3)));
console.log('  (seed ' + SEED + ', simulated ' + totalHands + ' hands, ' + totalRaises + ' preflop raises checked)');

console.log('RESULT:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
