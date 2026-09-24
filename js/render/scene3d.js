/* 3D 场景: Three.js r128 (UMD)
 * 椭圆牌桌 / 低位多边形角色 / 卡牌飞行翻转 / 筹码堆 / 鱿鱼场主题(存钱罐+守卫+霓虹)
 * 自带轨道相机控制与 DOM 锚点投影。
 */
(function () {
'use strict';
var PK = (typeof window !== 'undefined') ? window.PK : (window.PK = {});
var T = PK.TWEEN, Tex = PK.Tex;

var TABLE_Y = 1.02;                 // 桌面高度
var SEAT_RX = 8.2, SEAT_RZ = 5.7;   // 座位椭圆(紧贴桌沿)
var BET_RX = 4.55, BET_RZ = 2.62;   // 下注区椭圆
var FELT_RX = 6.15, FELT_RZ = 3.72; // 桌布椭圆

var CHIP_DENOMS = [
  { v: 1000, color: '#f4d03f' }, { v: 500, color: '#9b59b6' }, { v: 100, color: '#34495e' },
  { v: 25, color: '#27ae60' }, { v: 5, color: '#e74c3c' }, { v: 1, color: '#ecf0f1' }
];

PK.chipsForAmount = function (amount) {
  var out = [];
  var rem = Math.max(0, Math.round(amount));
  for (var i = 0; i < CHIP_DENOMS.length && rem > 0; i++) {
    var d = CHIP_DENOMS[i];
    var n = Math.floor(rem / d.v);
    if (n > 0) { out.push({ v: d.v, n: Math.min(n, 14), color: d.color }); rem -= n * d.v; }
  }
  if (!out.length) out.push({ v: 1, n: 1, color: '#ecf0f1' });
  return out;
};

function Scene3D(container, opts) {
  opts = opts || {};
  this.mode = opts.mode || 'cash';
  this.container = container;
  this.speed = 1;
  this._seats = [];
  this._cards = [];        // 场上所有卡牌 group
  this._betGroups = {};    // playerId -> group
  this._potGroup = null;
  this._highlightRings = [];
  this._confetti = [];
  this._coins = [];
  this._cineOrbit = false;
  this._piggyPulse = 0;
  this._time = 0;
  this.onProject = null;   // HUD 投影回调
  this._anchors = {};      // playerId -> {name, bet} Object3D
  this._extraAnchors = {}; // pot / piggy
  this._avatars = {};
  this._labels = [];

  this._initRenderer();
  this._initScene();
  this._buildEnvironment();
  this._buildTable();
  this._buildDealer();
  if (this.mode === 'squid') this._buildSquidDecor();
  this._initControls();
  window.addEventListener('resize', this._onResize = this._resize.bind(this));
  this._start();
}

/* ---------- 基础 ---------- */
Scene3D.prototype._initRenderer = function () {
  this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // 容器可能尚未布局(display:none), 用窗口尺寸兜底, resize 时校正
  var w = this.container.clientWidth || window.innerWidth;
  var h = this.container.clientHeight || window.innerHeight;
  this.renderer.setSize(w, h);
  this.renderer.shadowMap.enabled = true;
  this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.sRGBEncoding) this.renderer.outputEncoding = THREE.sRGBEncoding;
  if (THREE.ACESFilmicToneMapping) {
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
  }
  this.renderer.domElement.id = 'c3d';
  this.container.appendChild(this.renderer.domElement);
};

Scene3D.prototype._initScene = function () {
  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(this.mode === 'squid' ? 0x07090d : 0x0a0d13);
  this.scene.fog = new THREE.FogExp2(this.mode === 'squid' ? 0x07090d : 0x0a0d13, 0.02);

  var cw = this.container.clientWidth || window.innerWidth;
  var ch = this.container.clientHeight || window.innerHeight;
  this.camera = new THREE.PerspectiveCamera(48, cw / ch, 0.1, 120);
  this.camState = { yaw: 0, pitch: 0.6, radius: 13.2, tYaw: 0, tPitch: 0.6, tRadius: 13.2 };
  this.camTarget = new THREE.Vector3(0, 0.35, 0);
  this._updateCamera(0.016); // 立即摆位, 不等首帧 rAF

  // 灯光
  var hemi = new THREE.HemisphereLight(this.mode === 'squid' ? 0x2c3e50 : 0x46536e, 0x18120c, 0.55);
  this.scene.add(hemi);
  var spot = new THREE.SpotLight(0xfff0d8, 1.15, 60, 0.62, 0.45, 1);
  spot.position.set(0, 15, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  this.scene.add(spot);
  this.scene.add(spot.target);
  var fill = new THREE.SpotLight(this.mode === 'squid' ? 0x59d8ff : 0xbfd4ff, 0.4, 60, 0.8, 0.6, 1);
  fill.position.set(9, 11, 8);
  this.scene.add(fill);
  this.scene.add(fill.target);
  this._mainSpot = spot;
};

Scene3D.prototype._buildEnvironment = function () {
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(42, 48),
    new THREE.MeshStandardMaterial({ color: 0x0f1216, roughness: 0.92, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  this.scene.add(floor);

  // 空中尘埃
  var N = 380, pos = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 34;
    pos[i * 3 + 1] = Math.random() * 9;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
    color: this.mode === 'squid' ? 0x66f2dd : 0x9fb4d8, size: 0.045, transparent: true, opacity: 0.35, depthWrite: false
  }));
  this.scene.add(this.dust);
};

/* ---------- 牌桌 ---------- */
Scene3D.prototype._buildTable = function () {
  var railMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1e, roughness: 0.5, metalness: 0.08 });
  // 轨道 = 环形(外椭圆 + 内孔), 不能用实心椭圆, 否则会盖住整个桌面
  var shape = new THREE.Shape();
  shape.absellipse(0, 0, 7.15, 4.6, 0, Math.PI * 2, false, 0);
  var holePath = new THREE.Path();
  holePath.absellipse(0, 0, 5.95, 3.5, 0, Math.PI * 2, true, 0);
  shape.holes.push(holePath);
  var rail = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth: 0.34, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.13, bevelSegments: 4, curveSegments: 72
  }), railMat);
  rail.rotation.x = -Math.PI / 2;
  rail.position.y = 0.72;
  rail.castShadow = true; rail.receiveShadow = true;
  this.scene.add(rail);

  // 桌布
  var felt = new THREE.Mesh(
    new THREE.CircleGeometry(1, 72),
    new THREE.MeshStandardMaterial({ map: Tex.felt(this.mode), roughness: 0.95, metalness: 0 })
  );
  felt.scale.set(FELT_RX, FELT_RZ, 1);
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = TABLE_Y - 0.02;
  felt.receiveShadow = true;
  this.scene.add(felt);

  // 桌布下的衬板(顶面略低于桌布, 避免 Z-fighting)
  var board = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.3, 72),
    new THREE.MeshStandardMaterial({ color: 0x20301f, roughness: 0.9 })
  );
  board.scale.set(FELT_RX + 0.25, 1, FELT_RZ + 0.25);
  board.position.y = 0.83;
  board.castShadow = true;
  this.scene.add(board);

  // 立柱与底座
  var pedMat = new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 0.6, metalness: 0.1 });
  var ped = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 1.2), pedMat);
  ped.position.y = 0.42; ped.castShadow = true;
  this.scene.add(ped);
  var foot = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.14, 40), pedMat);
  foot.position.y = 0.07; foot.receiveShadow = true;
  this.scene.add(foot);

  // 牌堆(视觉, 荷官右手边) + 弃牌堆(左手边)
  var deckMat = new THREE.MeshStandardMaterial({ map: Tex.cardBack(this.mode), roughness: 0.7 });
  this.deckPos = new THREE.Vector3(1.2, TABLE_Y + 0.18, -2.45);
  for (var d = 0; d < 5; d++) {
    var dc = new THREE.Mesh(this._cardGeo(), deckMat);
    dc.position.copy(this.deckPos);
    dc.position.y += d * 0.012;
    dc.rotation.x = -Math.PI / 2;
    dc.rotation.z = (Math.random() - 0.5) * 0.08;
    dc.userData.deck = true;
    this.scene.add(dc);
  }
  this.muckPos = new THREE.Vector3(-1.5, TABLE_Y, -2.3);
  this.potPos = new THREE.Vector3(0, TABLE_Y, -1.9);
};

