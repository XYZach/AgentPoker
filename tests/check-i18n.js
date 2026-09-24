/* 静态检查: 所有 PK.t('key') / data-i18n="key" 是否都已在 EN 字典中 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

/* 加载 i18n.js 拿到 EN 字典 keys */
var vm = require('vm');
var sandbox = { document: undefined };
sandbox.global = sandbox; /* i18n.js 无 window 时走 global.PK */
sandbox.localStorage = { getItem: function () { return null; }, setItem: function () { } };
vm.createContext(sandbox);
var i18nSrc = fs.readFileSync(path.join(root, 'js', 'core', 'i18n.js'), 'utf8');
/* i18n.js 顶部引导: 无 window 时走 global.PK —— vm 里 global 是 sandbox 自身 */
try {
  vm.runInContext(i18nSrc, sandbox);
} catch (e) {
  console.log('I18N LOAD FAIL: ' + e.message);
  process.exit(1);
}
var PKg = sandbox.PK || (sandbox.global && sandbox.global.PK);
if (!PKg || !PKg.I18N || !PKg.I18N.en) { console.log('NO EN DICT'); process.exit(1); }
var enKeys = new Set(Object.keys(PKg.I18N.en));

var used = new Set();
var files = ['js/ui/hud.js', 'js/main.js', 'js/render/scene2d.js', 'js/core/cards.js'];
files.forEach(function (f) {
  var src = fs.readFileSync(path.join(root, f), 'utf8');
  /* PK.t('xxx') 与 PK.t("xxx") */
  var re = /PK\.t\(\s*'((?:[^'\\]|\\.)*)'\s*[,)]/g, m;
  while ((m = re.exec(src))) used.add(m[1]);
});

/* index.html data-i18n / data-i18n-ph / data-i18n-title */
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var re2 = /data-i18n(?:-ph|-title)?="([^"]+)"/g, m2;
while ((m2 = re2.exec(html))) used.add(m2[2 - 1] || m2[1]);

var missing = [];
used.forEach(function (k) {
  if (!enKeys.has(k)) missing.push(k);
});

console.log('total used keys: ' + used.size + ', EN dict: ' + enKeys.size);
if (missing.length) {
  console.log('MISSING in EN dict:');
  missing.forEach(function (k) { console.log('  - ' + JSON.stringify(k)); });
  process.exit(1);
} else {
  console.log('i18n keys: ALL OK');
}
