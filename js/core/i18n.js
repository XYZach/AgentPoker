/* i18n: 中英双语, 默认中文。key = 中文原文, en 字典提供英文映射。
 * 用法: PK.t('弃牌') / PK.t('{name} 赢得 {amt}', {name:'老K', amt:100})
 * 静态 HTML: 元素加 data-i18n="中文" 或 data-i18n-ph="中文"(placeholder)
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? (window.PK = window.PK || {}) : (global.PK = global.PK || {});

var EN = {
  /* 文档/大厅 */
  'AgentPoker — 德州扑克 · 现金局 · 锦标赛 · 鱿鱼场': 'AgentPoker — Texas Hold\'em · Cash · Tournament · Squid',
  '经典 2D 牌桌 · 蒙特卡洛胜率 · 记牌器 · 六种 AI 风格 · 可接入大模型 API': 'Classic 2D table · Monte-Carlo equity · Card tracker · 6 AI styles · LLM API integration',
  '现金局': 'Cash Game',
  '盲注固定 · 输光随时重买 · 随时离座': 'Fixed blinds · rebuy anytime · leave anytime',
  '适合练习与长session统计盈亏': 'Great for practice and session stats',
  '锦标赛': 'Tournament',
  '盲注逐级上升 · 输光即淘汰': 'Rising blinds · bust out and you\'re done',
  '打到只剩一人 · 前三名分享奖池': 'Last one standing · top 3 split the prize',
  '鱿鱼场': 'Squid Game',
  '锦标赛 + 淘汰时钟:每 N 手强制淘汰最短码': 'Tournament + elimination clock: shortest stack busts every N hands',
  '最后一手全员强制摊牌 · 击倒得赏金 · 奖池存进小猪罐': 'Final hand forced showdown · knockout bounties · prizes go to the piggy bank',
  '基础设置': 'Basic Setup',
  '玩家人数': 'Players',
  '起始筹码': 'Starting Stack',
  '亮出弃牌': 'Reveal Folds',
  '学习模式:弃牌记入记牌器与日志(动画永不亮牌面)': 'Study mode: folded cards enter the tracker & log (never shown face-up)',
  '现金局参数': 'Cash Game Setup',
  '小盲': 'Small Blind',
  '输光后可选择重新买入或结束场次': 'When busted, rebuy or end the session',
  '锦标赛参数': 'Tournament Setup',
  '每级手数': 'Hands per Level',
  '5 手/级 (快速)': '5 hands/level (fast)',
  '8 手/级 (标准)': '8 hands/level (standard)',
  '12 手/级 (慢速)': '12 hands/level (slow)',
  '奖池 = 人数 × 买入,前三名 50%/30%/20%': 'Prize pool = players × buy-in, top 3 get 50%/30%/20%',
  '🦑 鱿鱼场规则': '🦑 Squid Game Rules',
  '淘汰时钟': 'Elimination Clock',
  '每 4 手': 'Every 4 hands',
  '每 6 手': 'Every 6 hands',
  '每 10 手': 'Every 10 hands',
  '最终摊牌': 'Final Showdown',
  '硬核:时钟到点的那一手全员强制全下(一锤子买卖)': 'Hardcore: when the clock hits zero, everyone is forced all-in',
  '击倒赏金': 'Knockout Bounty',
  '淘汰对手立即获得买入一半的赏金筹码': 'Knock out a player to instantly win half their buy-in',
  '决赛圈停表': 'Heads-up Freeze',
  '只剩 2 人时停止时钟': 'Clock stops when 2 players remain',
  '玩家阵容': 'Player Lineup',
  '给每个人机设置风格': 'Set a style for each AI player',
  '🤖 大模型 API': '🤖 LLM API',
  'OpenAI 兼容接口 · 仅保存在本地浏览器': 'OpenAI-compatible endpoint · stored locally in your browser only',
  '启用大模型 — 给你实时决策建议,并按比例参与人机玩家的决策': 'Enable LLM — real-time advice for you, and weighted input into AI decisions',
  '服务商预设': 'Provider Preset',
  '模型': 'Model',
  'API Base URL': 'API Base URL',
  'API Key': 'API Key',
  '人机咨询大模型的比例(每手随机)': 'Share of AI decisions consulting the LLM (random per hand)',
  '大模型话语权(与风格算法冲突时)': 'LLM influence (when it disagrees with the style engine)',
  '轮到我时自动请求建议(消耗更多 token)': 'Auto-request advice on my turn (uses more tokens)',
  '测试连接': 'Test Connection',
  '当前自定义': 'Custom',
  '开 始 游 戏': 'START GAME',

  /* 游戏 HUD */
  '记牌器': 'Card Tracker',
  '弃牌死牌': 'Dead (folded)',
  '你的牌': 'Your cards', '公共牌': 'Board', '弃牌': 'Fold',
  '死牌会从胜率模拟中剔除': 'Dead cards are excluded from equity simulation',
  '实时胜率': 'Live Equity', '蒙特卡洛': 'Monte-Carlo',
  '等待手牌…': 'Waiting for a hand…',
  '胜': 'Win', '平': 'Tie', '负': 'Lose',
  '需跟注': 'To call', '底池赔率需胜率': 'Pot odds need', '快捷键 F/C/R/A/D': 'Hotkeys F/C/R/A/D',
  '过牌': 'Check', '跟注': 'Call', '加注': 'Raise', '全下': 'All-in',
  '最小': 'Min', '⅓池': '⅓ Pot', '½池': '½ Pot', '1池': 'Pot',
  '牌局记录': 'Hand History',
  '中 / EN': '中 / EN',

  /* 顶栏/铭牌/状态 */
  '手': 'hands',
  '盲注': 'Blinds', '级别': 'Level', '前注': 'ante',
  '⏰ 下一手淘汰!': '⏰ Elimination next hand!',
  '⏱ 淘汰时钟': '⏱ Clock',
  '你': 'You', '我': 'Me',
  '出局': 'out', '等待重买': 'Awaiting rebuy',
  '由你操作 · AI 可给你建议': 'Played by you · AI can advise',

  /* 动作/街名 */
  '下注': 'Bet', '加注到': 'Raise to',
  '翻牌前': 'Preflop', '翻牌 🌟': 'Flop 🌟', '转牌': 'Turn', '河牌': 'River',
  '摊牌': 'Showdown', '全下摊牌': 'All-in Showdown',
  '前注': 'Ante', '大盲': 'Big Blind',

  /* 胜率面板 */
  '次模拟': 'sims', '名对手': 'opponents',
  '底池赔率: 需': 'Pot odds: need', '胜率': 'equity',
  '✓ 值得跟': '✓ Worth calling', '✗ 跟注亏': '✗ -EV call',
  '当前无需跟注': 'No call needed right now',
  '当前成牌: ': 'Made hand: ',

  /* 日志/banner/toast */
  '赢得': 'wins', '无人跟注': 'uncontested',
  '击倒': 'knocked out', '获得赏金': 'bounty won',
  '出局(第': 'busted (', '被强制淘汰, 存钱罐 +': 'force-eliminated, piggy +',
  '亮牌弃牌: ': 'showed fold: ',
  '重新买入': 'rebuys',
  '本手结束': 'Hand over',
  '被淘汰': 'eliminated', '第': '#', '名': '',
  '码量最短被强制淘汰 · 奖池 +': 'shortest stack busts · pool +',
  '盲注升级': 'Blinds Up',
  '最后时刻': 'FINAL HAND',
  '鱿鱼规则: 全员强制全下摊牌!': 'Squid rule: everyone forced all-in!',
  '以': 'wins with',
  '获胜': '', '平分': ' (split)',
  '现金局开始': 'Cash game started', '锦标赛开始': 'Tournament started', '鱿鱼场开始': 'Squid game started',
  '名玩家 · 起始筹码': 'players · starting stack',
  '你已被淘汰 — 快进模拟剩余牌局…': 'You are eliminated — fast-forwarding the rest…',
  '你被鱿鱼时钟淘汰了…': 'The squid clock got you…',
  '请先在大厅配置大模型 API': 'Configure the LLM API in the lobby first',
  '等待你的行动回合…': 'Waiting for your turn…',
  '当前不是你的行动回合': 'Not your turn right now',
  '建议已过期(牌面/下注已变化), 请重新获取': 'Advice expired (board/bets changed), please re-request',
  'LLM 思考中…': 'LLM thinking…',
  'LLM 就绪 · ': 'LLM ready · ',
  'LLM 错误: ': 'LLM error: ',
  'AI 建议失败: ': 'AI advice failed: ',
  'LLM 未启用 · 人机=风格+胜率+随机': 'LLM off · AI = style + equity + noise',
  'LLM 配置不完整': 'LLM config incomplete',
  'LLM: ': 'LLM: ', ' 调用': ' calls: ',
  'AI 建议': 'AI Advice', '置信度': 'Confidence', '采纳': 'Apply', '思考中…': 'Thinking…',

  /* 菜单/弹窗/结算 */
  '菜单': 'Menu', '当前进度将丢失(锦标赛无法保存)。': 'Current progress will be lost (tournaments cannot be saved).',
  '继续游戏': 'Resume', '玩法说明': 'How to Play', '放弃并回大厅': 'Quit to Lobby',
  '玩法与功能': 'How to Play',
  '三种模式': 'Three modes',
  '记牌器(左栏)': 'Card tracker (left)',
  '胜率(右栏)': 'Equity (right)',
  'AI 决策': 'AI decisions',
  '快捷键': 'Hotkeys',
  '公平性: AI 与建议只用公开信息+自身手牌, 绝不偷看牌堆。': 'Fair play: the AI and advice only use public information plus their own cards — never the deck.',
  '筹码耗尽': 'Out of Chips',
  '的筹码已输光。重新买入回到牌桌吗？': ' is out of chips. Rebuy and return to the table?',
  '离座(结束场次)': 'Leave (end session)',
  '玩家': 'Player', '盈亏': 'Net', '名次/奖金': 'Rank/Prize', '手数': 'Hands', '入池率': 'VPIP',
  '再来一局': 'Play Again', '回到大厅': 'Back to Lobby',
  '现金局结算': 'Cash Session Results',
  '共': '', '比赛结束': 'Tournament Over', '你赢了!': 'You Win! 🏆',
  '冠军:': 'Champion:', '总奖池': 'Prize pool',
  '共 6 手': '6 hands total',

  /* 场景 */
  '弃牌堆': 'Muck',
  '彩池': 'Pot', '荷官': 'Dealer', '奖池': 'Prize pool',
  '赏金': 'Bounty', '时限到!': 'Time\'s up!',

  /* 每局复盘 */
  '每局复盘': 'Hand Review', '风格': 'Style',
  '每手结束后询问: 下一局或复盘': 'after each hand: next hand or review',
  '每手结束后询问: 直接下一局, 或先复盘(查看所有人底牌与动作)': 'After each hand, choose: continue, or review first (see everyone\'s hole cards & actions)',
  '手 · 要复盘吗?': ' · review this hand?',
  '下一局': 'Next Hand', '复盘本局': 'Review This Hand', '复盘': 'Hand Review',
  '底牌': 'Hole Cards', '结果': 'Result', '动作时间线': 'Action Timeline',
  '开始游戏': 'Start Playing',

  '鱿鱼时钟: ': 'Squid clock: ',
  '本手结束后淘汰最短码!': 'Shortest stack busts after this hand!',
  '✓ 已启用 — AI 会给建议并参与人机决策': '✓ Enabled — AI advises you and joins bot decisions',
  '未启用 — 人机仅按风格+胜率+随机性决策': 'Disabled — bots act on style + equity + randomness only',
  '✓ 连接成功': '✓ Connected', '测试中…': 'Testing…',

  /* 成牌名 */
  '高牌': 'High Card', '一对': 'Pair', '两对': 'Two Pair', '三条': 'Three of a Kind',
  '顺子': 'Straight', '同花': 'Flush', '葫芦': 'Full House', '四条': 'Four of a Kind',
  '同花顺': 'Straight Flush',

  /* AI 风格 */
  '紧凶': 'TAG', '松凶': 'LAG', '紧弱': 'Rock', '松弱': 'Fish', '均衡': 'Balanced', '疯狂': 'Maniac',
  '选牌严格,下注激进': 'tight picks, aggressive bets',
  '什么牌都打,频繁施压': 'plays everything, constant pressure',
  '只玩大牌,被动跟注': 'premium hands only, passive',
  '什么牌都跟,极少加注': 'calls everything, rarely raises',
  '攻守兼备的标准打法': 'balanced standard play',
  '无差别加注,极不稳定': 'raises everything, wild swings',

  /* 帮助正文(整段) */
  '<b>三种模式</b>:现金局(盲注固定/随时重买) · 锦标赛(盲注升级/打到只剩一人/前三名分奖) · 鱿鱼场(淘汰时钟每 N 手淘汰最短码, 最后一手全员强制摊牌, 击倒对手得赏金, 奖池存进小猪罐 🐷)。':
    '<b>Three modes</b>: Cash (fixed blinds, rebuy anytime) · Tournament (rising blinds, last one standing, top 3 paid) · Squid (elimination clock busts the shortest stack every N hands, forced all-in showdown on the final hand, knockout bounties, prizes go to the piggy bank 🐷).',
  '<b>记牌器</b>(左栏):绿色=公共牌, 蓝色=你的手牌, 红色=已弃牌(开启"亮弃牌"时)。实时统计已见牌。':
    '<b>Card tracker</b> (left): green = board cards, blue = your hole cards, red = folded dead cards (when "Reveal Folds" is on). Live count of seen cards.',
  '<b>胜率</b>(右栏):蒙特卡洛模拟 vs 场上对手数, 已见死牌会从模拟中剔除; 同时显示底池赔率参考。':
    '<b>Equity</b> (right): Monte-Carlo simulation vs active opponents; dead cards are excluded. Pot odds shown as a reference.',
  '<b>AI 决策</b>:人机按「风格参数 × 胜率 × 随机噪声」决策; 配置大模型 API 后, AI 玩家会按比例咨询大模型并与风格决策加权融合, 也可给你实时建议。':
    '<b>AI decisions</b>: bots act on style × equity × random noise; with an LLM API configured, they also consult the model and blend its advice — and you can get real-time advice too.',
  '<b>快捷键</b>:F 弃牌 · C 过牌/跟注 · R 加注(滑条) · Enter 确认加注 · A 全下 · D AI建议。':
    '<b>Hotkeys</b>: F fold · C check/call · R raise (slider) · Enter confirm raise · A all-in · D AI advice.'
};