/* ---------- 荷官 ---------- */
Scene3D.prototype._buildDealer = function () {
  var isSquid = this.mode === 'squid';
  var g = new THREE.Group();
  function std(geo, mat) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; }

  var robe = isSquid ? 0xe0246c : 0x17181d;              // 守卫粉 / 黑马甲
  var shirtC = isSquid ? robe : 0xf4f2ec;                // 白衬衫
  var vestMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.75 });
  var shirtMat = new THREE.MeshStandardMaterial({ color: shirtC, roughness: 0.7 });
  var skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b88f, roughness: 0.75 });

  // 站姿
  var legs = std(new THREE.CylinderGeometry(0.24, 0.3, 0.85, 10),
    new THREE.MeshStandardMaterial({ color: isSquid ? robe : 0x23262e, roughness: 0.85 }));
  legs.position.y = 0.43; g.add(legs);
  var torso = std(new THREE.CylinderGeometry(0.3, 0.36, 0.72, 12), shirtMat);
  torso.position.y = 1.2; g.add(torso);
  if (!isSquid) { // 马甲叠穿
    var vest = std(new THREE.CylinderGeometry(0.318, 0.378, 0.5, 12), vestMat);
    vest.position.y = 1.16; g.add(vest);
  }
  var head = std(new THREE.SphereGeometry(0.23, 16, 12), skinMat);
  head.position.y = 1.72; g.add(head);

  if (isSquid) {
    var hood = std(new THREE.SphereGeometry(0.25, 14, 10), vestMat);
    hood.position.y = 1.77; g.add(hood);
    var mask = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32),
      new THREE.MeshStandardMaterial({ map: Tex.mask('circle'), transparent: true, roughness: 0.4 }));
    mask.position.set(0, 1.71, 0.215); g.add(mask);
  } else {
    // 领结 + 绿色遮光帽檐(荷官标配)
    var tie = std(new THREE.BoxGeometry(0.13, 0.06, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x7b1e26, roughness: 0.6 }));
    tie.position.set(0, 1.52, 0.29); g.add(tie);
    var visorMat = new THREE.MeshStandardMaterial({ color: 0x1a6b3c, roughness: 0.4 });
    var visor = std(new THREE.CylinderGeometry(0.26, 0.26, 0.025, 16, 1, false, 0, Math.PI), visorMat);
    visor.rotation.x = Math.PI / 2 - 0.55;
    visor.rotation.y = Math.PI; // 半圆朝前
    visor.position.set(0, 1.8, 0.1); g.add(visor);
    var band = std(new THREE.CylinderGeometry(0.238, 0.238, 0.05, 16), visorMat);
    band.position.y = 1.8; g.add(band);
  }

  // 手臂: 左臂自然下垂, 右臂负责发牌扫动
  var armMat = isSquid ? vestMat : shirtMat;
  var armL = std(new THREE.CylinderGeometry(0.07, 0.07, 0.66, 8), armMat);
  armL.position.set(-0.37, 1.22, 0.08); armL.rotation.z = 0.45; g.add(armL);
  this._dealerArm = std(new THREE.CylinderGeometry(0.07, 0.07, 0.66, 8), armMat);
  this._dealerArm.position.set(0.37, 1.22, 0.08);
  this._dealerArm.rotation.z = -0.45;
  g.add(this._dealerArm);

  g.position.set(0, 0, -5.2);
  g.rotation.y = 0; // 立正面向玩家一侧
  this.scene.add(g);
  this._dealer = g;

  // DOM 锚点
  var anchor = new THREE.Object3D();
  anchor.position.set(0, 2.35, -5.2);
  this.scene.add(anchor);
  this._extraAnchors.dealer = anchor;
};

/* 发牌时荷官手臂扫动 */
Scene3D.prototype._dealerSweep = function () {
  var arm = this._dealerArm;
  if (!arm || this._dealerSweeping) return;
  this._dealerSweeping = true;
  var self = this;
  T.add({
    dur: 300 / this.speed, ease: T.Ease.outCubic,
    onUpdate: function (t) { arm.rotation.x = -1.35 * Math.sin(Math.PI * t); }
  }).then(function () { self._dealerSweeping = false; });
};

