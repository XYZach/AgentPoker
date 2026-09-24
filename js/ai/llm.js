/* LLM 集成: OpenAI 兼容接口 (/chat/completions)
 * - 给人类玩家的决策建议(附带本地胜率计算结果)
 * - 人机玩家在风格决策之上混合大模型意见(可调参与度)
 * 配置仅存 localStorage, 不上传任何服务器。
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : (global.PK = global.PK || {});

var PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: 'Moonshot', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '自定义…', baseUrl: '', model: '' }
];

var DEFAULT = {
  enabled: false,
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  consultRate: 0.3,   // AI 玩家 consult 概率
  influence: 0.6,     // LLM 与风格决策冲突时的采纳权重
  autoAdvice: false,  // 轮到人类时自动请求建议
  temperature: 0.7
};

var LLM = PK.LLM = {
  cfg: JSON.parse(JSON.stringify(DEFAULT)),
  presets: PRESETS,
  stats: { calls: 0, fails: 0, lastLatency: 0 },
  load: function () {
    try {
      var raw = localStorage.getItem('agentpoker.llm');
      if (raw === null) raw = localStorage.getItem('pk3d.llm'); // 旧项目名迁移
      if (raw) Object.assign(this.cfg, JSON.parse(raw));
    } catch (e) { }
  },
  save: function () {
    try { localStorage.setItem('agentpoker.llm', JSON.stringify(this.cfg)); } catch (e) { }
  },
  ready: function () { return this.cfg.enabled && this.cfg.baseUrl && this.cfg.apiKey && this.cfg.model; },

  _fetch: null,

  chat: async function (system, user, opts) {
    opts = opts || {};
    var t0 = Date.now();
    var fetchFn = this._fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) throw new Error('当前环境不支持 fetch');
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 15000);
    try {
      var res = await fetchFn(this.cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.cfg.apiKey },
        body: JSON.stringify({
          model: this.cfg.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          temperature: opts.temperature != null ? opts.temperature : this.cfg.temperature,
          max_tokens: opts.maxTokens || 500
        }),
        signal: ctrl.signal
      });
      var text = await res.text();
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 160));
      var data = JSON.parse(text);
      this.stats.calls++;
      this.stats.lastLatency = Date.now() - t0;
      var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('空回复');
      return content;
    } catch (e) {
      this.stats.fails++;
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  /* 从回复中提取 JSON(容忍 markdown 代码块/前后缀) */
  parseJSON: function (text) {
    var m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('回复中无 JSON');
    return JSON.parse(m[0].replace(/，/g, ',').replace(/：/g, ':'));
  },

  /* 把引擎状态序列化成中文描述(不含任何隐藏信息) */
  stateText: function (engine, forPlayerId, styleDesc) {
    var p = engine.players[forPlayerId];
    var lines = [];
    var modeName = { cash: '现金局', tourney: '锦标赛', squid: '鱿鱼场' }[engine.cfg.mode];
    lines.push('【德州扑克 ' + modeName + ' 第' + engine.handNo + '手】盲注 ' + engine.sb + '/' + engine.bb + (engine.ante ? ' 前注' + engine.ante : '') + (engine.cfg.mode !== 'cash' ? ' | 第' + (engine.level + 1) + '级别' : ''));
    if (engine.cfg.mode === 'squid' && engine.handsUntilDeadline() !== Infinity) {
      lines.push('鱿鱼淘汰时钟: 还有 ' + engine.handsUntilDeadline() + ' 手, 届时最短码将被强制淘汰');
    }
    lines.push('当前阶段: ' + engine.streetName());
    lines.push('公共牌: ' + (engine.board.length ? PK.cardsName(engine.board) : '无'));
    lines.push('你的手牌: ' + PK.cardsName(p.hole));
    lines.push('彩池: ' + engine.potTotal() + ' | 你本轮已下注 ' + p.bet + ' | 你的筹码 ' + p.stack);
    lines.push('玩家状态:');
    engine.players.forEach(function (q) {
      if (!q.dealt) return;
      var st = q.folded ? '已弃牌' : (q.allIn ? '全下' : (engine.awaiting === q ? '思考中' : '在场'));
      var sty = q.isHuman ? '' : '(' + (PK.AI_STYLES[q.styleKey] ? PK.AI_STYLES[q.styleKey].label : q.styleKey) + ')';
      lines.push('- ' + (q.id === forPlayerId ? '【你】' : q.name) + sty + ' 筹码' + PK.fmt(q.stack) + ' 本轮下注' + q.bet + ' [' + st + ']');
    });
    if (styleDesc) lines.push('你的既定风格: ' + styleDesc);
    return lines.join('\n');
  },

  /* 人类玩家建议 */
  advice: async function (engine, playerId, equityInfo) {
    var p = engine.players[playerId];
    var legal = engine.legalActions(p);
    var sys = '你是顶尖的德州扑克教练, 正在给人类玩家实时建议。基于胜率、底池赔率、筹码深度与位置给出最优决策。思考要果断简短。';
    var user = this.stateText(engine, playerId) +
      '\n蒙特卡洛胜率估算: 胜' + (equityInfo ? (equityInfo.win * 100).toFixed(1) + '%' : '未知') +
      ' 平' + (equityInfo ? (equityInfo.tie * 100).toFixed(1) + '%' : '') +
      '\n跟注需 ' + legal.toCall + ', 底池赔率要求胜率 ' + (legal.potOdds * 100).toFixed(1) + '%' +
      '\n可选动作: ' + [legal.canFold && '弃牌', legal.canCheck && '过牌', legal.canCall && ('跟注' + legal.callAmount), legal.canBet && '下注', legal.canRaise && '加注', p.stack > 0 && '全下'].filter(Boolean).join('/') +
      (legal.canRaise || legal.canBet ? '(下注/加注额度 ' + legal.minTo + '~' + legal.maxTo + ')' : '') +
      '\n\n只输出 JSON: {"action":"fold|check|call|bet|raise|allin","amount":数字(下注/加注到的总额),"reason":"40字内理由","confidence":0到100}';
    var txt = await this.chat(sys, user, { maxTokens: 400, temperature: 0.4 });
    var obj = this.parseJSON(txt);
    return {
      action: String(obj.action || '').toLowerCase(),
      amount: Number(obj.amount) || 0,
      reason: String(obj.reason || '').slice(0, 120),
      confidence: Math.max(0, Math.min(100, Number(obj.confidence) || 60))
    };
  },

  /* 人机玩家咨询: 附带本地风格决策供参考 */
  aiAction: async function (engine, playerId, styleDecision, equityInfo) {
    var p = engine.players[playerId];
    var style = PK.AI_STYLES[p.styleKey] || PK.AI_STYLES.BAL;
    var legal = engine.legalActions(p);
    var sys = '你在一场德州扑克中扮演人机玩家 "' + p.name + '", 风格是' + style.label + '(' + style.desc + ')。' +
      '请在保持该风格的前提下, 结合胜率与赔率做出决策。风格与胜率冲突时可适度偏离。';
    var user = this.stateText(engine, playerId, style.label + ' — ' + style.desc) +
      '\n你的蒙特卡洛胜率: ' + (equityInfo ? (equityInfo.win * 100).toFixed(1) + '%' : '未知') +
      '\n本地风格算法的倾向: ' + JSON.stringify(styleDecision) +
      '\n跟注需 ' + legal.toCall + ', 底池赔率 ' + (legal.potOdds * 100).toFixed(1) + '%' +
      '\n\n只输出 JSON: {"action":"fold|check|call|bet|raise|allin","amount":数字(下注/加注到的总额),"reason":"20字内"}';
    var txt = await this.chat(sys, user, { maxTokens: 300, temperature: 0.8 });
    var obj = this.parseJSON(txt);
    return { action: String(obj.action || '').toLowerCase(), amount: Number(obj.amount) || 0, reason: String(obj.reason || '').slice(0, 80) };
  },

  /* 教练赛后点评: 复盘弹窗里对整手牌的分析(只用公开信息+已亮出的牌) */
  coach: async function (engine, playerId, handLog) {
    var p = engine.players[playerId];
    var modeName = { cash: '现金局', tourney: '锦标赛', squid: '鱿鱼场' }[engine.cfg.mode];
    var L = [];
    L.push('【复盘请求: ' + modeName + ' 第' + handLog.handNo + '手】盲注 ' + handLog.sb + '/' + handLog.bb +
      (handLog.ante ? ' 前注' + handLog.ante : ''));
    L.push('公共牌: ' + (function () {
      var s = [];
      handLog.streets.forEach(function (st) {
        s.push(['翻牌前', '翻牌', '转牌', '河牌'][st.street] + ' ' + PK.cardsName(st.cards));
      });
      return s.length ? s.join(' | ') : '(翻牌前结束)';
    })());
    L.push('你的手牌: ' + PK.cardsName(p.hole));
    handLog.players.forEach(function (rp) {
      if (!rp.dealt || rp.isHero) return;
      var st = rp.folded ? '弃牌' : (rp.out ? '出局' : '跟到结束');
      L.push('对手 ' + rp.name + '(' + (PK.AI_STYLES[rp.styleKey] ? PK.AI_STYLES[rp.styleKey].label : rp.styleKey) + '): ' + st);
    });
    L.push('你的决策时间线(含当时胜率与底池赔率):');
    (handLog.decisions || []).forEach(function (d) {
      L.push('- ' + ['翻牌前', '翻牌', '转牌', '河牌'][d.street] + ': ' +
        ({ fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注', allin: '全下' }[d.act] || d.act) +
        (d.amount ? ' ' + d.amount : '') +
        (d.eq ? ' (胜率 ' + Math.round((d.eq.win + d.eq.tie / 2) * 100) + '%' +
          (d.potOdds > 0 ? ' 需' + Math.round(d.potOdds * 100) + '%' : '') + ')' : '') +
        ' (当时公共牌: ' + (d.board.length ? PK.cardsName(d.board) : '无') + ')');
    });
    var awardTxt = (handLog.awards || []).map(function (aw) {
      return engine.players[aw.pid].name + ' +' + aw.amount;
    }).join(', ');
    L.push('本手结果: ' + (awardTxt || '无人赢池'));
    var sys = '你是德州扑克教练, 正在赛后复盘一手牌。请犀利简短地分析: 逐个点评玩家(人类)的关键决策是否合理(结合胜率与赔率), 指出最大的一个失误或最值得肯定的一手, 并给一条可执行的建议。总字数不超过 220 字, 用中文。';
    var user = L.join('\n') + '\n\n直接输出点评文字, 不要 JSON, 不要 markdown 标题。';
    var txt = await this.chat(sys, user, { maxTokens: 600, temperature: 0.5 });
    return txt.trim().slice(0, 600);
  },

  /* 把 LLM 动作规范化为引擎合法动作(非法则返回 null) */
  normalize: function (engine, playerId, llmAction) {
    var p = engine.players[playerId];
    var legal = engine.legalActions(p);
    var a = llmAction.action;
    if (a === 'fold' && legal.canFold) return { type: 'fold' };
    if (a === 'check' && legal.canCheck) return { type: 'check' };
    if (a === 'call' && legal.canCall) return { type: 'call' };
    if (a === 'allin' || a === 'all-in' || a === 'all in') return { type: 'allin' };
    if ((a === 'bet' || a === 'raise') && (legal.canBet || legal.canRaise)) {
      var to = Math.round(Number(llmAction.amount) || 0);
      if (!(to >= legal.minTo)) to = legal.minTo;
      if (to > legal.maxTo) to = legal.maxTo;
      return { type: legal.isRaise ? 'raise' : 'bet', amount: to };
    }
    return null;
  },

  test: async function () {
    var out = await this.chat('你是测试助手', '回复一个JSON: {"ok":true}', { maxTokens: 50, timeout: 12000 });
    var obj = this.parseJSON(out);
    if (!obj.ok) throw new Error('返回异常: ' + out.slice(0, 80));
    return true;
  }
};

LLM.load();
if (typeof window !== 'undefined') window.PK = PK; else global.PK = PK;
})();
