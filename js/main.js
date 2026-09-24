/* 主控制器: 串联引擎 / 3D 场景 / HUD / AI / LLM
 * 游戏流程: 大厅 → (开始) → 循环{发牌→下注→摊牌→发奖} → 结算
 */
(function () {
'use strict';
var PK = window.PK;

var App = {
  engine: null, scene: null, cfg: null,
  speed: 1, fastSpectate: false,
  deadCards: [], heroId: 0,
  equityResult: null, _eqHandle: null, _eqToken: 0,
  running: false
};

function delay(ms) {
  var s = App.speed * (App.fastSpectate ? 2.5 : 1);
  if (App.engine && App.engine.awaiting && App.engine.awaiting.isHuman) s = 1;
  return PK.TWEEN.wait(Math.max(30, ms / s));
}

/* ================= 启动 ================= */
document.addEventListener('DOMContentLoaded', function () {
  try {
    var p = localStorage.getItem('agentpoker.prefs');
    if (p === null) p = localStorage.getItem('pk3d.prefs'); // 旧项目名迁移
    if (p) Object.assign(PK.Hud.prefs, JSON.parse(p));
  } catch (e) { }
  PK.Hud.bindKeys();
  PK.Hud.initLobby(function (cfg) {
    startGame(cfg);
  });
});

function startGame(cfg) {
  App.cfg = cfg;
  App.speed = PK.Hud.prefs.speed || 1;
  App.fastSpectate = false;
  App.running = true;
  PK.AI_resetMood();

  App.engine = new PK.Engine(cfg, Math.random);
  var stage = document.getElementById('stage');
  if (App.scene) App.scene.destroy();
  PK.Hud.showGame(); // 先显示容器, 否则 #stage 尺寸为 0
  App.scene = new PK.Scene2D(stage, { mode: cfg.mode });
  App.scene.setSpeed(App.speed);
  PK.Hud.onSceneRefreshLang = function () {
    if (App.scene && App.scene.refreshLang) App.scene.refreshLang();
  };
  PK.Hud.initGame(App.engine, App.scene);
  PK.Hud.onSpeedChange = function (s) { App.speed = s; App.scene.setSpeed(s); };
  PK.Hud.onMenu = showMenu;
  PK.Hud.onAdviceRequest = requestAdvice;
  PK.Hud.onAdviceApply = applyAdvice;
  App.scene.buildPlayers(App.engine.players);
  PK.Hud.updateNameplates(App.engine);
  updateLLMStatus();

  var modeName = { cash: PK.t('现金局'), tourney: PK.t('锦标赛'), squid: PK.t('鱿鱼场') }[cfg.mode];
  var isEn = PK.I18N.lang === 'en';
  PK.Hud.banner(modeName + (isEn ? ' started' : ' 开始'), cfg.roster.length + (isEn ? ' players · stack ' : ' 名玩家 · 起始筹码 ') + PK.fmt(cfg.startStack), 'info', 2200);
  PK.Hud.log('<b>—— ' + modeName + (isEn ? ' started' : '开始') + ' ——</b>', 'sys');

  gameLoop().catch(function (e) {
    console.error(e);
    PK.Hud.toast('发生错误: ' + e.message, 'err', 6000);
  });
}

async function gameLoop() {
  var engine = App.engine;
  while (App.running && !engine.over) {
    await playHand();
    if (engine.over || !App.running) break;
    await handleRebuys();
    if (engine.over || !App.running) break;
    if (PK.Hud.prefs.review && App.handLog) {
      var choice = await PK.Hud.showHandEndChoice(App.handLog);
      if (!App.running || engine.over) break;
      if (choice === 'review') {
        await PK.Hud.showReview(App.handLog);
        if (!App.running || engine.over) break;
      }
      await delay(500);
    } else {
      await delay(1500);
    }
  }
  if (App.running && engine.over) {
    await delay(900);
    showResults();
  }
}

/* ================= 单手流程 ================= */
async function playHand() {
  var engine = App.engine;
  App.deadCards = [];
  var evs = engine.startHand();
  await processEvents(evs);
  var guard = 0;
  while (!engine.handOver && engine.phase !== 'done' && guard++ < 800) {
    if (engine.awaiting) {
      var p = engine.awaiting;
      var decision;
      if (p.isHuman) {
        PK.Hud.updateNameplates(engine);
        decision = await PK.Hud.showActionbar(engine.legalActions(p), p.name);
        PK.Hud.updateEquity(null);
      } else {
        decision = await aiDecide(p);
      }
      if (!App.running) return;
      var evs2 = engine.act(p.id, decision);
      PK.Hud.hideActionbar();
      await processEvents(evs2);
    } else {
      var evs3 = engine.step();
      await processEvents(evs3);
    }
  }
  PK.Hud.updateNameplates(engine);
}

/* ================= AI 决策 ================= */
function knownDeadFor(p) {
  // 公开信息: 亮出的弃牌 + 公共牌(在 simulate 里以 board 传入, dead 只含弃牌)
  return App.deadCards.filter(function (c) { return !(p.hole && (p.hole[0] === c || p.hole[1] === c)); });
}

function aiEquity(p) {
  var engine = App.engine;
  var nOpp = engine.handActive().filter(function (q) { return q.id !== p.id; }).length;
  if (!p.hole || p.hole.length < 2 || nOpp < 1) return 0.4;
  var r = PK.Equity.simulate(p.hole, engine.board, nOpp, knownDeadFor(p), 420, Math.random);
  return r.win + r.tie * 0.5;
}

async function aiDecide(p) {
  var engine = App.engine;
  App.scene.setThinking(p.id, true);
  PK.Hud.updateNameplates(engine);
  var think = 550 + Math.random() * 550 + engine.potTotal() / engine.bb * 4;
  var decision = PK.AI_decide(engine, p, aiEquity, Math.random);

  // LLM 咨询(按概率)
  if (PK.LLM.ready() && !engine.forced && Math.random() < PK.LLM.cfg.consultRate) {
    try {
      var eq = { win: aiEquity(p), tie: 0 };
      var t0 = Date.now();
      var llmAction = await PK.LLM.aiAction(engine, p.id, decision, eq);
      var norm = PK.LLM.normalize(engine, p.id, llmAction);
      if (norm) {
        var same = norm.type === decision.type && (!norm.amount || !decision.amount || Math.abs(norm.amount - decision.amount) < 1e-6);
        if (same || Math.random() < PK.LLM.cfg.influence) {
          decision = norm;
          PK.Hud.log(p.name + ' 🤖 咨询了大模型: ' + llmAction.reason, 'llm');
        }
      }
      updateLLMStatus();
    } catch (e) {
      PK.LLM.stats.fails++;
      updateLLMStatus();
    }
  }
  await delay(think);
  App.scene.setThinking(p.id, false);
  return decision;
}

/* ================= 事件处理 → 动画 ================= */
async function processEvents(evs) {
  for (var i = 0; i < evs.length; i++) {
    if (!App.running) return;
    await handleEvent(evs[i]);
  }
}

async function handleEvent(ev) {
  var engine = App.engine, scene = App.scene;
  switch (ev.type) {
    case 'handStart': {
      App.handLog = {
        handNo: ev.handNo, sb: ev.sb, bb: ev.bb, ante: ev.ante, level: ev.level,
        street: 0, board: [], streets: [], actions: [], awards: [], pots: [], elims: [],
        result: null,
        players: engine.players.map(function (p) {
          /* p.startStack 是引擎在手开始(盲注前)设置的; 此刻 p.stack 已被同步扣过盲注(事件数组滞后播放), 不能用 */
          return { id: p.id, name: p.name, isHero: !!p.isHuman, styleKey: p.styleKey, startStack: p.startStack, dealt: p.dealt };
        })
      };
      scene.clearHandVisuals();
      scene.resetAvatarStates();
      PK.Hud.clearBlindBadges();
      PK.Hud.clearAdvice();
      PK.Hud.hideRunoutBars();
      PK.Hud.vignette(false);
      PK.Hud.setTopbar(ev);
      PK.Hud.updateNameplates(engine);
      PK.Hud.updateTracker({ hero: [], board: [], dead: [] });
      await scene.moveDealerButton(ev.dealerId);
      if (ev.forced) { /* forcedStart 事件单独处理 */ }
      if (engine.cfg.mode === 'squid' && engine.handsUntilDeadline() === 1) {
        PK.Hud.banner('⏰ ' + PK.t('淘汰时钟'), PK.t('本手结束后淘汰最短码!'), 'danger', 1600);
      }
      break;
    }
    case 'post': {
      var p = engine.players[ev.playerId];
      if (App.handLog && (ev.kind === 'ante' || ev.kind === 'sb' || ev.kind === 'bb')) {
        App.handLog.actions.push({ street: 0, pid: ev.playerId, act: ev.kind, amount: ev.amount });
      }
      scene.setBet(ev.playerId, p.bet);
      PK.Hud.sfx('chip');
      PK.Hud.updateNameplates(engine);
      if (ev.kind === 'ante' || ev.kind === 'sb' || ev.kind === 'bb') {
        var kindName = { ante: PK.t('前注'), sb: PK.t('小盲'), bb: PK.t('大盲') }[ev.kind];
        if (ev.kind !== 'ante') {
          PK.Hud.setBlindBadge(ev.playerId, { sb: '小盲', bb: '大盲' }[ev.kind]); // 存 key, 渲染时按语言翻译
          PK.Hud.updateNameplates(engine);
        }
        PK.Hud.actionBubble(ev.playerId, kindName + ' ' + PK.fmt(ev.amount), 'post');
        PK.Hud.log('<span class="dim">' + p.name + '</span> ' + kindName + ' ' + PK.fmt(ev.amount));
      }
      break;
    }
    case 'dealHole': {
      var prom = scene.dealHole(ev.playerId, ev.card, ev.round, ev.faceUp);
      PK.Hud.sfx('deal');
      if (ev.faceUp) {
        scheduleEquity();
      }
      await PK.TWEEN.wait(90);
      ev._anim = prom;
      if (ev.round === 1) { /* 第二张 */ }
      break;
    }
    case 'action': {
      var pl = engine.players[ev.playerId];
      if (App.handLog) App.handLog.actions.push({ street: App.handLog.street, pid: ev.playerId, act: ev.action, amount: ev.amount || 0, to: ev.to || 0 });
      var names = { fold: PK.t('弃牌'), check: PK.t('过牌'), call: PK.t('跟注'), bet: PK.t('下注'), raise: PK.t('加注'), allin: PK.t('全下') };
      var text = names[ev.action];
      if (ev.action === 'call' || ev.action === 'bet' || ev.action === 'raise') text += ' ' + PK.fmt(ev.amount || ev.to || 0);
      if (ev.action === 'raise') text = PK.t('加注到') + ' ' + PK.fmt(ev.to);
      PK.Hud.actionBubble(ev.playerId, text, ev.action);
      var sounds = { fold: 'fold', check: 'check', call: 'chip', bet: 'chip', raise: 'chip', allin: 'chip' };
      PK.Hud.sfx(sounds[ev.action]);
      if (ev.action === 'fold') {
        scene.setAvatarState(ev.playerId, 'folded');
        await scene.muckCards(ev.playerId);
      } else {
        scene.setBet(ev.playerId, pl.bet);
      }
      PK.Hud.log('<span class="dim">' + pl.name + '</span> <b>' + text + '</b>', ev.action);
      PK.Hud.updateNameplates(engine);
      scheduleEquity();
      await PK.TWEEN.wait(120);
      break;
    }
    case 'foldShow': {
      App.deadCards = App.deadCards.concat(ev.cards);
      PK.Hud.log('<span class="dim">' + engine.players[ev.playerId].name + PK.t('亮牌弃牌: ') + PK.cardsName(ev.cards) + '</span>', 'dim');
      updateTrackerNow();
      break;
    }
    case 'street': {
      if (App.handLog) {
        App.handLog.street = ev.street;
        App.handLog.board = engine.board.slice();
        App.handLog.streets.push({ street: ev.street, cards: ev.cards.slice() });
      }
      await scene.collectBets();
      scene.setPot(engine.potTotal());
      await scene.dealCommunity(ev.cards);
      ev.cards.forEach(function (c) { PK.Hud.sfx('flip'); });
      var streetName = [PK.t('翻牌前'), PK.t('翻牌 🌟'), PK.t('转牌'), PK.t('河牌')][ev.street];
      PK.Hud.log('<b>—— ' + streetName + ' ' + PK.cardsName(engine.board) + ' ——</b>', 'street');
      PK.Hud.updateNameplates(engine);
      updateTrackerNow();
      scheduleEquity();
      await PK.TWEEN.wait(420);
      break;
    }
    case 'forcedStart': {
      PK.Hud.sfx('alarm');
      PK.Hud.vignette(true, true);
      PK.Hud.banner('⚡ ' + PK.t('最后时刻'), PK.t('鱿鱼规则: 全员强制全下摊牌!'), 'danger', 2600);
      scene.setCinematic(true);
      await PK.TWEEN.wait(1000);
      break;
    }
    case 'runoutReveal': {
      scene.setCinematic(true);
      var entries = ev.players.map(function (q) {
        return { playerId: q.playerId, name: engine.players[q.playerId].name, cards: q.cards };
      });
      var proms = ev.players.map(function (q, idx) {
        return PK.TWEEN.wait(idx * 160).then(function () {
          PK.Hud.sfx('flip');
          return scene.revealHole(q.playerId, q.cards);
        });
      });
      await Promise.all(proms);
      var hands = ev.players.map(function (q) { return q.cards; });
      var res = PK.Equity.multi(hands, engine.board, 1600, Math.random);
      PK.Hud.showRunoutBars(entries.map(function (e, idx) {
        return { playerId: e.playerId, name: e.name, cards: e.cards, win: res[idx].win, tie: res[idx].tie };
      }));
      PK.Hud.log('<b>—— ' + PK.t('全下摊牌') + ' ——</b>', 'street');
      await PK.TWEEN.wait(700);
      break;
    }
    case 'reveal': {
      if (!engine.revealed) {
        var proms2 = ev.players.map(function (q, idx) {
          return PK.TWEEN.wait(idx * 150).then(function () {
            PK.Hud.sfx('flip');
            return scene.revealHole(q.playerId, q.cards);
          });
        });
        await Promise.all(proms2);
      }
      ev.players.forEach(function (q) {
        PK.Hud.log('<span class="dim">' + engine.players[q.playerId].name + ':</span> ' + PK.cardsName(q.cards) + ' (' + q.catName + ')');
      });
      break;
    }
    case 'showdown': {
      if (App.handLog) App.handLog.pots = ev.pots;
      var main = ev.pots[ev.pots.length - 1];
      if (main && main.hand.length) {
        scene.highlightCards(main.hand[0].best5);
      }
      var wNames = ev.pots.map(function (pot) {
        return pot.winners.map(function (pid) { return engine.players[pid].name + (pot.winners.length > 1 ? PK.t('平分') : ''); }).join(' & ');
      }).join(', ');
      PK.Hud.banner(PK.t('摊牌'), PK.I18N.lang === 'en'
        ? wNames + ' wins with ' + (main && main.hand[0] ? main.hand[0].catName : '')
        : wNames + ' 以 ' + (main && main.hand[0] ? main.hand[0].catName : '') + PK.t('获胜'), 'win', 2200);
      await PK.TWEEN.wait(900);
      break;
    }
    case 'award': {
      var winner = engine.players[ev.playerId];
      if (App.handLog) App.handLog.awards.push({ pid: ev.playerId, amount: ev.amount, uncontested: !!ev.uncontested });
      scene.setBet(ev.playerId, 0);
      await scene.awardPot(ev.playerId, ev.amount);
      scene.setPot(0);
      PK.Hud.sfx('win');
      if (ev.amount > winner.startStack * 0.6 || ev.amount > engine.bb * 60) {
        scene.confetti(ev.playerId);
      }
      PK.Hud.log('<b>🏆 ' + winner.name + ' ' + PK.t('赢得') + ' ' + PK.fmt(ev.amount) + '</b>' + (ev.uncontested ? '(' + PK.t('无人跟注') + ')' : ''), 'win');
      PK.Hud.updateNameplates(engine);
      break;
    }
    case 'bounty': {
      var killer = engine.players[ev.playerId];
      PK.Hud.sfx('coin');
      PK.Hud.actionBubble(ev.playerId, '💀 ' + PK.t('赏金') + ' +' + PK.fmt(ev.amount), 'bounty');
      PK.Hud.log('<b>💀 ' + killer.name + ' ' + PK.t('击倒') + ' ' + engine.players[ev.victimId].name + ', ' + PK.t('获得赏金') + ' ' + PK.fmt(ev.amount) + '</b>', 'bounty');
      PK.Hud.updateNameplates(engine);
      break;
    }
    case 'eliminate': {
      var v = engine.players[ev.playerId];
      if (App.handLog) App.handLog.elims.push(ev.playerId);
      PK.Hud.sfx('elim');
      scene.piggyCoins(ev.playerId, engine.cfg.startStack);
      await scene.eliminate(ev.playerId, engine.cfg.mode === 'squid');
      PK.Hud.banner('💀 ' + v.name + ' ' + PK.t('被淘汰'), PK.t('第') + ' ' + ev.place + ' ' + PK.t('名'), 'danger', 1900);
      PK.Hud.log('<b>💀 ' + v.name + ' ' + PK.t('出局(第') + ev.place + PK.t('名') + ')</b>', 'elim');
      if (v.isHuman) {
        App.fastSpectate = true;
        PK.Hud.toast(PK.t('你已被淘汰 — 快进模拟剩余牌局…'), 'warn', 4000);
      }
      PK.Hud.updateNameplates(engine);
      break;
    }
    case 'deadline': {
      var dv = engine.players[ev.playerId];
      if (App.handLog) App.handLog.elims.push(ev.playerId);
      PK.Hud.sfx('elim');
      PK.Hud.sfx('coin');
      scene.piggyCoins(ev.playerId, ev.amount);
      await scene.eliminate(ev.playerId, true);
      PK.Hud.banner('⏰ ' + PK.t('时限到!'), PK.I18N.lang === 'en'
        ? dv.name + ' was force-eliminated (shortest stack) · pool +' + PK.fmt(ev.amount)
        : dv.name + PK.t('码量最短被强制淘汰 · 奖池 +') + PK.fmt(ev.amount), 'danger', 2600);
      PK.Hud.log('<b>⏰ ' + PK.t('鱿鱼时钟: ') + dv.name + PK.t('被强制淘汰, 存钱罐 +') + PK.fmt(ev.amount) + '</b>', 'elim');
      if (dv.isHuman) {
        App.fastSpectate = true;
        PK.Hud.toast(PK.t('你被鱿鱼时钟淘汰了…'), 'warn', 4000);
      }
      PK.Hud.updateNameplates(engine);
      break;
    }
    case 'levelUp': {
      PK.Hud.sfx('level');
      var lvSub = PK.I18N.lang === 'en'
        ? 'Level ' + ev.level + ' · ' + ev.sb + '/' + ev.bb + (ev.ante ? ' (ante ' + ev.ante + ')' : '')
        : '第 ' + ev.level + ' 级 · ' + ev.sb + '/' + ev.bb + (ev.ante ? ' (' + PK.t('前注') + ' ' + ev.ante + ')' : '');
      PK.Hud.banner(PK.t('盲注升级'), lvSub, 'info', 2000);
      PK.Hud.log('<b>⬆ ' + PK.t('盲注升级') + ': ' + lvSub + '</b>', 'sys');
      PK.Hud.setTopbar({ mode: engine.cfg.mode, handNo: engine.handNo, level: ev.level, sb: ev.sb, bb: ev.bb, ante: ev.ante, handsUntilDeadline: engine.handsUntilDeadline() });
      break;
    }
    case 'needRebuy': {
      // 在 handleRebuys 统一处理
      break;
    }
    case 'rebuy': {
      var rp = engine.players[ev.playerId];
      PK.Hud.log(rp.name + ' ' + PK.t('重新买入') + ' ' + PK.fmt(ev.amount), 'sys');
      PK.Hud.updateNameplates(engine);
      break;
    }
    case 'handEnd': {
      if (App.handLog) {
        App.handLog.result = ev.result || {};
        /* 终局快照: 盈亏须在手结束后立即记录(现金局重买会改 stack, 渲染时再算就错) */
        App.handLog.players.forEach(function (rp) {
          var p = engine.players[rp.id];
          if (p) { rp.endStack = p.stack; rp.folded = p.folded; rp.contributed = p.contributed; }
        });
      }
      scene.setCinematic(false);
      PK.Hud.vignette(false);
      var res = ev.result || {};
      var txt = (res.winners || []).map(function (w) { return engine.players[w.playerId].name + ' +' + PK.fmt(w.amount); }).join(', ');
      if (txt) PK.Hud.banner(PK.t('本手结束'), txt, 'info', 1400);
      PK.Hud.hideRunoutBars();
      PK.Hud.updateNameplates(engine);
      updateLLMStatus();
      break;
    }
    case 'gameOver': {
      App.gameOverData = ev;
      break;
    }
  }
}

/* ================= 重买(现金局) ================= */
async function handleRebuys() {
  var engine = App.engine;
  if (engine.cfg.mode !== 'cash') return;
  var need = engine.players.filter(function (p) { return p.sittingOut && !p.out; });
  for (var i = 0; i < need.length; i++) {
    var p = need[i];
    if (p.isHuman) {
      var answer = await PK.Hud.showRebuy(p.name);
      if (answer === 'yes') {
        engine.rebuy(p.id);
      } else {
        engine.standUp(p.id);
        App.running = false; // 结束场次
        showResults({ quit: true });
        return;
      }
    } else {
      await PK.TWEEN.wait(300);
      engine.rebuy(p.id);
    }
  }
}

/* ================= 胜率 ================= */
function updateTrackerNow() {
  var engine = App.engine;
  var hero = engine.players[App.heroId];
  PK.Hud.updateTracker({
    hero: hero.dealt && !hero.folded ? hero.hole : [],
    board: engine.board,
    dead: App.deadCards
  });
}

function scheduleEquity() {
  var engine = App.engine;
  var hero = engine.players[App.heroId];
  updateTrackerNow();
  if (App._eqHandle) App._eqHandle.cancel();
  if (!hero.dealt || hero.folded || !hero.hole || hero.hole.length < 2) {
    PK.Hud.updateEquity(null);
    App.equityResult = null;
    return;
  }
  var nOpp = Math.max(1, engine.handActive().filter(function (q) { return q.id !== App.heroId; }).length);
  var token = ++App._eqToken;
  var totalIters = 2200;
  var done = 0, win = 0, tie = 0;
  var heroCards = hero.hole.slice(), board = engine.board.slice(), dead = App.deadCards.slice();
  var legal = engine.awaiting === hero ? engine.legalActions(hero) : null;

  function chunk() {
    if (token !== App._eqToken) return;
    var r = PK.Equity.simulate(heroCards, board, nOpp, dead, 260, Math.random);
    win += r.win * r.iters; tie += r.tie * r.iters; done += r.iters;
    var res = { win: win / done, tie: tie / done, lose: 1 - (win + tie) / done, iters: done };
    var made = board.length ? PK.evalDetailed(heroCards.concat(board)).catName : null;
    PK.Hud.updateEquity(res, { nOpp: nOpp, potOdds: legal ? legal.potOdds : 0, madeHand: made });
    App.equityResult = res;
    if (done < totalIters) setTimeout(chunk, 0);
  }
  setTimeout(chunk, 0);

  // 自动建议
  if (PK.LLM.ready() && PK.LLM.cfg.autoAdvice && engine.awaiting === hero) {
    requestAdvice();
  }
}

/* ================= LLM 建议(人类) ================= */
async function requestAdvice() {
  var engine = App.engine;
  var hero = engine.players[App.heroId];
  if (!PK.LLM.ready()) {
    PK.Hud.toast(PK.t('请先在大厅配置大模型 API'), 'warn');
    return;
  }
  if (engine.awaiting !== hero) {
    PK.Hud.toast(PK.t('等待你的行动回合…'), 'warn');
    return;
  }
  PK.Hud.showAdviceLoading();
  PK.Hud.setLLMStatus('busy', PK.t('LLM 思考中…'));
  try {
    var t0 = Date.now();
    var advice = await PK.LLM.advice(engine, App.heroId, App.equityResult);
    advice.latency = (Date.now() - t0) + 'ms';
    PK.Hud.showAdvice(advice);
    PK.Hud.setLLMStatus('ok', PK.t('LLM 就绪 · ') + (PK.LLM.stats.lastLatency || 0) + 'ms');
  } catch (e) {
    PK.Hud.clearAdvice();
    PK.Hud.setLLMStatus('err', PK.t('LLM 错误: ') + String(e.message || e).slice(0, 60));
    PK.Hud.toast(PK.t('AI 建议失败: ') + String(e.message || e).slice(0, 100), 'err', 4200);
  }
}

function applyAdvice(advice) {
  var engine = App.engine;
  var norm = PK.LLM.normalize(engine, App.heroId, advice);
  if (norm && PK.Hud._actionResolve) {
    PK.Hud._done(norm);
  } else if (!PK.Hud._actionResolve) {
    PK.Hud.toast(PK.t('当前不是你的行动回合'), 'warn');
  } else {
    PK.Hud.toast(PK.t('建议已过期(牌面/下注已变化), 请重新获取'), 'warn');
  }
}

function updateLLMStatus() {
  if (!PK.LLM.cfg.enabled) { PK.Hud.setLLMStatus('off', PK.t('LLM 未启用 · 人机=风格+胜率+随机')); return; }
  if (!PK.LLM.ready()) { PK.Hud.setLLMStatus('off', PK.t('LLM 配置不完整')); return; }
  PK.Hud.setLLMStatus('ok', PK.I18N.lang === 'en'
    ? 'LLM: ' + PK.LLM.cfg.model + ' · calls: ' + PK.LLM.stats.calls
    : 'LLM: ' + PK.LLM.cfg.model + ' · 调用 ' + PK.LLM.stats.calls + ' 次');
}

/* ================= 菜单/结算 ================= */
function showMenu() {
  PK.Hud.modal(
    '<h3>' + PK.t('菜单') + '</h3><p>' + PK.t('当前进度将丢失(锦标赛无法保存)。') + '</p>' +
    '<label class="menu-check"><input type="checkbox" id="menu-review"' + (PK.Hud.prefs.review ? ' checked' : '') + '><span>' + PK.t('每局复盘') + ' <em class="dim">(' + PK.t('每手结束后询问: 下一局或复盘') + ')</em></span></label>' +
    '<div class="modal-btns"><button class="btn primary" data-close="resume">' + PK.t('继续游戏') + '</button>' +
    '<button class="btn" data-close="help">' + PK.t('玩法说明') + '</button>' +
    '<button class="btn danger" data-close="quit">' + PK.t('放弃并回大厅') + '</button></div>'
  ).then(function (r) {
    if (r === 'help') PK.Hud.showHelp();
    if (r === 'quit') {
      App.running = false;
      if (App.scene) { App.scene.destroy(); App.scene = null; }
      PK.Hud.showLobby();
    }
  });
  var cb = document.getElementById('menu-review');
  if (cb) cb.onchange = function () {
    PK.Hud.prefs.review = cb.checked;
    PK.Hud.savePrefs();
    var lob = document.getElementById('opt-review');
    if (lob) lob.checked = cb.checked;
  };
}

async function showResults(quitData) {
  var engine = App.engine;
  var ev = App.gameOverData || quitData || {};
  var hero = engine.players[App.heroId];
  var isEn = PK.I18N.lang === 'en';
  var title, sub, rows = [];

  if (engine.cfg.mode === 'cash' || ev.quit) {
    title = PK.t('现金局结算');
    sub = (isEn ? engine.handNo + ' hands' : '共 ' + engine.handNo + ' 手');
    engine.players.forEach(function (p) {
      if (!p.dealt && !p.sittingOut && !p.out) return;
      var net = p.stack - p.totalBuyin;
      rows.push({
        name: p.name, isHero: p.isHero, medal: net > 0 ? '📈' : net < 0 ? '📉' : '➖',
        main: (net >= 0 ? '+' : '') + PK.fmt(net), hands: p.stats.hands,
        vpip: p.stats.hands ? Math.round(p.stats.vpip / p.stats.hands * 100) + '%' : '—',
        styleTag: p.isHuman ? null : PK.t((PK.AI_STYLES[p.styleKey] || {}).label)
      });
    });
    rows.sort(function (a, b) { return b.name.localeCompare; });
  } else {
    var winnerName = engine.alive()[0] ? engine.alive()[0].name : '—';
    var heroPlace = hero.place || (hero.out ? hero.place : 1);
    title = (heroPlace === 1 ? PK.t('你赢了!') : PK.t('比赛结束'));
    sub = (isEn
      ? 'Champion: ' + winnerName + ' · ' + engine.handNo + ' hands · pool ' + PK.fmt(ev.pool || 0)
      : PK.t('冠军:') + ' ' + winnerName + ' · ' + PK.t('共') + ' ' + engine.handNo + ' ' + PK.t('手') + ' · ' + PK.t('总奖池') + ' ' + PK.fmt(ev.pool || 0));
    (ev.standings || []).forEach(function (s) {
      var p = engine.players[s.playerId];
      rows.push({
        name: p.name, isHero: p.isHuman, medal: s.place === 1 ? '🥇' : s.place === 2 ? '🥈' : s.place === 3 ? '🥉' : '' + s.place,
        main: (isEn ? '#' + s.place : '第' + s.place + PK.t('名')) + (s.prize ? ' · ' + PK.fmt(s.prize) : '') + (s.bounty ? ' · 💀' + s.bounty : ''),
        hands: p.stats.hands,
        vpip: p.stats.hands ? Math.round(p.stats.vpip / p.stats.hands * 100) + '%' : '—',
        styleTag: p.isHuman ? null : PK.t((PK.AI_STYLES[p.styleKey] || {}).label)
      });
    });
  }

  var answer = await PK.Hud.showResults({ title: title, sub: sub, rows: rows, mode: engine.cfg.mode });
  if (answer === 'restart') {
    startGame(App.cfg);
  } else {
    if (App.scene) { App.scene.destroy(); App.scene = null; }
    App.running = false;
    PK.Hud.showLobby();
  }
}

window.PK = PK;
})();
