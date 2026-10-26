/* 植物大战僵尸 · 美术模块（全部 Canvas 2D 矢量绘制，零外部资源）
 * 契约见 docs/CONTRACT.md 第 2 节。
 * 所有精灵以 (0,0) 为脚底/中心原点，内部 save/restore，动画只依赖 opts.t / phase，确定性。
 */
(function () {
  'use strict';

  const OUT = '#2c2417';
  const TAU = Math.PI * 2;
  const GRASS_A = '#7ec24a';
  const GRASS_B = '#72b342';

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** 用中点二次贝塞尔把点连成平滑闭合曲线 */
  function smooth(ctx, pts) {
    const n = pts.length;
    let prev = pts[n - 1];
    let cur = pts[0];
    ctx.beginPath();
    ctx.moveTo((prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
    for (let i = 0; i < n; i++) {
      const next = pts[(i + 1) % n];
      ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + next[0]) / 2, (cur[1] + next[1]) / 2);
      cur = next;
    }
    ctx.closePath();
  }

  function paint(ctx, path, fill, lw) {
    ctx.beginPath();
    if (typeof path === 'function') path(ctx);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (lw !== 0) {
      ctx.lineWidth = lw || 3;
      ctx.strokeStyle = OUT;
      ctx.stroke();
    }
  }

  function eye(ctx, x, y, rx, ry, look, pupilColor) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = '#fffdf2';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    const px = x + (look || 0) * rx * 0.35;
    const py = y + ry * 0.12;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1.6, Math.min(rx, ry) * 0.58), 0, TAU);
    ctx.fillStyle = pupilColor || '#2c2417';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px - rx * 0.2, py - ry * 0.3, Math.max(1, rx * 0.18), 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
  }

  function sparkle(ctx, x, y, r, color) {
    ctx.save();
    ctx.strokeStyle = color || 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.restore();
  }

  function leaf(ctx, x, y, len, wid, ang, color, vein) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.fillStyle = color || '#5fae3a';
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.lineTo(len * 0.86, 0);
    ctx.strokeStyle = vein || 'rgba(40, 80, 20, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function stem(ctx, x1, y1, cx, cy, x2, y2, w, color) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = (w || 7) + 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.strokeStyle = color || '#4f9c31';
    ctx.lineWidth = w || 7;
    ctx.stroke();
    ctx.restore();
  }

  function groundShadow(ctx, w, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.22 : alpha;
    ctx.fillStyle = '#1f3d12';
    ctx.beginPath();
    ctx.ellipse(0, -1, w || 30, 7, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ================================================================ 背景 */

  function cloud(ctx, x, y, s, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.85 : alpha;
    ctx.fillStyle = '#ffffff';
    const puffs = [[-30, 4, 18], [-6, -4, 24], [20, 0, 20], [38, 6, 14], [-18, 8, 15]];
    puffs.forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU);
      ctx.fill();
    });
    ctx.restore();
  }

  function bush(ctx, x, y, w, h, color, dark) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x - w * 0.55, y - h, x - w * 0.16, y - h * 0.82);
    ctx.quadraticCurveTo(x, y - h * 1.18, x + w * 0.22, y - h * 0.8);
    ctx.quadraticCurveTo(x + w * 0.58, y - h * 0.95, x + w / 2, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dark || OUT;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  function tree(ctx, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(-4, -54);
    ctx.lineTo(5, -54);
    ctx.lineTo(8, 0);
    ctx.closePath();
    ctx.fillStyle = '#7a5230';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    const sway = Math.sin(t * 0.8 + x) * 1.5;
    const blobs = [[-22, -68, 26], [10, -78, 30], [34, -58, 20], [0, -98, 22], [-14, -46, 18]];
    blobs.forEach(([dx, dy, r], i) => {
      ctx.beginPath();
      ctx.arc(dx + sway, dy, r, 0, TAU);
      ctx.fillStyle = i % 2 ? '#3f8235' : '#4c9440';
      ctx.fill();
      ctx.strokeStyle = '#2a5c22';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  function gravestone(ctx, x, y, s, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt || 0);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-14, -30);
    ctx.arc(0, -30, 14, Math.PI, 0);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fillStyle = '#8b8f93';
    ctx.fill();
    ctx.strokeStyle = '#43474b';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -12); ctx.lineTo(-7, -34);
    ctx.moveTo(7, -12); ctx.lineTo(7, -30);
    ctx.stroke();
    ctx.restore();
  }

  function daisy(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = color || '#fffdf2';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 5, Math.sin(a) * 5, 4, 2.6, a, 0, TAU);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fillStyle = '#ffcf3f';
    ctx.fill();
    ctx.restore();
  }

  function stone(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4.5, 0.2, 0, TAU);
    ctx.fillStyle = color || '#b9b3a3';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 55, 40, 0.6)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function renderBackground(ctx, geom, t, scene) {
    const L = geom.lawn;
    const W = geom.W;
    const H = geom.H;
    t = t || 0;
    ctx.save();

    // 天空（大部分会被顶栏与房子遮住，仍铺满保证无黑边）
    const sky = ctx.createLinearGradient(0, 0, 0, L.y + 80);
    sky.addColorStop(0, '#7dc9ec');
    sky.addColorStop(0.55, '#b6e4f4');
    sky.addColorStop(1, '#dff0c4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, L.y + 80);

    // 云
    cloud(ctx, 260 + Math.sin(t * 0.12) * 14, 86, 1.05, 0.75);
    cloud(ctx, 620 + Math.sin(t * 0.1 + 2) * 18, 58, 0.8, 0.55);
    cloud(ctx, 920 + Math.sin(t * 0.09 + 4) * 12, 104, 0.72, 0.5);

    // 远处树冠（右侧背景）
    tree(ctx, 1150, L.y + 8, 0.9, t);
    tree(ctx, 1246, L.y + 18, 0.75, t + 1);
    tree(ctx, 1078, L.y + 16, 0.55, t + 2);

    // 草坪主体（含割草机通道 110..200）
    ctx.fillStyle = '#6cae3d';
    ctx.fillRect(110, L.y, W - 110, H - L.y);

    // 割草机通道（左侧深一点的草地）
    const lane = ctx.createLinearGradient(110, 0, L.x, 0);
    lane.addColorStop(0, '#5c9a34');
    lane.addColorStop(1, '#6db03e');
    ctx.fillStyle = lane;
    ctx.fillRect(110, L.y, L.x - 110, H - L.y);

    // 草坪格子：每列一道深浅条纹
    for (let c = 0; c < L.cols; c++) {
      const x = L.x + c * L.cell;
      ctx.fillStyle = c % 2 === 0 ? GRASS_A : GRASS_B;
      ctx.fillRect(x, L.y, L.cell, H - L.y);
    }
    // 纵向明暗过渡，让草坪有纵深
    const depth = ctx.createLinearGradient(0, L.y, 0, H);
    depth.addColorStop(0, 'rgba(255, 255, 210, 0.1)');
    depth.addColorStop(0.7, 'rgba(20, 70, 10, 0)');
    depth.addColorStop(1, 'rgba(20, 60, 10, 0.16)');
    ctx.fillStyle = depth;
    ctx.fillRect(110, L.y, W - 110, H - L.y);

    // 细草地纹理：横向割草纹 + 零星草簇
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = L.y + 6; y < H - 2; y += 7) {
      ctx.beginPath();
      ctx.moveTo(110, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();

    // 草坪与通道的边界
    ctx.strokeStyle = 'rgba(40, 70, 20, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(L.x, L.y);
    ctx.lineTo(L.x, H);
    ctx.stroke();

    // 装饰：小雏菊、石子、草簇（确定性摆放，避开格子中心）
    const decos = [
      [214, 620, 'daisy', 1.1], [318, 654, 'stone', 1.2], [522, 624, 'daisy', 0.9],
      [426, 668, 'daisy', 1.0], [726, 630, 'stone', 1.1], [836, 662, 'daisy', 1.2],
      [936, 626, 'daisy', 0.9], [1038, 668, 'stone', 1.3], [660, 688, 'daisy', 1.1],
      [1250, 690, 'stone', 1.6], [180, 648, 'stone', 1.0], [150, 300, 'daisy', 1.0],
      [150, 520, 'stone', 1.1]
    ];
    decos.forEach(([x, y, kind, s]) => {
      if (kind === 'daisy') daisy(ctx, x, y, s);
      else stone(ctx, x, y, s);
    });
    // 草簇
    ctx.save();
    ctx.strokeStyle = 'rgba(50, 110, 30, 0.55)';
    ctx.lineWidth = 1.6;
    const tufts = [[240, 612], [470, 656], [640, 606], [900, 618], [1010, 648], [160, 420], [170, 560]];
    tufts.forEach(([x, y]) => {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * 3, y);
        ctx.quadraticCurveTo(x + i * 6, y - 7, x + i * 9, y - 11);
        ctx.stroke();
      }
    });
    ctx.restore();

    // 右侧树篱与墓地（僵尸来的方向）
    ctx.save();
    const hedge = ctx.createLinearGradient(1100, 0, 1280, 0);
    hedge.addColorStop(0, '#2f6a2c');
    hedge.addColorStop(1, '#234f21');
    ctx.fillStyle = hedge;
    ctx.fillRect(1100, L.y, W - 1100, H - L.y);
    // 树篱圆头
    for (let i = 0; i < 9; i++) {
      const x = 1100 + i * 22;
      const y = L.y + 14 + (i % 2) * 8;
      ctx.beginPath();
      ctx.arc(x, y, 17 + (i % 3) * 3, 0, TAU);
      ctx.fillStyle = i % 2 ? '#2f6a2c' : '#356f30';
      ctx.fill();
      ctx.strokeStyle = '#1d421c';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // 墓地剪影
    gravestone(ctx, 1148, L.y + 190, 1.15, -0.08);
    gravestone(ctx, 1216, L.y + 250, 0.95, 0.06);
    gravestone(ctx, 1182, L.y + 380, 1.25, -0.04);
    gravestone(ctx, 1246, L.y + 470, 1.0, 0.1);
    // 树篱底部阴影
    ctx.fillStyle = 'rgba(10, 30, 8, 0.3)';
    ctx.fillRect(1100, H - 18, W - 1100, 18);
    // 边界
    ctx.strokeStyle = 'rgba(20, 45, 16, 0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(1100, L.y);
    ctx.lineTo(1100, H);
    ctx.stroke();
    ctx.restore();

    // 左侧房屋
    ctx.save();
    // 墙体
    const wall = ctx.createLinearGradient(0, L.y, 110, H);
    wall.addColorStop(0, '#efe0bd');
    wall.addColorStop(1, '#d8c39a');
    ctx.fillStyle = wall;
    ctx.fillRect(0, L.y + 46, 112, H - L.y - 46);
    // 侧板线
    ctx.strokeStyle = 'rgba(120, 90, 50, 0.32)';
    ctx.lineWidth = 1.5;
    for (let x = 16; x < 110; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, L.y + 52);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    // 屋顶
    ctx.beginPath();
    ctx.moveTo(-8, L.y + 54);
    ctx.lineTo(56, L.y - 6);
    ctx.lineTo(122, L.y + 54);
    ctx.closePath();
    const roof = ctx.createLinearGradient(0, L.y - 6, 0, L.y + 54);
    roof.addColorStop(0, '#a8432f');
    roof.addColorStop(1, '#7d2f21');
    ctx.fillStyle = roof;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 瓦片
    ctx.strokeStyle = 'rgba(60, 20, 12, 0.35)';
    ctx.lineWidth = 1.4;
    for (let i = 1; i < 4; i++) {
      const yy = L.y + 6 + i * 12;
      ctx.beginPath();
      ctx.moveTo(56 - i * 22, yy);
      ctx.lineTo(56 + i * 22, yy);
      ctx.stroke();
    }
    // 窗户
    const wx = 62;
    const wy = L.y + 104;
    ctx.fillStyle = '#8fc8d8';
    rr(ctx, wx - 24, wy - 30, 48, 58, 4);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = '#f5ecd5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(wx, wy - 30); ctx.lineTo(wx, wy + 28);
    ctx.moveTo(wx - 24, wy - 1); ctx.lineTo(wx + 24, wy - 1);
    ctx.stroke();
    // 窗台花箱
    ctx.fillStyle = '#8b5a3c';
    rr(ctx, wx - 30, wy + 28, 60, 12, 3);
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(wx - 22 + i * 11, wy + 25, 5.5, 0, TAU);
      ctx.fillStyle = i % 2 ? '#e35d7a' : '#f2a03f';
      ctx.fill();
      ctx.strokeStyle = '#7a3a1f';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    // 门
    const dx = 22;
    const dy = L.y + 190;
    ctx.fillStyle = '#7d4a2c';
    ctx.beginPath();
    ctx.moveTo(dx, dy + 8);
    ctx.quadraticCurveTo(dx, dy - 8, dx + 22, dy - 8);
    ctx.quadraticCurveTo(dx + 44, dy - 8, dx + 44, dy + 8);
    ctx.lineTo(dx + 44, dy + 150);
    ctx.lineTo(dx, dy + 150);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(dx + 35, dy + 66, 3.4, 0, TAU);
    ctx.fill();
    // 墙脚
    ctx.fillStyle = 'rgba(90, 65, 40, 0.35)';
    ctx.fillRect(0, H - 16, 112, 16);
    // 房屋右侧边缘
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(112, L.y + 46);
    ctx.lineTo(112, H);
    ctx.stroke();
    ctx.restore();

    // 底部草带与土路
    ctx.save();
    const bottom = ctx.createLinearGradient(0, H - 90, 0, H);
    bottom.addColorStop(0, 'rgba(70, 130, 40, 0)');
    bottom.addColorStop(1, 'rgba(40, 85, 25, 0.35)');
    ctx.fillStyle = bottom;
    ctx.fillRect(0, H - 90, W, 90);
    ctx.restore();

    // 暗角
    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(20, 15, 5, 0.3)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  }


  /* 背景静态缓存：每帧重绘 1000+ 图元太浪费，缓存成 2x 位图直接贴图 */
  let BG_CACHE = null;
  function drawBackground(ctx, geom, t, scene) {
    const W = geom.W;
    const H = geom.H;
    if (!BG_CACHE || BG_CACHE.w !== W || BG_CACHE.h !== H) {
      const cv = document.createElement('canvas');
      cv.width = W * 2;
      cv.height = H * 2;
      const c = cv.getContext('2d');
      c.scale(2, 2);
      renderBackground(c, geom, 0, scene || 'day');
      BG_CACHE = { w: W, h: H, canvas: cv };
    }
    ctx.drawImage(BG_CACHE.canvas, 0, 0, W, H);
  }

  /* ================================================================ 顶部栏底板 */

  function drawTopBar(ctx, geom, t) {
    const W = geom.W;
    const h = geom.topBarH;
    ctx.save();
    // 硬投影
    ctx.fillStyle = 'rgba(24, 14, 5, 0.28)';
    rr(ctx, 10, 15, W - 20, h - 18, 16);
    ctx.fill();
    // 扁平木板
    ctx.fillStyle = '#6b4a26';
    rr(ctx, 10, 8, W - 20, h - 18, 16);
    ctx.fill();
    ctx.strokeStyle = '#33230f';
    ctx.lineWidth = 4;
    rr(ctx, 10, 8, W - 20, h - 18, 16);
    ctx.stroke();
    // 两条简单木纹
    ctx.strokeStyle = 'rgba(45, 28, 12, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(30, 34);
    ctx.lineTo(W - 30, 34);
    ctx.moveTo(30, 66);
    ctx.lineTo(W - 30, 66);
    ctx.stroke();
    // 扁平铆钉
    [[30, 24], [W - 30, 24], [30, h - 24], [W - 30, h - 24]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
      ctx.fillStyle = '#e8d3a8';
      ctx.fill();
      ctx.strokeStyle = '#33230f';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ================================================================ 阳光与豌豆 */

  function drawSun(ctx, o) {
    o = o || {};
    const r = o.r || 38;
    const t = o.t || 0;
    ctx.save();
    // 一圈扁平光芒
    ctx.save();
    ctx.rotate(t * 0.45);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const long = i % 2 === 0;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(r * 0.76, -r * 0.14);
      ctx.lineTo(r * (long ? 1.3 : 1.12), 0);
      ctx.lineTo(r * 0.76, r * 0.14);
      ctx.closePath();
      ctx.fillStyle = long ? '#ffc21a' : '#ffd23f';
      ctx.fill();
      ctx.strokeStyle = '#c9821a';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // 扁平圆球
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.84, 0, TAU);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.strokeStyle = '#b8740f';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 单个高光
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.3, r * 0.2, 0, TAU);
    ctx.fillStyle = 'rgba(255, 252, 220, 0.9)';
    ctx.fill();
    ctx.restore();
  }

  function drawPea(ctx, o) {
    o = o || {};
    const r = o.r || 11;
    const kind = o.kind || 'pea';
    const sets = {
      pea: ['#b7ea78', '#7cc63f', '#4f8c25', '#2f5a16'],
      snow: ['#e8fbff', '#aaecff', '#63bdd6', '#2f7f99'],
      fire: ['#ffe5a3', '#ffb347', '#e0621a', '#8a2f0c']
    };
    const c = sets[kind] || sets.pea;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = c[1];
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.34, r * 0.24, 0, TAU);
    ctx.fillStyle = c[0];
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.34, r * 0.11, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    if (kind === 'snow') {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.45); ctx.lineTo(-r * 0.4, r * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ================================================================ 割草机与铁锹 */

  function drawMower(ctx, o) {
    o = o || {};
    const t = o.t || 0;
    const active = !!o.active;
    const spin = t * (active ? 16 : 0);
    ctx.save();
    groundShadow(ctx, 34, active ? 0.28 : 0.18);
    // 轮子
    [-23, 23].forEach((wx) => {
      ctx.save();
      ctx.translate(wx, -12);
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.fillStyle = '#3b3b3b';
      ctx.fill();
      ctx.strokeStyle = '#1e1e1e';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = '#b8b8b8';
      ctx.lineWidth = 2;
      ctx.save();
      ctx.rotate(spin);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.cos((i / 3) * TAU) * 8, Math.sin((i / 3) * TAU) * 8);
        ctx.lineTo(-Math.cos((i / 3) * TAU) * 8, -Math.sin((i / 3) * TAU) * 8);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, TAU);
      ctx.fillStyle = '#d8d8d8';
      ctx.fill();
      ctx.restore();
    });
    // 车身
    ctx.beginPath();
    ctx.moveTo(-38, -18);
    ctx.quadraticCurveTo(-40, -48, -18, -50);
    ctx.lineTo(16, -50);
    ctx.quadraticCurveTo(34, -48, 38, -32);
    ctx.lineTo(38, -18);
    ctx.closePath();
    ctx.fillStyle = '#d24b33';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 引擎
    ctx.beginPath();
    rr(ctx, -20, -58, 26, 12, 4);
    ctx.fillStyle = '#6c7278';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 排气管
    ctx.beginPath();
    ctx.moveTo(-22, -62);
    ctx.lineTo(-22, -70);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#3e4247';
    ctx.stroke();
    // 手柄
    ctx.beginPath();
    ctx.moveTo(34, -44);
    ctx.lineTo(52, -70);
    ctx.lineTo(60, -68);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#8a8f95';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 高光
    ctx.beginPath();
    ctx.moveTo(-30, -44);
    ctx.quadraticCurveTo(0, -56, 26, -46);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 刀片
    ctx.beginPath();
    ctx.ellipse(0, -10, 30, 5, 0, 0, TAU);
    ctx.fillStyle = '#c7ccd1';
    ctx.fill();
    ctx.strokeStyle = '#5a6066';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (active) {
      // 火花与速度线
      for (let i = 0; i < 6; i++) {
        const ph = (t * 6 + i) % 1;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath();
        ctx.arc(-44 - ph * 34, -16 + Math.sin(i * 2.1 + t * 20) * 8, 2.6 * (1 - ph) + 1, 0, TAU);
        ctx.fillStyle = i % 2 ? '#ffd23f' : '#ff8a3c';
        ctx.fill();
      }
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-46 - i * 10, -30 - i * 6);
        ctx.lineTo(-64 - i * 10, -30 - i * 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawShovel(ctx, o) {
    o = o || {};
    const s = (o.size || 1);
    ctx.save();
    ctx.scale(s, s);
    ctx.rotate(-0.35);
    // 木柄
    ctx.beginPath();
    rr(ctx, -5, -36, 10, 48, 5);
    ctx.fillStyle = '#b07a44';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // 握把
    ctx.beginPath();
    rr(ctx, -12, -44, 24, 11, 5);
    ctx.fillStyle = '#8a5a30';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // 铲头
    ctx.beginPath();
    ctx.moveTo(-17, 8);
    ctx.lineTo(17, 8);
    ctx.quadraticCurveTo(16, 36, 0, 46);
    ctx.quadraticCurveTo(-16, 36, -17, 8);
    ctx.closePath();
    ctx.fillStyle = '#aeb9c1';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6, 16);
    ctx.quadraticCurveTo(-2, 30, 2, 38);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /* ================================================================ 特效 */

  function drawExplosion(ctx, o) {
    o = o || {};
    const age = Math.min(1, Math.max(0, o.age == null ? 0 : o.age));
    const R = o.r || 80;
    const kind = o.kind || 'cherry';
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age * 0.95);
    const scale = 0.45 + age * 0.95;
    ctx.scale(scale, scale);
    // 冲击波
    ctx.beginPath();
    ctx.arc(0, 0, R * (0.65 + age * 0.6), 0, TAU);
    ctx.strokeStyle = kind === 'mine' ? 'rgba(255, 230, 140, 0.85)' : 'rgba(255, 200, 90, 0.8)';
    ctx.lineWidth = 8 * (1 - age) + 2;
    ctx.stroke();
    // 外圈烟
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      const d = R * (0.35 + age * 0.5);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d - age * 16, R * (0.26 + (i % 3) * 0.04), 0, TAU);
      ctx.fillStyle = 'rgba(70, 62, 54, ' + (0.32 * (1 - age)) + ')';
      ctx.fill();
    }
    // 火球
    const fire = ctx.createRadialGradient(0, -R * 0.1, R * 0.05, 0, 0, R * 0.7);
    fire.addColorStop(0, '#fff6c2');
    fire.addColorStop(0.35, '#ffd23f');
    fire.addColorStop(0.7, '#ff7b25');
    fire.addColorStop(1, 'rgba(200, 60, 20, 0)');
    ctx.beginPath();
    ctx.arc(0, -R * 0.1, R * 0.72, 0, TAU);
    ctx.fillStyle = fire;
    ctx.fill();
    ctx.restore();
  }

  function drawSplat(ctx, o) {
    o = o || {};
    const age = Math.min(1, Math.max(0, o.age == null ? 0 : o.age));
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age);
    const color = o.kind === 'snow' ? '#a9e8f7' : '#7cc63f';
    const core = o.kind === 'snow' ? '#dff8ff' : '#a8e26a';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4;
      const d = 4 + age * 13;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 3.4 * (1 - age * 0.5), 0, TAU);
      ctx.fillStyle = i % 2 ? color : core;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 5 * (1 - age * 0.4), 0, TAU);
    ctx.fillStyle = core;
    ctx.fill();
    ctx.restore();
  }

  function drawZombieHead(ctx, o) {
    o = o || {};
    const t = o.t || 0;
    ctx.save();
    ctx.translate(0, Math.sin(t * 3) * 1.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 21, 0.1, 0, TAU);
    ctx.fillStyle = '#9fbb85';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // 缺一块的头皮
    ctx.beginPath();
    ctx.moveTo(-12, -15);
    ctx.quadraticCurveTo(-4, -22, 3, -16);
    ctx.strokeStyle = '#6e8a58';
    ctx.lineWidth = 3;
    ctx.stroke();
    eye(ctx, -8, -5, 5, 5, -1);
    eye(ctx, 6, -6, 4.5, 5, -1);
    // 嘴
    ctx.beginPath();
    ctx.moveTo(-7, 9);
    ctx.quadraticCurveTo(0, 14, 8, 9);
    ctx.strokeStyle = '#3a2a1c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 脖子
    ctx.beginPath();
    ctx.moveTo(-6, 19);
    ctx.lineTo(-4, 25);
    ctx.lineTo(6, 25);
    ctx.lineTo(7, 19);
    ctx.closePath();
    ctx.fillStyle = '#8fa876';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  /* ================================================================ 植物 */

  function plantFlash(ctx, flash, x, y, rx, ry) {
    if (!flash) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.75, flash * 0.7);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** 简笔向日葵：扁平色块 + 粗描边 + 豆豆眼 */
  function pSunflower(ctx, o) {
    const t = o.t || 0;
    const hp = o.hpRatio == null ? 1 : o.hpRatio;
    const low = hp < 0.6;
    const panic = hp < 0.3;
    const sway = Math.sin(t * 1.3) * 0.05 + (low ? 0.12 : 0);
    const breathe = 1 + Math.sin(t * 1.3 + 0.6) * 0.01;

    groundShadow(ctx, 32, 0.2);
    // 茎
    stem(ctx, 0, -4, 3, -42, 0, -74, 8, '#5fae3a');
    // 两片简笔叶子
    leaf(ctx, -4, -22, 34, 15, -2.55, '#5fae3a', 'rgba(30, 62, 16, 0.28)');
    leaf(ctx, 4, -34, 29, 13, -0.5, '#6cbb42', 'rgba(30, 62, 16, 0.28)');

    ctx.save();
    ctx.translate(0, -78);
    ctx.rotate(sway);
    ctx.scale(breathe, breathe);

    // 一圈扁平面花瓣
    for (let i = 0; i < 12; i++) {
      ctx.save();
      ctx.rotate((i / 12) * TAU);
      ctx.beginPath();
      ctx.ellipse(0, -33.5, 10.5, 15.2, 0, 0, TAU);
      ctx.fillStyle = i % 2 ? '#ffc62c' : '#ffd23f';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#3b2a12';
      ctx.stroke();
      ctx.restore();
    }

    // 花盘：两圈扁平色，给脸留干净底色
    ctx.beginPath();
    ctx.arc(0, 0, 22.5, 0, TAU);
    ctx.fillStyle = '#b06b2e';
    ctx.fill();
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#3b2a12';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 18.2, 0, TAU);
    ctx.fillStyle = '#c9883f';
    ctx.fill();

    // 豆豆眼
    const blink = !low && (t % 4.4) < 0.11;
    if (blink) {
      ctx.strokeStyle = '#2b1a0a';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-9, -2.5, 4.6, 0.15, Math.PI - 0.15); ctx.stroke();
      ctx.beginPath(); ctx.arc(9, -2.5, 4.6, 0.15, Math.PI - 0.15); ctx.stroke();
    } else {
      const er = panic ? 5.4 : 4.8;
      const ey = low ? -1.5 : -3.5;
      [-9, 9].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, ey, er, 0, TAU);
        ctx.fillStyle = '#2b1a0a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - er * 0.34, ey - er * 0.36, er * 0.34, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fill();
      });
      if (low) {
        ctx.strokeStyle = 'rgba(70, 36, 12, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-9, ey + er + 1.2, 4.4, 0.25, Math.PI - 0.25); ctx.stroke();
        ctx.beginPath(); ctx.arc(9, ey + er + 1.2, 4.4, 0.25, Math.PI - 0.25); ctx.stroke();
      }
    }

    // 腮红
    if (!panic) {
      ctx.fillStyle = 'rgba(230, 118, 78, 0.32)';
      ctx.beginPath(); ctx.arc(-14.5, 6.5, 3.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(14.5, 6.5, 3.6, 0, TAU); ctx.fill();
    }

    // 嘴
    ctx.strokeStyle = '#2b1a0a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    if (panic) {
      ctx.beginPath();
      ctx.ellipse(0, 10.5, 3.4, 4.6, 0, 0, TAU);
      ctx.fillStyle = '#2b1a0a';
      ctx.fill();
    } else if (low) {
      ctx.beginPath();
      ctx.moveTo(-5, 10.5);
      ctx.quadraticCurveTo(0, 7.5, 5, 10.5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-5.2, 6.8);
      ctx.quadraticCurveTo(0, 12, 5.2, 6.8);
      ctx.stroke();
    }
    ctx.restore();

    plantFlash(ctx, o.flash, 0, -78, 34, 32);
  }

  function peaHead(ctx, o, cfg) {
    const t = o.t || 0;
    const shoot = o.state === 'shoot';
    const recoil = shoot ? -4 : 0;
    ctx.save();
    ctx.translate(recoil, 0);
    // 头身
    ctx.beginPath();
    ctx.moveTo(-26, -44);
    ctx.quadraticCurveTo(-30, -68, -12, -76);
    ctx.quadraticCurveTo(8, -84, 22, -70);
    ctx.quadraticCurveTo(30, -60, 28, -48);
    ctx.quadraticCurveTo(25, -36, 8, -34);
    ctx.quadraticCurveTo(-16, -32, -26, -44);
    ctx.closePath();
    ctx.fillStyle = cfg.mid;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    // 头顶叶片
    leaf(ctx, -6, -76, 20, 8, -0.5, cfg.leaf, 'rgba(30, 62, 16, 0.28)');
    // 炮口
    ctx.beginPath();
    ctx.ellipse(24, -55, 14, 15, -0.12, 0, TAU);
    ctx.fillStyle = cfg.snout;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(26, -55, 8.5, 9.5, -0.12, 0, TAU);
    ctx.fillStyle = cfg.hole;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    if (shoot) {
      ctx.beginPath();
      ctx.arc(38, -55, 9, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 210, 0.8)';
      ctx.fill();
    }
    // 黑豆眼 + 高光
    ctx.beginPath();
    ctx.arc(6, -63, 6.2, 0, TAU);
    ctx.fillStyle = '#2b1a0a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(4, -65.4, 2, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fill();
    // 嘴
    ctx.beginPath();
    ctx.moveTo(8, -48);
    ctx.quadraticCurveTo(14, -44, 21, -47);
    ctx.strokeStyle = '#2e4a14';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function pPeashooter(ctx, o) {
    const t = o.t || 0;
    groundShadow(ctx, 28);
    stem(ctx, 0, -3, 4, -24, 0, -42, 7, '#5aa833');
    leaf(ctx, -2, -20, 25, 12, -2.6, '#5fae3a');
    leaf(ctx, 3, -24, 22, 11, -0.55, '#68b843');
    peaHead(ctx, o, {
      mid: '#7cc63f', snout: '#6bb52f', leaf: '#6cbb42',
      hole: '#3f6b1f'
    });
    plantFlash(ctx, o.flash, 0, -58, 28, 26);
  }

  function pRepeater(ctx, o) {
    const t = o.t || 0;
    groundShadow(ctx, 32);
    stem(ctx, 0, -3, 5, -24, 0, -44, 8, '#4f9c31');
    leaf(ctx, -2, -20, 27, 13, -2.6, '#4f9c31');
    leaf(ctx, 3, -25, 24, 12, -0.55, '#5aa833');
    ctx.save();
    const shoot = o.state === 'shoot';
    ctx.translate(shoot ? -5 : 0, 0);
    // 更壮的头
    ctx.beginPath();
    ctx.moveTo(-30, -40);
    ctx.quadraticCurveTo(-34, -72, -10, -82);
    ctx.quadraticCurveTo(14, -90, 26, -72);
    ctx.quadraticCurveTo(34, -60, 30, -44);
    ctx.quadraticCurveTo(26, -30, 4, -28);
    ctx.quadraticCurveTo(-20, -28, -30, -40);
    ctx.closePath();
    ctx.fillStyle = '#5aa832';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    leaf(ctx, -8, -82, 22, 9, -0.55, '#4f9c31');
    // 双炮管
    [[-66, 15], [-48, 13]].forEach(([yy, rr2]) => {
      ctx.beginPath();
      ctx.ellipse(24, yy, rr2, rr2 + 1, -0.12, 0, TAU);
      ctx.fillStyle = '#4f8c25';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(26, yy, rr2 * 0.62, rr2 * 0.66, -0.12, 0, TAU);
      ctx.fillStyle = '#24450f';
      ctx.fill();
    });
    if (shoot) {
      ctx.beginPath();
      ctx.arc(42, -66, 9, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 210, 0.75)';
      ctx.fill();
    }
    // 黑豆眼 + 高光
    [[4, -62, 6], [15, -57, 4.2]].forEach(([ex, ey, er]) => {
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, TAU);
      ctx.fillStyle = '#2b1a0a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex - er * 0.35, ey - er * 0.36, er * 0.34, 0, TAU);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();
    });
    // 嘴
    ctx.beginPath();
    ctx.moveTo(4, -40);
    ctx.quadraticCurveTo(14, -35, 24, -40);
    ctx.strokeStyle = '#24450f';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    plantFlash(ctx, o.flash, 0, -60, 32, 30);
  }

  function pSnowpea(ctx, o) {
    groundShadow(ctx, 28);
    stem(ctx, 0, -3, 4, -24, 0, -42, 7, '#56a7bd');
    leaf(ctx, -2, -20, 25, 12, -2.6, '#6db9cd');
    leaf(ctx, 3, -24, 22, 11, -0.55, '#86cfe2');
    peaHead(ctx, o, {
      mid: '#aeeaf7', snout: '#8fd7e8', leaf: '#a9e6f2',
      hole: '#2f7f99'
    });
    // 冷气与雪花
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(230, 252, 255, 0.95)';
    ctx.lineWidth = 1.6;
    [[40, -70, 4], [46, -58, 3], [38, -44, 3.5]].forEach(([x, y, r]) => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
    });
    ctx.restore();
    plantFlash(ctx, o.flash, 0, -58, 28, 26);
  }

  function pWallnut(ctx, o) {
    const t = o.t || 0;
    const hp = o.hpRatio == null ? 1 : o.hpRatio;
    groundShadow(ctx, 32);
    const wob = Math.sin(t * 1.8) * 0.02;
    ctx.save();
    ctx.rotate(wob);
    const pts = [
      [-28, -30], [-33, -48], [-27, -64], [-16, -76], [-2, -82],
      [13, -79], [25, -68], [31, -51], [29, -33], [21, -19],
      [10, -12], [-4, -11], [-18, -17]
    ];
    smooth(ctx, pts);
    ctx.fillStyle = '#c08a4e';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    // 顶部小芽
    ctx.beginPath();
    ctx.moveTo(-2, -80);
    ctx.quadraticCurveTo(2, -92, 8, -86);
    ctx.strokeStyle = '#6d8a3a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    // 两笔简单纹理
    ctx.save();
    smooth(ctx, pts);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120, 72, 30, 0.4)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-22, -64);
    ctx.quadraticCurveTo(-16, -40, -21, -18);
    ctx.moveTo(20, -62);
    ctx.quadraticCurveTo(25, -40, 20, -20);
    ctx.stroke();
    ctx.restore();
    // 表情
    const worry = hp < 0.66;
    const panic = hp < 0.33;
    if (panic) {
      ctx.strokeStyle = '#3d2410';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(-17, -49); ctx.lineTo(-4, -43);
      ctx.moveTo(-17, -43); ctx.lineTo(-4, -49);
      ctx.moveTo(4, -49); ctx.lineTo(17, -43);
      ctx.moveTo(4, -43); ctx.lineTo(17, -49);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -24, 8, 6.5, 0, 0, TAU);
      ctx.fillStyle = '#5b2f16';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.fillStyle = 'rgba(130, 200, 240, 0.9)';
      ctx.beginPath();
      ctx.moveTo(24, -58);
      ctx.quadraticCurveTo(32, -48, 24, -45);
      ctx.quadraticCurveTo(16, -48, 24, -58);
      ctx.fill();
    } else if (worry) {
      [[-10, -46, 5.4], [10, -46, 5.4]].forEach(([ex, ey, er]) => {
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, TAU);
        ctx.fillStyle = '#2b1a0a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex - er * 0.34, ey - er * 0.36, er * 0.34, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
      });
      ctx.beginPath();
      ctx.moveTo(-9, -27);
      ctx.quadraticCurveTo(0, -22, 9, -27);
      ctx.strokeStyle = '#5b3415';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      [[-10, -47, 6.2], [10, -47, 6.2]].forEach(([ex, ey, er]) => {
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, TAU);
        ctx.fillStyle = '#2b1a0a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex - er * 0.34, ey - er * 0.36, er * 0.34, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fill();
      });
      ctx.fillStyle = 'rgba(230, 128, 88, 0.32)';
      ctx.beginPath(); ctx.arc(-20, -34, 4.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(20, -34, 4.4, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, -28);
      ctx.quadraticCurveTo(0, -20, 8, -28);
      ctx.strokeStyle = '#5b3415';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    // 裂纹
    if (hp < 0.66) {
      ctx.strokeStyle = '#6b4522';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-20, -72);
      ctx.lineTo(-13, -60);
      ctx.lineTo(-18, -52);
      ctx.lineTo(-11, -42);
      ctx.stroke();
      if (hp < 0.33) {
        ctx.beginPath();
        ctx.moveTo(22, -70);
        ctx.lineTo(15, -58);
        ctx.lineTo(21, -50);
        ctx.lineTo(13, -38);
        ctx.stroke();
      }
    }
    ctx.restore();
    plantFlash(ctx, o.flash, 0, -48, 32, 36);
  }

  function pCherry(ctx, o) {
    const t = o.t || 0;
    const explode = o.state === 'explode';
    groundShadow(ctx, 34);
    const flick = 0.75 + Math.sin(t * 22) * 0.25;
    ctx.save();
    if (explode) ctx.scale(1.08, 1.08);
    // 茎
    ctx.strokeStyle = '#3f6e26';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -58);
    ctx.quadraticCurveTo(-6, -84, 2, -86);
    ctx.quadraticCurveTo(10, -88, 18, -70);
    ctx.stroke();
    leaf(ctx, 2, -86, 20, 8, -0.9, '#5fae3a');
    // 左樱桃
    ctx.beginPath();
    ctx.arc(-16, -38, 24, 0, TAU);
    ctx.fillStyle = '#d02f2f';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 右樱桃
    ctx.beginPath();
    ctx.arc(18, -52, 22, 0, TAU);
    ctx.fillStyle = '#c62828';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 表情：生气
    [[-16, -38, 1], [18, -52, -1]].forEach(([cx, cy, dir]) => {
      // 生气眉毛
      ctx.strokeStyle = '#3a0f0b';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 11 * dir, cy - 10);
      ctx.lineTo(cx + 2 * dir, cy - 6);
      ctx.stroke();
      // 黑豆眼 + 高光
      [[cx - 6, cy - 2, 4.8], [cx + 7, cy - 2, 4.8]].forEach(([ex, ey, er]) => {
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, TAU);
        ctx.fillStyle = '#2b0f0b';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex - er * 0.34, ey - er * 0.36, er * 0.34, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
      });
      // 咬牙（简笔一条线）
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy + 9);
      ctx.lineTo(cx + 7, cy + 9);
      ctx.strokeStyle = '#4a120c';
      ctx.lineWidth = 3;
      ctx.stroke();
    });
    // 引线
    ctx.strokeStyle = '#a1804f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, -72);
    ctx.bezierCurveTo(26, -84, 30, -94, 34, -96);
    ctx.stroke();
    // 火花
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.translate(35, -97);
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, TAU);
    ctx.fillStyle = '#ffe066';
    ctx.fill();
    ctx.strokeStyle = '#ff8a3c';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + t * 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
      ctx.stroke();
    }
    ctx.restore();
    // 简单高光
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath(); ctx.arc(-25, -47, 4.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -61, 3.4, 0, TAU); ctx.fill();
    ctx.restore();
    plantFlash(ctx, o.flash, 0, -46, 36, 34);
  }

  function pPotatoMine(ctx, o) {
    const t = o.t || 0;
    const armed = o.state === 'armed';
    groundShadow(ctx, 32);
    // 土堆
    ctx.beginPath();
    ctx.ellipse(0, -8, 32, 12, 0, 0, TAU);
    ctx.fillStyle = '#8f6539';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.6;
    ctx.stroke();
    // 土粒
    ctx.fillStyle = 'rgba(60, 40, 20, 0.45)';
    [[-20, -9], [-8, -6], [7, -11], [20, -7], [-3, -3]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, TAU);
      ctx.fill();
    });
    // 土豆
    ctx.save();
    ctx.translate(0, -4);
    ctx.beginPath();
    ctx.ellipse(0, -20, 23, 17, 0, 0, TAU);
    ctx.fillStyle = '#c9a05a';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    // 两笔简单凹凸
    ctx.strokeStyle = 'rgba(110, 75, 35, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-13, -18, 3, 0, TAU);
    ctx.arc(13, -24, 2.6, 0, TAU);
    ctx.stroke();
    if (armed) {
      // 警戒表情
      [[-8, -22, 5], [8, -22, 5]].forEach(([ex, ey, er]) => {
        ctx.beginPath();
        ctx.arc(ex, ey, er, 0, TAU);
        ctx.fillStyle = '#2b1a0a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex - er * 0.34, ey - er * 0.36, er * 0.34, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
      });
      ctx.strokeStyle = '#6b4418';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.quadraticCurveTo(0, -14, 6, -10);
      ctx.stroke();
      // 天线 + 红灯
      ctx.strokeStyle = '#5b4a2c';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -36);
      ctx.quadraticCurveTo(2, -46, 6, -48);
      ctx.stroke();
      const pulse = 0.6 + Math.sin(t * 6) * 0.4;
      ctx.save();
      ctx.globalAlpha = 0.35 * pulse;
      ctx.beginPath();
      ctx.arc(6, -49, 9, 0, TAU);
      ctx.fillStyle = '#ff3b30';
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(6, -49, 3.6, 0, TAU);
      ctx.fillStyle = '#ff3b30';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // 计时环
      ctx.strokeStyle = 'rgba(255, 210, 60, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -20, 26, -Math.PI / 2, -Math.PI / 2 + ((t * 0.8) % TAU));
      ctx.stroke();
    } else {
      // 睡觉
      ctx.strokeStyle = '#5b3a15';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-13, -23); ctx.quadraticCurveTo(-8, -19, -3, -23);
      ctx.moveTo(3, -23); ctx.quadraticCurveTo(8, -19, 13, -23);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, -12);
      ctx.quadraticCurveTo(0, -9, 4, -12);
      ctx.stroke();
      // zzz
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('z', 18, -36 + Math.sin(t * 2) * 2);
      ctx.fillText('Z', 27, -46 + Math.sin(t * 2 + 1) * 2);
    }
    ctx.restore();
    plantFlash(ctx, o.flash, 0, -28, 30, 22);
  }

  function drawPlant(ctx, type, opts) {
    const o = opts || {};
    ctx.save();
    const sc = o.scale || 1;
    ctx.scale(sc, sc);
    switch (type) {
      case 'sunflower': pSunflower(ctx, o); break;
      case 'peashooter': pPeashooter(ctx, o); break;
      case 'wallnut': pWallnut(ctx, o); break;
      case 'snowpea': pSnowpea(ctx, o); break;
      case 'repeater': pRepeater(ctx, o); break;
      case 'cherrybomb': pCherry(ctx, o); break;
      case 'potatomine': pPotatoMine(ctx, o); break;
      default: pPeashooter(ctx, o);
    }
    ctx.restore();
  }
  /* ================================================================ 僵尸 */

  const Z_SKIN = '#9fbb85';
  const Z_SKIN_DARK = '#7e9a66';
  const Z_SKIN_LIGHT = '#b9cfa3';
  const Z_SUIT = '#4c515c';
  const Z_SUIT_DARK = '#363a44';

  function zLimb(ctx, x1, y1, cx, cy, x2, y2, w, color) {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.strokeStyle = OUT;
    ctx.lineWidth = w + 2.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  function zShoe(ctx, x, y, dir) {
    ctx.beginPath();
    ctx.ellipse(x + dir * 5, y, 11, 6, 0, 0, TAU);
    ctx.fillStyle = '#2b2e36';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  function zHead(ctx, o) {
    const t = o.t;
    const skin = Z_SKIN;
    ctx.save();
    ctx.translate(-10, -118);
    // 脖子
    ctx.beginPath();
    rr(ctx, -6, 14, 13, 14, 4);
    ctx.fillStyle = Z_SKIN_DARK;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // 头骨
    ctx.beginPath();
    ctx.moveTo(-21, -2);
    ctx.quadraticCurveTo(-26, -17, -15, -25);
    ctx.quadraticCurveTo(0, -32, 14, -23);
    ctx.quadraticCurveTo(23, -12, 17, 4);
    ctx.quadraticCurveTo(12, 18, 0, 18);
    ctx.quadraticCurveTo(-14, 18, -21, -2);
    ctx.closePath();
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    // 耳朵
    ctx.beginPath();
    ctx.ellipse(18, 1, 4.5, 6, 0.2, 0, TAU);
    ctx.fillStyle = Z_SKIN_DARK;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 稀疏头发
    ctx.strokeStyle = '#3f4a32';
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-12 + i * 6, -27);
      ctx.quadraticCurveTo(-13 + i * 6, -34, -9 + i * 6, -37);
      ctx.stroke();
    }
    // 眼球（呆滞）
    if (!o.dead) {
      ctx.beginPath();
      ctx.arc(-10, -9, 4.2, 0, TAU);
      ctx.fillStyle = '#f4f0d8';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3, -11, 3.8, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-12, -9, 2, 0, TAU);
      ctx.fillStyle = '#1f1a12';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(1, -11, 1.8, 0, TAU);
      ctx.fill();
      // 高光
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(-12, -10.5, 1.2, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#2a2418';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -12); ctx.lineTo(-6, -7);
      ctx.moveTo(-6, -12); ctx.lineTo(-14, -7);
      ctx.moveTo(-1, -14); ctx.lineTo(7, -9);
      ctx.moveTo(7, -14); ctx.lineTo(-1, -9);
      ctx.stroke();
    }
    // 鼻子
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.lineTo(-7, 5);
    ctx.lineTo(0, 5);
    ctx.strokeStyle = Z_SKIN_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 下巴与嘴
    const open = o.eat ? 0.5 + Math.sin(t * 11) * 0.35 : 0.18;
    ctx.beginPath();
    ctx.moveTo(-17, 8);
    ctx.quadraticCurveTo(-6, 6, 6, 9);
    ctx.quadraticCurveTo(10, 18, 2, 22);
    ctx.quadraticCurveTo(-10, 24, -17, 16);
    ctx.closePath();
    ctx.fillStyle = '#6b3f36';
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // 牙齿
    ctx.fillStyle = '#e8e2c6';
    [[-13, 9], [-5, 8.6], [3, 9.4]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2.6, y);
      ctx.lineTo(x + 2.2, y + 5 - open * 2);
      ctx.lineTo(x + 0.2, y + 5 - open * 2);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  function zAccessory(ctx, type, o) {
    const t = o.t;
    const hp = o.hpRatio == null ? 1 : o.hpRatio;
    const damaged = hp < 0.5;
    const tilt = damaged ? 0.16 : 0;
    if (type === 'cone') {
      ctx.save();
      ctx.translate(-10, -136);
      ctx.rotate(-tilt);
      // 路障
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.lineTo(22, 2);
      ctx.quadraticCurveTo(0, 8, -22, 2);
      ctx.closePath();
      ctx.fillStyle = '#f07a24';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      // 白色警示带
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.lineTo(22, 2);
      ctx.quadraticCurveTo(0, 8, -22, 2);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = '#f7f2e2';
      ctx.fillRect(-24, -18, 48, 9);
      ctx.fillStyle = 'rgba(90, 40, 10, 0.25)';
      ctx.fillRect(-24, -8, 48, 3);
      ctx.restore();
      // 受损缺口
      if (damaged) {
        ctx.beginPath();
        ctx.moveTo(-20, -4);
        ctx.lineTo(-12, -9);
        ctx.lineTo(-15, 0);
        ctx.closePath();
        ctx.fillStyle = '#7a4518';
        ctx.fill();
      }
      ctx.restore();
    } else if (type === 'bucket') {
      ctx.save();
      ctx.translate(-10, -138);
      ctx.rotate(tilt * 0.8);
      // 铁桶
      ctx.beginPath();
      ctx.moveTo(-24, -34);
      ctx.lineTo(22, -34);
      ctx.lineTo(17, 4);
      ctx.quadraticCurveTo(0, 10, -19, 4);
      ctx.closePath();
      ctx.fillStyle = '#9aa4ab';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      // 桶沿
      ctx.beginPath();
      ctx.ellipse(-1, -34, 24, 6.5, 0, 0, TAU);
      ctx.fillStyle = '#b6bfc4';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-1, -34, 18, 4, 0, 0, TAU);
      ctx.fillStyle = '#5c666c';
      ctx.fill();
      // 提手
      ctx.beginPath();
      ctx.arc(-1, -36, 22, Math.PI * 1.05, Math.PI * 1.95);
      ctx.strokeStyle = '#4f585e';
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
    } else if (type === 'flag') {
      // 旗杆（握在右手）+ 破旗
      ctx.save();
      ctx.translate(-52, -86);
      ctx.strokeStyle = '#7a5230';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-4, -46, -6, -90);
      ctx.stroke();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-4, -46, -6, -90);
      ctx.stroke();
      // 旗帜布
      const wave = Math.sin(t * 4.2) * 4;
      ctx.beginPath();
      ctx.moveTo(-6, -90);
      ctx.quadraticCurveTo(22, -92 + wave, 44, -84 + wave * 0.6);
      ctx.quadraticCurveTo(40, -72 + wave * 0.5, 46, -62 + wave * 0.8);
      ctx.quadraticCurveTo(20, -66 - wave * 0.4, -6, -64);
      ctx.closePath();
      ctx.fillStyle = '#b23028';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // 破口
      ctx.beginPath();
      ctx.moveTo(44, -84 + wave * 0.6);
      ctx.lineTo(34, -78 + wave);
      ctx.lineTo(46, -74 + wave * 0.8);
      ctx.closePath();
      ctx.fillStyle = 'rgba(60, 15, 10, 0.55)';
      ctx.fill();
      // 白色叶片标志
      ctx.save();
      ctx.translate(16, -77 + wave * 0.4);
      ctx.rotate(-0.25);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(0, -10, 12, -2);
      ctx.quadraticCurveTo(2, 8, -10, 0);
      ctx.fillStyle = 'rgba(245, 238, 215, 0.92)';
      ctx.fill();
      ctx.restore();
      // 杆顶小球
      ctx.beginPath();
      ctx.arc(-6, -91, 3.4, 0, TAU);
      ctx.fillStyle = '#d8c39a';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.restore();
    } else if (type === 'football') {
      ctx.save();
      ctx.translate(-10, -118);
      // 头盔圆顶（只罩头顶）
      ctx.beginPath();
      ctx.arc(0, -13, 27, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#a8321f';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      // 后侧护片
      ctx.beginPath();
      ctx.ellipse(21, -16, 9, 13, 0.3, 0, TAU);
      ctx.fillStyle = '#8a2818';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      // 白色中条
      ctx.beginPath();
      ctx.moveTo(0, -39);
      ctx.quadraticCurveTo(2, -26, 0, -13);
      ctx.strokeStyle = '#f2e8d8';
      ctx.lineWidth = 5;
      ctx.stroke();
      // 面罩（只挡脸前，不遮眼睛）
      ctx.strokeStyle = '#c9ced2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-20, -4);
      ctx.quadraticCurveTo(-30, 6, -16, 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-22, -9);
      ctx.lineTo(-29, 1);
      ctx.moveTo(-14, -7);
      ctx.lineTo(-20, 7);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawZombie(ctx, type, opts) {
    const o = opts || {};
    const t = o.t || 0;
    const phase = o.phase || 0;
    const state = o.state || 'walk';
    const hp = o.hpRatio == null ? 1 : o.hpRatio;
    const slow = o.slow || 0;
    const flash = o.flash || 0;
    const dieK = state === 'die' ? Math.min(1, (o.deathT == null ? 0 : o.deathT) / 0.9) : 0;
    const walking = state === 'walk';
    const eating = state === 'eat';
    const swing = Math.sin(phase * TAU);
    const bob = walking ? Math.abs(Math.sin(phase * TAU)) * 3 : eating ? Math.sin(t * 9) * 1.2 : 0;
    const lean = eating ? -0.16 : -0.055;

    ctx.save();
    groundShadow(ctx, 36, 0.24);
    if (dieK > 0) ctx.globalAlpha = Math.max(0, 1 - dieK * 0.85);
    ctx.translate(0, -bob);
    ctx.rotate(lean + dieK * 1.02);

    // 后腿
    zLimb(ctx, -4, -46, -2 + swing * 8, -24, -12 - swing * 12, -6, 10, '#3a3f4a');
    zShoe(ctx, -12 - swing * 12, -5, -1);
    // 前腿
    zLimb(ctx, 4, -46, 6 - swing * 8, -24, 10 + swing * 12, -6, 10, '#4a505b');
    zShoe(ctx, 10 + swing * 12, -5, 1);

    // 破西装躯干
    ctx.beginPath();
    ctx.moveTo(-22, -50);
    ctx.quadraticCurveTo(-28, -74, -20, -96);
    ctx.quadraticCurveTo(-12, -108, 2, -108);
    ctx.quadraticCurveTo(16, -104, 20, -88);
    ctx.quadraticCurveTo(22, -68, 16, -52);
    ctx.quadraticCurveTo(10, -42, -4, -42);
    ctx.quadraticCurveTo(-16, -42, -22, -50);
    ctx.closePath();
    ctx.fillStyle = Z_SUIT;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = 2.8;
    ctx.stroke();
    // 衬衫与领带
    ctx.beginPath();
    ctx.moveTo(-14, -100);
    ctx.lineTo(-2, -76);
    ctx.lineTo(10, -100);
    ctx.quadraticCurveTo(-2, -94, -14, -100);
    ctx.closePath();
    ctx.fillStyle = '#d9d2c0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 55, 40, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2, -84);
    ctx.lineTo(3, -80);
    ctx.lineTo(1, -58);
    ctx.lineTo(-4, -58);
    ctx.closePath();
    ctx.fillStyle = '#a8322a';
    ctx.fill();
    ctx.strokeStyle = '#6b1d18';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 西装翻领
    ctx.strokeStyle = '#2c303a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-16, -100);
    ctx.lineTo(-6, -74);
    ctx.moveTo(12, -100);
    ctx.lineTo(3, -76);
    ctx.stroke();

    // 手臂（前伸）
    const claw = eating ? Math.sin(t * 10) * 5 : 0;
    zLimb(ctx, -14, -96, -34 + claw, -84, -52, -86 - claw * 0.5, 9, Z_SKIN_DARK);
    zLimb(ctx, 10, -94, -18 - swing * 5, -78, -44 + claw, -70, 9, Z_SKIN);
    // 西装袖子
    zLimb(ctx, -13, -97, -26, -91, -34, -87, 12, Z_SUIT);
    zLimb(ctx, 10, -95, -4, -84, -14, -78, 12, Z_SUIT_DARK);
    // 手掌
    [[-52, -86 - claw * 0.5], [-44 + claw, -70]].forEach(([hx, hy], i) => {
      ctx.beginPath();
      ctx.arc(hx, hy, 6.5, 0, TAU);
      ctx.fillStyle = i ? Z_SKIN : Z_SKIN_DARK;
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.2;
      ctx.stroke();
    });

    // 头
    zHead(ctx, { t, eat: eating, dead: dieK > 0.55 });

    // 装备
    zAccessory(ctx, type, { t, hpRatio: hp });

    // 受击白闪
    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.7, flash * 0.65);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-10, -118, 24, 27, 0.05, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, -76, 26, 32, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 冰冻覆盖
    if (slow > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.5, slow * 0.5);
      ctx.fillStyle = '#bff0ff';
      ctx.beginPath();
      ctx.ellipse(-10, -118, 25, 28, 0.05, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-2, -76, 27, 33, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = Math.min(0.9, slow);
      ctx.strokeStyle = '#eaffff';
      ctx.lineWidth = 1.8;
      [[-34, -130, 5], [14, -100, 4], [-30, -60, 4.5], [18, -40, 3.5]].forEach(([x, y, r]) => {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          ctx.stroke();
        }
      });
      ctx.restore();
    }
    ctx.restore();
  }

  /* ================================================================ 对外接口 */

  window.ART = {
    drawBackground: drawBackground,
    drawTopBar: drawTopBar,
    drawPlant: drawPlant,
    drawZombie: drawZombie,
    drawSun: drawSun,
    drawPea: drawPea,
    drawMower: drawMower,
    drawShovel: drawShovel,
    drawExplosion: drawExplosion,
    drawSplat: drawSplat,
    drawZombieHead: drawZombieHead
  };
})();