/* ---------- 鱿鱼场装饰 ---------- */
Scene3D.prototype._buildSquidDecor = function () {
  var self = this;
  // 霓虹环
  this._neons = [];
  var colors = [0xff2d78, 0x00e5c3];
  for (var i = 0; i < 2; i++) {
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(9 + i * 2.2, 0.055, 10, 90),
      new THREE.MeshBasicMaterial({ color: colors[i], transparent: true, opacity: 0.75 })
    );
    ring.position.set(0, 3.4 + i * 1.6, -8.5 - i * 2);
    ring.rotation.x = 0.42;
    this.scene.add(ring);
    this._neons.push(ring);
  }
  var pl1 = new THREE.PointLight(0xff2d78, 0.55, 30); pl1.position.set(-10, 5, -8); this.scene.add(pl1);
  var pl2 = new THREE.PointLight(0x00e5c3, 0.5, 30); pl2.position.set(10, 5, -8); this.scene.add(pl2);

  // 守卫(站位装饰)
  var spots = [[-9.5, -10.5, 'circle'], [0, -12.5, 'triangle'], [9.5, -10.5, 'square']];
  spots.forEach(function (s) {
    var g = self._buildGuard(0xe0246c, s[2], 1.12);
    g.position.set(s[0], 0, s[1]);
    g.lookAt(0, 1.4, 0);
    self.scene.add(g);
  });
  var frontMan = this._buildGuard(0x14141c, 'square', 1.22);
  frontMan.position.set(0, 0, -15.5);
  frontMan.lookAt(0, 1.4, 0);
  this.scene.add(frontMan);

  // 存钱罐(悬吊)
  this._buildPiggy();
};

Scene3D.prototype._buildGuard = function (color, maskShape, scale) {
  var g = new THREE.Group();
  var robe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.52, 1.5, 10),
    new THREE.MeshStandardMaterial({ color: color, roughness: 0.85 })
  );
  robe.position.y = 0.75; robe.castShadow = true;
  g.add(robe);
  var hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 12),
    new THREE.MeshStandardMaterial({ color: color, roughness: 0.85 })
  );
  hood.position.y = 1.66; hood.castShadow = true;
  g.add(hood);
  var mask = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.MeshStandardMaterial({ map: Tex.mask(maskShape), roughness: 0.4, transparent: true })
  );
  mask.position.set(0, 1.64, 0.285);
  g.add(mask);
  g.scale.setScalar(scale);
  g.userData.swayPhase = Math.random() * 6.28;
  return g;
};

Scene3D.prototype._buildPiggy = function () {
  var pivot = new THREE.Group();
  pivot.position.set(0, 9.8, -1.5);
  var body = new THREE.Group();
  var mat = new THREE.MeshStandardMaterial({ color: 0xe9b2c4, roughness: 0.35, metalness: 0.45 });
  var tummy = new THREE.Mesh(new THREE.SphereGeometry(0.92, 24, 18), mat);
  tummy.scale.set(1, 0.92, 1.18);
  tummy.castShadow = true;
  body.add(tummy);
  var snout = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.3, 16), mat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.02, 1.02);
  body.add(snout);
  var noseMat = new THREE.MeshStandardMaterial({ color: 0xc98ba0, roughness: 0.5 });
  [-0.09, 0.09].forEach(function (x) {
    var n = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 10), noseMat);
    n.rotation.x = Math.PI / 2;
    n.position.set(x, -0.02, 1.18);
    body.add(n);
  });
  [-0.42, 0.42].forEach(function (x) {
    var ear = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 10), mat);
    ear.position.set(x, 0.78, -0.1);
    ear.rotation.z = x > 0 ? -0.5 : 0.5;
    body.add(ear);
    var eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    eye.position.set(x * 0.92, 0.16, 0.86);
    body.add(eye);
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 10), mat);
    leg.position.set(x * 0.9, -0.86, 0.55);
    body.add(leg);
    var leg2 = leg.clone(); leg2.position.z = -0.55;
    body.add(leg2);
  });
  var slot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a2430 }));
  slot.position.set(0, 0.86, 0);
  body.add(slot);
  body.position.y = -4.6;
  pivot.add(body);
  // 吊绳
  var rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 4.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 1 })
  );
  rope.position.y = -2.3;
  pivot.add(rope);
  this.piggyPivot = pivot;
  this.piggyBody = body;
  this.scene.add(pivot);
};

/* ---------- 玩家/座位 ---------- */
/* 座位角度: 玩家(0号)在正前方 0°, 荷官固定占据正后方 180°, 其余玩家分列两侧 */
Scene3D.prototype._seatAngle = function (i, n) {
  if (i === 0) return 0;
  var m = n - 1;
  var right = Math.ceil(m / 2), left = m - right;
  var idx = i - 1;
  var deg;
  if (idx < right) deg = 12 + (idx + 0.5) * (148 / right);
  else deg = 200 + ((idx - right) + 0.5) * (148 / left);
  return deg * Math.PI / 180;
};

Scene3D.prototype.seatPos = function (i, n) {
  var th = this._seatAngle(i, n);
  return new THREE.Vector3(Math.sin(th) * SEAT_RX, 0, Math.cos(th) * SEAT_RZ);
};
Scene3D.prototype.betPos = function (i, n) {
  var th = this._seatAngle(i, n);
  return new THREE.Vector3(Math.sin(th) * BET_RX, TABLE_Y + 0.02, Math.cos(th) * BET_RZ);
};
Scene3D.prototype._cardSlot = function (i, n, k) {
  var th = this._seatAngle(i, n);
  var dir = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
  var base = new THREE.Vector3(Math.sin(th) * (BET_RX - 1.15), TABLE_Y + 0.015, Math.cos(th) * (BET_RZ - 0.75));
  var perp = new THREE.Vector3(dir.z, 0, -dir.x);
  var off = (k === 0 ? -0.36 : 0.36);
  var p = base.clone().add(perp.multiplyScalar(off));
  p.y += k * 0.004;
  return p;
};

Scene3D.prototype._cardGeo = function () {
  if (!this.__cardGeo) this.__cardGeo = new THREE.PlaneGeometry(0.62, 0.88);
  return this.__cardGeo;
};

Scene3D.prototype._cardMats = function () {
  if (!this.__cardMats) this.__cardMats = {};
  return this.__cardMats;
};

Scene3D.prototype._matFor = function (card) {
  var m = this._cardMats();
  if (!m[card]) {
    m[card] = new THREE.MeshStandardMaterial({ map: Tex.cardFace(card), roughness: 0.55, metalness: 0.05, transparent: true });
  }
  return m[card];
};
Scene3D.prototype._backMat = function () {
  if (!this.__backMat) {
    this.__backMat = new THREE.MeshStandardMaterial({ map: Tex.cardBack(this.mode), roughness: 0.7, transparent: true });
  }
  return this.__backMat;
};

