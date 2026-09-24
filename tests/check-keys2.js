var fs = require('fs');
var path = require('path');
var i18n = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'i18n.js'), 'utf8');
['风格', '第', '手 · 要复盘吗?'].forEach(function (k) {
  var re = new RegExp("'" + k + "':");
  console.log((re.test(i18n) ? 'HAS ' : 'MISS') + ' | ' + k);
});
