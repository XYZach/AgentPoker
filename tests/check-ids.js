/* 对比 JS 引用的 #id 与 index.html 中定义的 id */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var have = new Set();
var re = /id="([a-zA-Z0-9_-]+)"/g, m;
while ((m = re.exec(html))) have.add(m[1]);

var files = ['js/ui/hud.js', 'js/main.js', 'js/render/scene2d.js'];
var used = new Set();
files.forEach(function (f) {
  var src = fs.readFileSync(path.join(root, f), 'utf8');
  var r2 = /\$\('#([a-zA-Z0-9_-]+)'\)|getElementById\('([a-zA-Z0-9_-]+)'\)/g, m2;
  while ((m2 = r2.exec(src))) used.add(m2[1] || m2[2]);
});

/* 动态创建的 id 前缀（运行时生成，非静态存在） */
var dynamic = ['np-', 'bl-', 'tc-', 'adv-apply', 'ab-'];

var missing = [];
used.forEach(function (id) {
  if (!have.has(id)) {
    // adv-apply 是 showAdvice 动态 innerHTML 创建的
    if (id === 'adv-apply') return;
    missing.push(id);
  }
});
console.log('missing ids:', JSON.stringify(missing));
