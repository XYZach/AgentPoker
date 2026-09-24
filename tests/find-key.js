var fs = require('fs');
['js/ui/hud.js', 'js/main.js', 'js/render/scene2d.js', 'index.html'].forEach(function (f) {
  var lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach(function (line, i) {
    if (line.indexOf('\u5f00\u59cb\u6e38\u620f') >= 0) console.log(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 120));
  });
});