Scene3D.prototype.buildPlayers = function (players) {
  var self = this;
  var n = players.length;
  this._seatCount = n;
  players.forEach(function (p) {
    var pos = self.seatPos(p.seat, n);
    var av = self._buildAvatar(p, pos, n);
    self._avatars[p.id] = av;
    self.scene.add(av.group);
    // DOM 锚点
    var nameAnchor = new THREE.Object3D();
    nameAnchor.position.set(pos.x, 2.18, pos.z);
    self.scene.add(nameAnchor);
    var betP = self.betPos(p.seat, n);
    var betAnchor = new THREE.Object3D();
    betAnchor.position.set(betP.x, TABLE_Y + 0.75, betP.z);
    self.scene.add(betAnchor);
    self._anchors[p.id] = { name: nameAnchor, bet: betAnchor };
  });
  var potAnchor = new THREE.Object3D();
  potAnchor.position.set(0, TABLE_Y + 1.0, -2.1);
  this.scene.add(potAnchor);
  this._extraAnchors.pot = potAnchor;
  var piggyAnchor = new THREE.Object3D();
  piggyAnchor.position.set(0, 6.3, -1.5);
  this.scene.add(piggyAnchor);
  this._extraAnchors.piggy = piggyAnchor;
};

Scene3D.prototype._buildAvatar = function (p, pos, n) {
  var g = new THREE.Group();
  var isSquid = this.mode === 'squid' && !p.isHuman;
  // 每个座位固定种子 → 外观稳定且互不相同
  var rng = PK.mulberry32(p.id * 977 + 31);
  var heightScale = 0.93 + rng() * 0.14;
  var widthScale = 0.88 + rng() * 0.22;

  var SKIN = [0xf1c9a5, 0xe8b88f, 0xd9a066, 0xc68642, 0x8d5524];
  var SHIRT = [0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x16a085, 0x34495e, 0xc0392b, 0x2980b9, 0xd4a017];
  var HAIR = [0x2c2416, 0x0f0d0b, 0x6b4a2a, 0x9c7b4a, 0x4a3728, 0x7a5c3a];

  var skin = SKIN[Math.floor(rng() * SKIN.length)];
  var shirt = p.isHuman ? 0xf5b942
    : (isSquid ? [0xe0246c, 0xc41d5e, 0xe84a8a][p.id % 3] : SHIRT[p.id % SHIRT.length]);
  if (isSquid && p.styleKey === 'MANIAC') shirt = 0x14141c; // 疯狂 = 黑色前锋装

  function std(geo, mat) { var m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; }

  var bodyMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 });
  var skinMat = new THREE.MeshStandardMaterial({ color: isSquid ? shirt : skin, roughness: 0.75 });
  var woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.7 });

  // 凳子
  var seat = std(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 16), woodMat);
  seat.position.y = 0.6; g.add(seat);
  var pole = std(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 8), woodMat);
  pole.position.y = 0.32; g.add(pole);
  var foot = std(new THREE.CylinderGeometry(0.3, 0.34, 0.05, 12), woodMat);
  foot.position.y = 0.05; g.add(foot);

  // 腿(坐姿: 大腿前伸 + 小腿落地)
  var legMat = new THREE.MeshStandardMaterial({ color: isSquid ? shirt : 0x2c3e50, roughness: 0.85 });
  [-1, 1].forEach(function (s) {
    var thigh = std(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), legMat);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(s * 0.15, 0.63, 0.28);
    g.add(thigh);
    var shin = std(new THREE.CylinderGeometry(0.08, 0.08, 0.58, 8), legMat);
    shin.position.set(s * 0.15, 0.3, 0.5);
    g.add(shin);
  });

  // 躯干(坐在凳上)
  var torso = std(new THREE.CylinderGeometry(0.29, 0.43, 0.78, 12), bodyMat);
  torso.position.y = 1.0;
  g.add(torso);

  // 头
  var head = std(new THREE.SphereGeometry(0.235, 16, 12), isSquid ? bodyMat : skinMat);
  head.position.y = 1.56;
  g.add(head);

  if (isSquid) {
    var mask = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshStandardMaterial({ map: Tex.mask(['circle', 'triangle', 'square'][p.id % 3]), transparent: true, roughness: 0.4 }));
    mask.position.set(0, 1.56, 0.225);
    g.add(mask);
  } else {
    // 发型: 短发 / 棒球帽 / 礼帽 / 光头
    var roll = rng();
    if (roll < 0.32) {
      var hair = std(new THREE.SphereGeometry(0.245, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: HAIR[Math.floor(rng() * HAIR.length)], roughness: 0.9 }));
      hair.position.y = 1.575; g.add(hair);
    } else if (roll < 0.58) {
      var capMat = new THREE.MeshStandardMaterial({ color: [0x2c3e50, 0x8e44ad, 0x16a085, 0x7f8c8d][Math.floor(rng() * 4)], roughness: 0.8 });
      var capTop = std(new THREE.CylinderGeometry(0.19, 0.215, 0.14, 12), capMat);
      capTop.position.y = 1.75; g.add(capTop);
      var brim = std(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 12), capMat);
      brim.position.set(0, 1.69, 0.09); g.add(brim);
    } else if (roll < 0.78) {
      var fhMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.55 });
      var fhTop = std(new THREE.CylinderGeometry(0.165, 0.165, 0.22, 12), fhMat);
      fhTop.position.y = 1.8; g.add(fhTop);
      var fhBrim = std(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 14), fhMat);
      fhBrim.position.y = 1.7; g.add(fhBrim);
    }
    // 墨镜
    if (rng() < 0.4) {
      var sg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.2, metalness: 0.6 }));
      sg.position.set(0, 1.585, 0.21);
      g.add(sg);
    }
  }

  // 手臂搭向桌沿
  [-1, 1].forEach(function (s) {
    var arm = std(new THREE.CylinderGeometry(0.075, 0.075, 0.62, 8), isSquid ? bodyMat : skinMat);
    arm.position.set(s * 0.33, 1.18, 0.3);
    arm.rotation.z = s * 0.55;
    arm.rotation.x = -0.75;
    g.add(arm);
  });

  if (p.isHuman) { // 金色光环标识
    var halo = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 8, 22),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    halo.position.y = 1.98;
    halo.rotation.x = Math.PI / 2;
    g.add(halo);
  }

  g.position.copy(pos);
  g.rotation.y = Math.atan2(-pos.x, -pos.z); // 立正朝向桌心, 不倾倒
  g.scale.set(widthScale, heightScale, widthScale);
  g.userData.phase = rng() * 6.28;
  return { group: g, baseY: 0, head: head, torso: torso, dead: false, thinking: false };
};

