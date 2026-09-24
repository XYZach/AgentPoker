/* 检查给定中文 key 是否已在 EN 字典中 */
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'i18n.js'), 'utf8');

var keys = [
  '复盘', '下一局', '复盘本局', '本手已结束 · 要复盘吗?', '每局复盘',
  '每手结束后询问: 下一局或复盘', '公共牌', '底牌', '结果', '动作时间线',
  '总奖池', '盲注', '前注', '玩家', '盈亏', '手', '第', '被淘汰', '弃牌',
  '翻牌前', '翻牌 🌟', '转牌', '河牌', '小盲', '大盲', '过牌', '跟注', '下注',
  '加注', '加注到', '全下', '本手结束', '菜单', '继续游戏', '放弃并回大厅'
];
keys.forEach(function (k) {
  var re = new RegExp("'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':");
  console.log((re.test(src) ? 'HAS ' : 'MISS') + ' | ' + k);
});
