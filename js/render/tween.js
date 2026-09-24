/* 极简补间动画系统(rAF 驱动, 无外部依赖) */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : (window.PK = {});

var T = PK.TWEEN = { list: [], _last: 0 };

T.Ease = {
  linear: function (t) { return t; },
  outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
  inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
  inQuad: function (t) { return t * t; }
};

/* opts: {dur(ms), ease, onUpdate(t 0..1), onDone} 返回 Promise */
T.add = function (opts) {
  return new Promise(function (resolve) {
    T.list.push({
      t0: performance.now(),
      dur: Math.max(1, opts.dur || 300),
      ease: opts.ease || T.Ease.outCubic,
      onUpdate: opts.onUpdate || function () { },
      resolve: resolve
    });
  });
};

T.wait = function (ms) { return T.add({ dur: ms, ease: T.Ease.linear }); };

/* 抛物线飞行: obj 从 from 到 to, 高度 h */
T.fly = function (obj, to, dur, h, ease) {
  var from = obj.position.clone();
  return T.add({
    dur: dur, ease: ease || T.Ease.outQuad,
    onUpdate: function (t) {
      obj.position.lerpVectors(from, to, t);
      obj.position.y += Math.sin(Math.PI * t) * (h || 0);
    }
  });
};

T.moveTo = function (obj, to, dur, ease) {
  var from = obj.position.clone();
  return T.add({
    dur: dur, ease: ease || T.Ease.outCubic,
    onUpdate: function (t) { obj.position.lerpVectors(from, to, t); }
  });
};

T.rotateTo = function (obj, rx, ry, dur, ease) {
  var from = { x: obj.rotation.x, y: obj.rotation.y };
  return T.add({
    dur: dur, ease: ease || T.Ease.inOutCubic,
    onUpdate: function (t) {
      obj.rotation.x = from.x + (rx - from.x) * t;
      obj.rotation.y = from.y + (ry - from.y) * t;
    }
  });
};

T.update = function (now) {
  var list = T.list;
  for (var i = list.length - 1; i >= 0; i--) {
    var tw = list[i];
    var t = (now - tw.t0) / tw.dur;
    if (t >= 1) {
      tw.onUpdate(tw.ease(1));
      list.splice(i, 1);
      tw.resolve();
    } else if (t >= 0) {
      tw.onUpdate(tw.ease(t));
    }
  }
};

T.clear = function () { T.list.length = 0; };
})();