/* ---------- 相机控制 ---------- */
Scene3D.prototype._initControls = function () {
  var self = this;
  var el = this.renderer.domElement;
  var dragging = false, lx = 0, ly = 0, pinch = 0;
  el.addEventListener('pointerdown', function (e) {
    dragging = true; lx = e.clientX; ly = e.clientY;
    el.setPointerCapture && el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    self.camState.tYaw -= dx * 0.0052;
    self.camState.tPitch = Math.max(0.16, Math.min(1.42, self.camState.tPitch + dy * 0.004));
  });
  el.addEventListener('pointerup', function () { dragging = false; });
  el.addEventListener('pointercancel', function () { dragging = false; });
  el.addEventListener('wheel', function (e) {
    e.preventDefault();
    self.camState.tRadius = Math.max(6.2, Math.min(22, self.camState.tRadius * (1 + e.deltaY * 0.0011)));
  }, { passive: false });
  el.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  el.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch > 0) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      self.camState.tRadius = Math.max(6.2, Math.min(22, self.camState.tRadius * pinch / d));
      pinch = d;
      e.preventDefault();
    }
  }, { passive: false });
};

Scene3D.prototype.cameraPreset = function (name) {
  var s = this.camState;
  s.tYaw = 0; // 所有预设回到正面(玩家视角)
  if (name === 'top') { s.tPitch = 1.32; s.tRadius = 13.5; }
  else if (name === 'close') { s.tPitch = 0.42; s.tRadius = 8.6; }
  else if (name === 'wide') { s.tPitch = 0.72; s.tRadius = 16.5; }
  else { s.tPitch = 0.6; s.tRadius = 13.2; }
};
Scene3D.prototype.setCinematic = function (on) {
  var s = this.camState;
  if (on && !this._cineOrbit) this._preCineYaw = s.tYaw;
  this._cineOrbit = on;
  if (!on && this._preCineYaw != null) {
    // 运镜结束: 平滑转回运镜前的朝向(取最短圈)
    var delta = (s.tYaw - this._preCineYaw) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    s.tYaw -= delta;
    this._preCineYaw = null;
  }
};

/* ---------- 卡牌 ---------- */
Scene3D.prototype._makeCardGroup = function (card) {
  var g = new THREE.Group();
  var front = new THREE.Mesh(this._cardGeo(), this._matFor(card));
  var back = new THREE.Mesh(this._cardGeo(), this._backMat());
  back.rotation.y = Math.PI;
  g.add(front); g.add(back);
  return g;
};

/* 发一手牌 */
Scene3D.prototype.dealHole = function (playerId, card, k, faceUp) {
  var self = this;
  this._dealerSweep();
  var slot = this._cardSlot(this._seatOf(playerId), this._seatCount, k);
  var g = this._makeCardGroup(card);
  g.position.copy(this.deckPos);
  g.rotation.x = -Math.PI / 2;
  g.rotation.z = Math.random() * 0.5 - 0.25;
  g.userData.card = card;
  g.userData.playerId = playerId;
  this.scene.add(g);
  this._cards.push(g);
  // 玩家自己的手牌: 立起来朝向自己, 像持牌(底边抵在桌布上)
  var targetRot, targetScale = 1;
  if (faceUp) {
    g.userData.heroCard = true;
    targetScale = 1.14;
    slot = slot.clone();
    slot.z += 0.1;
    if (k === 0) { slot.x -= 0.06; slot.y = TABLE_Y + 0.4; targetRot = { x: -Math.PI / 2 + 1.18, y: 0, z: 0.09 }; }
    else { slot.x += 0.3; slot.z -= 0.14; slot.y = TABLE_Y + 0.41; targetRot = { x: -Math.PI / 2 + 1.3, y: 0, z: -0.1 }; }
    g.scale.setScalar(targetScale);
  } else {
    targetRot = { x: -Math.PI / 2 + 0.06, y: Math.PI, z: 0 };
  }
  var fromR = { x: g.rotation.x, y: g.rotation.y, z: g.rotation.z };
  return T.add({
    dur: 340 / this.speed, ease: T.Ease.outQuad,
    onUpdate: function (t) {
      g.position.lerpVectors(self.deckPos, slot, t);
      g.position.y = self.deckPos.y + (slot.y - self.deckPos.y) * t + Math.sin(Math.PI * t) * 0.55;
      g.rotation.x = fromR.x + (targetRot.x - fromR.x) * t;
      g.rotation.y = fromR.y + (targetRot.y - fromR.y) * t;
      g.rotation.z = fromR.z * (1 - t) + (targetRot.z || 0) * t;
    }
  });
};

Scene3D.prototype._seatOf = function (playerId) { return playerId; };

/* 翻开某人手牌(摊牌/亮牌); 玩家自己的牌已立起朝向自己, 不再翻 */
Scene3D.prototype.revealHole = function (playerId, cards) {
  var self = this;
  var mine = this._cards.filter(function (c) { return c.userData.playerId === playerId && !c.userData.mucked && !c.userData.heroCard; });
  var ps = [];
  mine.forEach(function (g, idx) {
    ps.push(T.add({
      dur: 360 / self.speed, ease: T.Ease.outBack,
      onUpdate: function (t) {
        g.rotation.y = Math.PI + (0 - Math.PI) * t;
        g.position.y = TABLE_Y + 0.015 + Math.sin(Math.PI * t) * 0.28;
      }
    }));
  });
  return Promise.all(ps);
};