/* AI 英文名池(与中文名池等长) */
var AI_NAMES_EN = ['Old K', 'Howie', 'Mei', 'Dumpling', 'Godfather', 'Shadow', 'May', 'Big Joe', 'Peanut', 'Crazy Cai'];

PK.t = function (key, params) {
  var s = (PK.I18N.lang === 'en' && EN[key]) ? EN[key] : key;
  if (params) {
    for (var k in params) s = s.split('{' + k + '}').join(params[k]);
  }
  return s;
};

PK.I18N = {
  lang: 'zh',
  en: EN,
  aiNames: { zh: null, en: AI_NAMES_EN },
  _listeners: [],
  on: function (fn) { this._listeners.push(fn); },
  init: function () {
    var saved = 'zh';
    try {
      saved = localStorage.getItem('agentpoker.lang');
      if (saved === null) saved = localStorage.getItem('pk3d.lang'); // 旧项目名迁移
      saved = saved || 'zh';
    } catch (e) { }
    this.lang = (saved === 'en') ? 'en' : 'zh';
    this.applyStatic();
  },
  setLang: function (lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    try { localStorage.setItem('agentpoker.lang', lang); } catch (e) { }
    this.applyStatic();
    this._listeners.forEach(function (fn) { try { fn(lang); } catch (e) { } });
  },
  toggle: function () { this.setLang(this.lang === 'zh' ? 'en' : 'zh'); },
  applyStatic: function () {
    if (typeof document === 'undefined' || !document.querySelectorAll) return; // Node 环境(测试)
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = PK.t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.placeholder = PK.t(el.getAttribute('data-i18n-ph'));
    });
    var titleEl = document.querySelector('title');
    if (titleEl) titleEl.textContent = PK.t('AgentPoker — 德州扑克 · 现金局 · 锦标赛 · 鱿鱼场');
  }
};

PK.I18N.init();
})();