/* 公共牌 */
Scene3D.prototype.dealCommunity = function (cards) {
  var self = this;
  this._dealerSweep();
  var ps = [];
  var startIdx = this._communityCount || 0;
  cards.forEach(function (card, i) {
    var slotIdx = startIdx + i;
    var g = self._makeCardGroup(card);
    g.scale.setScalar(1.12);
    g.position.copy(self.deckPos);
    g.rotation.x = -Math.PI / 2;
    g.rotation.y = Math.PI;
    g.userData.card = card;
    g.userData.community = true;
    g.userData.slot = slotIdx;
    self.scene.add(g);
    self._cards.push(g);
    var slot = new THREE.Vector3((slotIdx - 2) * 1.12, TABLE_Y + 0.02, 0);
    ps.push(T.add({
      dur: 380 / self.speed, ease: T.Ease.outQuad, delay: 0,
      onUpdate: function (t) {
        g.position.lerpVectors(self.deckPos, slot, t);
        g.position.y = TABLE_Y + 0.02 + Math.sin(Math.PI * t) * 0.6;
        g.rotation.x = -Math.PI / 2 + 0.05;
      }
    }).then(function () {
      return T.add({
        dur: 320 / self.speed, ease: T.Ease.outBack,
        onUpdate: function (t) {
          g.rotation.y = Math.PI * (1 - t);
          g.position.y = TABLE_Y + 0.02 + Math.sin(Math.PI * t) * 0.3;
        }
      });
    }));
  });
  this._communityCount = startIdx + cards.length;
  return Promise.all(ps);
};

/* 弃牌进弃牌堆(始终背面朝上, 不展示牌面) */
Scene3D.prototype.muckCards = function (playerId) {
  var self = this;
  var mine = this._cards.filter(function (c) { return c.userData.playerId === playerId && !c.userData.mucked; });
  var ps = [];
  mine.forEach(function (g) {
    g.userData.mucked = true;
    var from = g.position.clone();
    var fromR = { x: g.rotation.x, y: g.rotation.y };
    ps.push(T.add({
      dur: 340 / self.speed, ease: T.Ease.inQuad,
      onUpdate: function (t) {
        g.position.lerpVectors(from, self.muckPos, t);
        g.position.y = TABLE_Y + 0.02 + Math.sin(Math.PI * t) * 0.35;
        // 翻回背面并放平
        g.rotation.x = fromR.x + (-Math.PI / 2 - fromR.x) * t;
        g.rotation.y = fromR.y * (1 - t) + Math.PI * t;
        if (t > 0.75) g.scale.setScalar(1 - (t - 0.75) * 3.2);
      }
    }));
  });
  return Promise.all(ps);
};

/* ---------- 筹码 ---------- */
Scene3D.prototype._chipGeo = function () {
  if (!this.__chipGeo) this.__chipGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.055, 22);
  return this.__chipGeo;
};
Scene3D.prototype._chipMats = function (color) {
  if (!this.__chipMats) this.__chipMats = {};
  if (!this.__chipMats[color]) {
    this.__chipMats[color] = [
      new THREE.MeshStandardMaterial({ map: Tex.chipSide(color), roughness: 0.55 }),
      new THREE.MeshStandardMaterial({ map: Tex.chipTop(color), roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ map: Tex.chipTop(color), roughness: 0.5 })
    ];
  }
  return this.__chipMats[color];
};

Scene3D.prototype._buildChipStack = function (amount, pos, dirAngle) {
  var group = new THREE.Group();
  var denoms = PK.chipsForAmount(amount);
  var self = this;
  var col = 0;
  denoms.forEach(function (d) {
    var stacks = Math.ceil(d.n / 10);
    for (var s = 0; s < stacks; s++) {
      var cnt = Math.min(10, d.n - s * 10);
      var perp = new THREE.Vector3(Math.cos(dirAngle), 0, -Math.sin(dirAngle));
      var base = new THREE.Vector3(
        pos.x + perp.x * (col - 0.5) * 0.42,
        pos.y,
        pos.z + perp.z * (col - 0.5) * 0.42
      );
      for (var i = 0; i < cnt; i++) {
        var chip = new THREE.Mesh(self._chipGeo(), self._chipMats(d.color));
        chip.position.set(base.x + (Math.random() - 0.5) * 0.012, base.y + 0.03 + i * 0.058, base.z + (Math.random() - 0.5) * 0.012);
        chip.rotation.y = Math.random() * Math.PI;
        chip.castShadow = true;
        group.add(chip);
      }
      col++;
    }
  });
  return group;
};

Scene3D.prototype.setBet = function (playerId, amount) {
  var old = this._betGroups[playerId];
  if (old) { this.scene.remove(old); }
  if (!amount || amount <= 0) { this._betGroups[playerId] = null; return; }
  var seat = this._seatOf(playerId);
  var bp = this.betPos(seat, this._seatCount);
  var g = this._buildChipStack(amount, bp, Math.atan2(bp.x, bp.z));
  this.scene.add(g);
  this._betGroups[playerId] = g;
};

Scene3D.prototype.collectBets = function () {
  var self = this;
  var groups = [];
  Object.keys(this._betGroups).forEach(function (pid) {
    var g = self._betGroups[pid];
    if (g) groups.push(g);
  });
  this._betGroups = {};
  if (!groups.length) return Promise.resolve();
  return Promise.all(groups.map(function (g) {
    var from = g.position.clone();
    return T.add({
      dur: 320 / self.speed, ease: T.Ease.inQuad,
      onUpdate: function (t) {
        g.position.lerpVectors(from, new THREE.Vector3(self.potPos.x, TABLE_Y + 0.06 + t * 0.5, self.potPos.z), t);
        g.position.y = TABLE_Y + 0.06 + Math.sin(Math.PI * t) * 0.7;
        if (t > 0.8) g.scale.setScalar(1 - (t - 0.8) * 4);
      }
    }).then(function () { self.scene.remove(g); });
  }));
};

Scene3D.prototype.setPot = function (amount) {
  if (this._potGroup) { this.scene.remove(this._potGroup); this._potGroup = null; }
  if (amount > 0) {
    this._potGroup = this._buildChipStack(amount, this.potPos, 0.3);
    this.scene.add(this._potGroup);
  }
};

Scene3D.prototype.awardPot = function (winnerId, amount) {
  var self = this;
  var to = this.betPos(this._seatOf(winnerId), this._seatCount);
  to.y = TABLE_Y + 0.4;
  var fly = this._buildChipStack(amount, this.potPos, 0.3);
  fly.position.copy(this.potPos);
  this.scene.add(fly);
  if (this._potGroup) { this.scene.remove(this._potGroup); this._potGroup = null; }
  var from = fly.position.clone();
  return T.add({
    dur: 620 / this.speed, ease: T.Ease.outCubic,
    onUpdate: function (t) {
      fly.position.lerpVectors(from, to, t);
      fly.position.y = TABLE_Y + 0.4 + Math.sin(Math.PI * t) * 1.5;
    }
  }).then(function () {
    self.scene.remove(fly);
  });
};

/* ---------- 庄家钮 ---------- */
Scene3D.prototype.moveDealerButton = function (playerId) {
  var self = this;
  if (!this._dealerBtn) {
    var btn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.045, 20),
      new THREE.MeshStandardMaterial({ map: Tex.label('D', '#222', '#f4f2ec'), roughness: 0.5 })
    );
    btn.castShadow = true;
    this._dealerBtn = btn;
    this.scene.add(btn);
  }
  var bp = this.betPos(this._seatOf(playerId), this._seatCount);
  var target = new THREE.Vector3(bp.x + 0.55, TABLE_Y + 0.03, bp.z + 0.35);
  if (!this._dealerBtn.position.lengthSq()) {
    this._dealerBtn.position.copy(target);
    return Promise.resolve();
  }
  var from = this._dealerBtn.position.clone();
  var btn = this._dealerBtn;
  return T.add({
    dur: 420 / this.speed, ease: T.Ease.outCubic,
    onUpdate: function (t) {
      btn.position.lerpVectors(from, target, t);
      btn.position.y = TABLE_Y + 0.03 + Math.sin(Math.PI * t) * 0.6;
    }
  });
};

/* ---------- 高亮/特效 ---------- */
Scene3D.prototype.highlightCards = function (cards) {
  var self = this;
  this.clearHighlights();
  cards.forEach(function (card) {
    var g = self._cards.find(function (c) { return c.userData.card === card && !c.userData.mucked; });
    if (!g) return;
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.035, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(g.position);
    ring.position.y = TABLE_Y + 0.012;
    self.scene.add(ring);
    self._highlightRings.push(ring);
    (function (cardG) {
      var y0 = cardG.position.y;
      T.add({
        dur: 300 / self.speed, ease: T.Ease.outCubic,
        onUpdate: function (t) { cardG.position.y = y0 + t * 0.2; }
      });
    })(g);
  });
};
Scene3D.prototype.clearHighlights = function () {
  var self = this;
  this._highlightRings.forEach(function (r) { self.scene.remove(r); });
  this._highlightRings = [];
  this._cards.forEach(function (g) {
    if (g.userData.lit) return;
  });
};

Scene3D.prototype.confetti = function (playerId) {
  var self = this;
  var pos = this.seatPos(this._seatOf(playerId), this._seatCount).clone();
  pos.y = 2.6;
  var colors = [0xffd166, 0xff2d78, 0x00e5c3, 0x9b59b6, 0xf4f2ec];
  for (var i = 0; i < 70; i++) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 0.14),
      new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide, transparent: true })
    );
    m.position.set(pos.x + (Math.random() - 0.5) * 0.8, pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * 0.8);
    this.scene.add(m);
    this._confetti.push({
      mesh: m, life: 0,
      vx: (Math.random() - 0.5) * 1.6, vy: 1.5 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 1.6,
      rv: (Math.random() - 0.5) * 8
    });
  }
};

Scene3D.prototype._flashLight = function (pos, color) {
  var l = new THREE.PointLight(color, 3.2, 9);
  l.position.copy(pos); l.position.y += 1.6;
  this.scene.add(l);
  var self = this;
  T.add({
    dur: 700, ease: T.Ease.outCubic,
    onUpdate: function (t) { l.intensity = 3.2 * (1 - t); }
  }).then(function () { self.scene.remove(l); });
};

/* 淘汰动画 */
Scene3D.prototype.eliminate = function (playerId, squid) {
  var self = this;
  var av = this._avatars[playerId];
  var pos = this.seatPos(this._seatOf(playerId), this._seatCount);
  this._flashLight(pos, squid ? 0xff2d3c : 0xff5533);
  if (!av || av.dead) return Promise.resolve();
  av.dead = true;
  var mats = [];
  av.group.traverse(function (o) { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; mats.push(o.material); } });
  var g = av.group;
  return T.add({
    dur: 1100 / this.speed, ease: T.Ease.inQuad,
    onUpdate: function (t) {
      g.rotation.x = -t * 1.35;
      g.position.y = -t * 0.4;
      mats.forEach(function (m) { m.opacity = 1 - t; });
    }
  }).then(function () { self.scene.remove(g); });
};

/* 存钱罐金币飞行 */
Scene3D.prototype.piggyCoins = function (fromPlayerId, amount) {
  var self = this;
  var from = this.seatPos(this._seatOf(fromPlayerId), this._seatCount).clone();
  from.y = 1.8;
  var n = Math.min(14, 4 + Math.floor(amount / 200));
  var goldMat = new THREE.MeshStandardMaterial({ color: 0xf4d03f, metalness: 0.7, roughness: 0.3 });
  for (var i = 0; i < n; i++) {
    var coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.024, 12), goldMat);
    coin.position.copy(from);
    this.scene.add(coin);
    this._coins.push({ mesh: coin, delay: i * 40, t: 0, from: from.clone(), dur: 800 });
  }
  this._piggyPulse = 1;
};

Scene3D.prototype.setAvatarState = function (playerId, state) {
  var av = this._avatars[playerId];
  if (!av || av.dead) return;
  av.state = state;
  if (state === 'folded') {
    av.group.rotation.x = 0.1;
    // 材质按集合去重后加深一次(同一材质被多个 mesh 共享)
    var mats = new Set();
    av.group.traverse(function (o) { if (o.material) mats.add(o.material); });
    var self2 = this;
    mats.forEach(function (m) {
      if (m.color && m.userData._foldColor == null) {
        m.userData._foldColor = m.color.getHex();
        m.color.multiplyScalar(0.5);
      }
    });
  } else if (state === 'active') {
    av.group.rotation.x = 0;
  }
};

Scene3D.prototype.setThinking = function (playerId, on) {
  var av = this._avatars[playerId];
  if (av) av.thinking = on;
};

/* ---------- 清场 ---------- */
Scene3D.prototype.clearHandVisuals = function () {
  var self = this;
  this._cards.forEach(function (g) { self.scene.remove(g); });
  this._cards = [];
  Object.keys(this._betGroups).forEach(function (pid) {
    if (self._betGroups[pid]) self.scene.remove(self._betGroups[pid]);
  });
  this._betGroups = {};
  this.clearHighlights();
  this._communityCount = 0;
  if (this._potGroup) { this.scene.remove(this._potGroup); this._potGroup = null; }
};

Scene3D.prototype.resetAvatarStates = function () {
  var self = this;
  Object.keys(this._avatars).forEach(function (pid) {
    var av = self._avatars[pid];
    if (av.dead) return;
    av.group.rotation.x = 0;
    av.group.position.y = 0;
    var mats = new Set();
    av.group.traverse(function (o) { if (o.material) mats.add(o.material); });
    mats.forEach(function (m) {
      if (m.userData._foldColor != null) {
        m.color.setHex(m.userData._foldColor);
        m.userData._foldColor = null;
      }
    });
  });
};

/* ---------- 主循环 ---------- */
Scene3D.prototype._start = function () {
  var self = this;
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    self._time += dt;
    T.update(now);
    self._updateCamera(dt);
    self._updateActors(dt);
    self.renderer.render(self.scene, self.camera);
    if (self.onProject) self.onProject();
    self._raf = requestAnimationFrame(loop);
  }
  this._raf = requestAnimationFrame(loop);
  // rAF 被后台节流时仍推进游戏逻辑并渲染(画面保持最新)
  this._ticker = setInterval(function () {
    T.update(performance.now());
    self._updateCamera(0.033);
    self._updateActors(0.033);
    self.renderer.render(self.scene, self.camera);
    if (self.onProject) self.onProject();
  }, 33);
};

Scene3D.prototype._updateCamera = function (dt) {
  var s = this.camState;
  if (this._cineOrbit) s.tYaw += dt * 0.16;
  s.yaw += (s.tYaw - s.yaw) * Math.min(1, dt * 7);
  s.pitch += (s.tPitch - s.pitch) * Math.min(1, dt * 7);
  s.radius += (s.tRadius - s.radius) * Math.min(1, dt * 7);
  var cp = Math.cos(s.pitch), sp = Math.sin(s.pitch);
  this.camera.position.set(
    Math.sin(s.yaw) * s.radius * cp,
    0.35 + sp * s.radius,
    Math.cos(s.yaw) * s.radius * cp
  );
  this.camera.lookAt(this.camTarget);
};

Scene3D.prototype._updateActors = function (dt) {
  var self = this;
  // 角色待机
  Object.keys(this._avatars).forEach(function (pid) {
    var av = self._avatars[pid];
    if (av.dead) return;
    var ph = av.group.userData.phase;
    av.group.position.y = Math.sin(self._time * 1.3 + ph) * 0.02;
    if (av.thinking) {
      av.head.rotation.z = Math.sin(self._time * 5) * 0.12;
    } else {
      av.head.rotation.z *= 0.9;
    }
  });
  // 荷官待机摇摆
  if (this._dealer) {
    this._dealer.rotation.z = Math.sin(self._time * 0.9) * 0.018;
  }
  // 存钱罐摆动 + 脉冲
  if (this.piggyPivot) {
    this.piggyPivot.rotation.z = Math.sin(this._time * 0.7) * 0.055;
    this.piggyPivot.rotation.x = Math.sin(self._time * 0.43 + 1) * 0.03;
    if (this._piggyPulse > 0) {
      this._piggyPulse = Math.max(0, this._piggyPulse - dt * 1.4);
      var sc = 1 + Math.sin(this._piggyPulse * Math.PI) * 0.16;
      this.piggyBody.scale.setScalar(sc);
    }
  }
  // 金币飞行
  for (var i = this._coins.length - 1; i >= 0; i--) {
    var c = this._coins[i];
    if (c.delay > 0) { c.delay -= dt * 1000; continue; }
    c.t += dt * 1000 / c.dur;
    if (c.t >= 1) { this.scene.remove(c.mesh); this._coins.splice(i, 1); continue; }
    var target = this.piggyBody.getWorldPosition(new THREE.Vector3());
    c.mesh.position.lerpVectors(c.from, target, c.t);
    c.mesh.position.y += Math.sin(Math.PI * c.t) * 2.2;
    c.mesh.rotation.x += dt * 9;
  }
  // 彩纸
  for (var j = this._confetti.length - 1; j >= 0; j--) {
    var f = this._confetti[j];
    f.life += dt;
    f.vy -= 6.2 * dt;
    f.mesh.position.x += f.vx * dt;
    f.mesh.position.y += f.vy * dt;
    f.mesh.position.z += f.vz * dt;
    f.mesh.rotation.x += f.rv * dt;
    f.mesh.rotation.z += f.rv * 0.7 * dt;
    f.mesh.material.opacity = Math.max(0, 1 - f.life / 2.4);
    if (f.life > 2.4) { this.scene.remove(f.mesh); this._confetti.splice(j, 1); }
  }
  // 霓虹
  if (this._neons) {
    this._neons.forEach(function (r, idx) {
      r.rotation.z += dt * (idx ? -0.1 : 0.14);
      r.material.opacity = 0.55 + Math.sin(self._time * 2 + idx * 2) * 0.2;
    });
  }
  // 尘埃上浮
  if (this.dust) {
    var arr = this.dust.geometry.attributes.position.array;
    for (var k = 1; k < arr.length; k += 3) {
      arr[k] += dt * 0.12;
      if (arr[k] > 9) arr[k] = 0;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
};

/* 世界坐标 -> 屏幕像素 */
Scene3D.prototype.project = function (v3) {
  var v = v3.clone().project(this.camera);
  if (v.z > 1) return null;
  return {
    x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
    y: (-v.y * 0.5 + 0.5) * this.container.clientHeight
  };
};
Scene3D.prototype.anchorOf = function (playerId) { return this._anchors[playerId]; };
Scene3D.prototype.extraAnchor = function (key) { return this._extraAnchors[key]; };

Scene3D.prototype._resize = function () {
  var w = this.container.clientWidth, h = this.container.clientHeight;
  this.renderer.setSize(w, h);
  this.camera.aspect = w / h;
  this.camera.updateProjectionMatrix();
};

Scene3D.prototype.setSpeed = function (s) { this.speed = s; };

Scene3D.prototype.destroy = function () {
  cancelAnimationFrame(this._raf);
  if (this._ticker) clearInterval(this._ticker);
  window.removeEventListener('resize', this._onResize);
  T.clear();
  this.renderer.dispose();
  if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
};

PK.Scene3D = Scene3D;
})();
