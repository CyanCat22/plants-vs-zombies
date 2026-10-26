/* 植物大战僵尸 · HUD 与界面
 * 顶部种子栏 / 阳光计数 / 波次进度 / 铲子 / 暂停静音 / 开始·暂停·胜利·失败界面 / 波次横幅。
 */
(function () {
  'use strict';

  const CFG = window.PVZ_CONFIG;
  const L = CFG.LAYOUT;
  const P = CFG.PLANTS;
  const CARDS = CFG.CARD_ORDER;
  const Z = CFG.ZOMBIES;

  const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Heiti SC", sans-serif';
  const f = (size, weight) => `${weight || 600} ${size}px ${FONT}`;

  const BTN = {
    pause: { x: 1152, y: 88, w: 50, h: 28 },
    mute: { x: 1208, y: 88, w: 46, h: 28 },
    start: { x: 490, y: 452, w: 300, h: 74 },
    pausePanel: { x: 420, y: 180, w: 440, h: 340 },
    resume: { x: 448, y: 392, w: 122, h: 58 },
    pauseRestart: { x: 586, y: 392, w: 122, h: 58 },
    pauseMenu: { x: 724, y: 392, w: 122, h: 58 },
    endPanel: { x: 390, y: 150, w: 500, h: 420 },
    endRestart: { x: 466, y: 456, w: 178, h: 64 },
    endMenu: { x: 664, y: 456, w: 160, h: 64 }
  };

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function inRect(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function text(ctx, str, x, y, size, color, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = f(size, opts.weight);
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    if (opts.outline !== false) {
      ctx.lineWidth = opts.outlineWidth || Math.max(3, size * 0.14);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = opts.outlineColor || 'rgba(48, 32, 16, 0.9)';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function panel(ctx, x, y, w, h, opts) {
    opts = opts || {};
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, opts.top || '#3f2d18');
    g.addColorStop(1, opts.bottom || '#2a1d0f');
    ctx.fillStyle = g;
    rr(ctx, x, y, w, h, 22);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = opts.border || '#b98a4b';
    ctx.lineWidth = 4;
    rr(ctx, x + 2, y + 2, w - 4, h - 4, 20);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 230, 160, 0.18)';
    ctx.lineWidth = 2;
    rr(ctx, x + 9, y + 9, w - 18, h - 18, 15);
    ctx.stroke();
    ctx.restore();
  }

  function button(ctx, rect, label, opts) {
    opts = opts || {};
    const hover = opts.hover;
    ctx.save();
    const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
    if (opts.variant === 'green') {
      g.addColorStop(0, hover ? '#8fd14f' : '#79bd47');
      g.addColorStop(1, hover ? '#5f9e33' : '#4f8a2a');
    } else if (opts.variant === 'red') {
      g.addColorStop(0, hover ? '#e36049' : '#c74b36');
      g.addColorStop(1, hover ? '#b83c2a' : '#9c3222');
    } else {
      g.addColorStop(0, hover ? '#8a6a3f' : '#75552f');
      g.addColorStop(1, hover ? '#6a4d2a' : '#57401f');
    }
    ctx.fillStyle = g;
    rr(ctx, rect.x, rect.y, rect.w, rect.h, opts.radius || 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 200, 0.55)';
    ctx.lineWidth = 2.5;
    rr(ctx, rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3, opts.radius || 16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    rr(ctx, rect.x + 6, rect.y + 6, rect.w - 12, rect.h * 0.36, 10);
    ctx.fill();
    text(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, opts.fontSize || 24, '#fffdf3', {
      weight: 700,
      outlineWidth: 4
    });
    ctx.restore();
  }

  /* ------------------------------------------------------------------ 顶部栏 */

  function drawSunCounter(ctx, game) {
    const s = L.sunCounter;
    ctx.save();
    const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    g.addColorStop(0, '#f6e6b8');
    g.addColorStop(1, '#e3cd8d');
    ctx.fillStyle = g;
    rr(ctx, s.x, s.y, s.w, s.h, 14);
    ctx.fill();
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 3;
    rr(ctx, s.x + 1.5, s.y + 1.5, s.w - 3, s.h - 3, 13);
    ctx.stroke();
    // 阳光图标
    const pulse = game.sunPulse || 0;
    ctx.save();
    ctx.translate(s.x + s.w / 2, s.y + 34);
    const ps = 1 + pulse * 0.16;
    ctx.scale(ps, ps);
    window.ART.drawSun(ctx, { t: game.time * 0.6, r: 25, glow: 0.9 });
    ctx.restore();
    text(ctx, String(game.sun), s.x + s.w / 2, s.y + 76, 28 + pulse * 3, '#4a3417', { weight: 800, outline: false });
    ctx.restore();
  }

  const CARD_ICONS = {};
  function plantIcon(type) {
    if (CARD_ICONS[type]) return CARD_ICONS[type];
    const cv = document.createElement('canvas');
    cv.width = 120;
    cv.height = 150;
    const c = cv.getContext('2d');
    c.translate(60, 138);
    window.ART.drawPlant(c, type, {
      t: 0,
      scale: 1,
      hpRatio: 1,
      state: type === 'potatomine' ? 'armed' : 'idle',
      pop: 1,
      flash: 0
    });
    CARD_ICONS[type] = cv;
    return cv;
  }

  function drawSeedBar(ctx, game, hover) {
    const s = L.seed;
    for (let i = 0; i < CARDS.length; i++) {
      const type = CARDS[i];
      const def = P[type];
      const r = game.cardRect(i);
      const cd = game.cardCd[type] || 0;
      const cdMax = def.cooldown || 1;
      const selected = game.selected === type;
      const afford = game.sun >= def.cost && cd <= 0;
      const hy = hover && inRect(r, hover.x, hover.y);
      const yOff = selected ? -5 : hy ? -2 : 0;
      ctx.save();
      ctx.translate(0, yOff);

      // 卡底
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      g.addColorStop(0, '#f7ecc9');
      g.addColorStop(1, '#e6d3a0');
      ctx.fillStyle = g;
      rr(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.strokeStyle = selected ? '#ffd83d' : '#7d6136';
      ctx.lineWidth = selected ? 4 : 2.5;
      rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 9);
      ctx.stroke();
      if (selected) {
        ctx.shadowColor = 'rgba(255, 216, 61, 0.9)';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = 'rgba(255, 240, 160, 0.9)';
        ctx.lineWidth = 1.5;
        rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 9);
        ctx.stroke();
        ctx.shadowColor = 'transparent';
      }

      // 植物小像（缓存位图，避免每帧重绘 7 个角色）
      ctx.save();
      ctx.beginPath();
      rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 30, 8);
      ctx.clip();
      const icon = plantIcon(type);
      const scl = 0.54;
      ctx.drawImage(icon, r.x + r.w / 2 - 60 * scl, r.y + 68 - 138 * scl, 120 * scl, 150 * scl);
      ctx.restore();

      // 冷却遮罩
      if (cd > 0) {
        const hh = Math.min(r.h - 28, (r.h - 28) * (cd / cdMax));
        ctx.save();
        ctx.fillStyle = 'rgba(30, 34, 48, 0.62)';
        rr(ctx, r.x + 2, r.y + r.h - 28 - hh, r.w - 4, hh, 6);
        ctx.fill();
        ctx.restore();
      } else if (!afford) {
        ctx.fillStyle = 'rgba(40, 50, 90, 0.42)';
        rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 30, 8);
        ctx.fill();
      }

      // 阳光花费
      ctx.save();
      ctx.translate(r.x + 16, r.y + r.h - 14);
      window.ART.drawSun(ctx, { t: 0, r: 9, glow: 0 });
      ctx.restore();
      text(ctx, String(def.cost), r.x + r.w / 2 + 8, r.y + r.h - 14, 16,
        afford ? '#4a3417' : '#a03a2a', { weight: 800, outline: false });

      // 数字快捷键
      text(ctx, String(i + 1), r.x + 9, r.y + 11, 11, 'rgba(70, 50, 20, 0.7)', { weight: 700, outline: false, align: 'left' });
      ctx.restore();
    }

    // 悬停卡片说明
    if (hover && game.state === 'playing') {
      for (let i = 0; i < CARDS.length; i++) {
        const r = game.cardRect(i);
        if (inRect(r, hover.x, hover.y)) {
          const type = CARDS[i];
          const def = P[type];
          const tw = 236;
          const tx = Math.max(12, Math.min(L.W - tw - 12, r.x + r.w / 2 - tw / 2));
          const ty = r.y + r.h + 10;
          ctx.save();
          ctx.globalAlpha = 0.97;
          ctx.fillStyle = 'rgba(42, 29, 15, 0.95)';
          rr(ctx, tx, ty, tw, 84, 10);
          ctx.fill();
          ctx.strokeStyle = '#b98a4b';
          ctx.lineWidth = 2;
          rr(ctx, tx + 1, ty + 1, tw - 2, 82, 9);
          ctx.stroke();
          text(ctx, def.name, tx + 12, ty + 18, 15, '#ffe9b8', { weight: 700, align: 'left', outlineWidth: 3 });
          text(ctx, `${def.cost} 阳光`, tx + tw - 12, ty + 18, 13, '#ffd23f', { weight: 700, align: 'right', outlineWidth: 3 });
          ctx.font = f(12, 500);
          ctx.fillStyle = '#e7d9bb';
          ctx.textAlign = 'left';
          ctx.fillText(def.desc, tx + 12, ty + 40, tw - 24);
          ctx.fillText('快捷键 ' + (i + 1), tx + 12, ty + 62, tw - 24);
          ctx.restore();
          break;
        }
      }
    }

    // 铲子
    const sh = L.shovel;
    ctx.save();
    ctx.fillStyle = game.shovelMode ? '#f7e7b0' : '#e8d6a4';
    rr(ctx, sh.x, sh.y, sh.w, sh.h, 12);
    ctx.fill();
    ctx.strokeStyle = game.shovelMode ? '#ffd83d' : '#7d6136';
    ctx.lineWidth = game.shovelMode ? 4 : 2.5;
    rr(ctx, sh.x + 1, sh.y + 1, sh.w - 2, sh.h - 2, 11);
    ctx.stroke();
    ctx.save();
    ctx.translate(sh.x + sh.w / 2, sh.y + sh.h / 2 - 2);
    ctx.scale(0.95, 0.95);
    window.ART.drawShovel(ctx, { t: game.time, size: 1 });
    ctx.restore();
    text(ctx, '铲子', sh.x + sh.w / 2, sh.y + sh.h - 12, 12, '#5a4220', { weight: 700, outline: false });
    ctx.restore();
  }

  function drawWaveMeter(ctx, game) {
    const m = L.waveMeter;
    ctx.save();
    ctx.fillStyle = 'rgba(30, 20, 10, 0.55)';
    rr(ctx, m.x, m.y, m.w, m.h, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220, 190, 130, 0.45)';
    ctx.lineWidth = 2;
    rr(ctx, m.x + 1, m.y + 1, m.w - 2, m.h - 2, 11);
    ctx.stroke();

    let progress = 0;
    if (game.waveIndex >= 0) {
      const wave = CFG.WAVES[game.waveIndex];
      if (game.waveCleared) progress = (game.waveIndex + 1) / game.totalWaves;
      else progress = (game.waveIndex + Math.min(0.92, game.waveTimer / (wave ? wave.dur : 30))) / game.totalWaves;
    }
    const inner = { x: m.x + 8, y: m.y + 26, w: m.w - 16, h: 16 };
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    rr(ctx, inner.x, inner.y, inner.w, inner.h, 8);
    ctx.fill();
    const g = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
    g.addColorStop(0, '#f0c24b');
    g.addColorStop(0.6, '#e2703a');
    g.addColorStop(1, '#b8342a');
    ctx.fillStyle = g;
    if (progress > 0.002) {
      rr(ctx, inner.x, inner.y, Math.max(8, inner.w * Math.min(1, progress)), inner.h, 8);
      ctx.fill();
    }
    // 小旗标记（波次 5 / 10）
    [0.5, 1].forEach((p) => {
      const fx = inner.x + inner.w * p - 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(fx, inner.y - 2);
      ctx.lineTo(fx, inner.y + inner.h + 2);
      ctx.stroke();
    });
    // 文字
    let label;
    if (game.state === 'playing' && game.prepTimer > 0) label = `准备种植… ${Math.ceil(game.prepTimer)}s`;
    else if (game.waveIndex < 0) label = '准备中';
    else if (game.waveCleared && game.waveIndex < game.totalWaves - 1) label = `下一波 ${Math.ceil(game.gapTimer)}s`;
    else label = `第 ${Math.min(game.waveIndex + 1, game.totalWaves)} / ${game.totalWaves} 波`;
    text(ctx, label, m.x + m.w / 2, m.y + 14, 15, '#ffe9b8', { weight: 700, outlineWidth: 3 });

    // 剩余僵尸
    if (game.state === 'playing') {
      const remain = game.zombies.filter((z) => z.state !== 'dying').length + game.waveSpawnQueue.length;
      if (remain > 0) {
        text(ctx, `僵尸 ${remain}`, m.x + m.w - 14, m.y + 14, 13, '#ffb3a0', { weight: 700, align: 'right', outlineWidth: 3 });
      }
    }
    ctx.restore();
  }

  function drawHudButtons(ctx, game, hover) {
    const mute = window.SFX && window.SFX.muted;
    const p = BTN.pause;
    const ph = hover && inRect(p, hover.x, hover.y);
    ctx.save();
    ctx.fillStyle = ph ? 'rgba(255, 235, 180, 0.28)' : 'rgba(0, 0, 0, 0.3)';
    rr(ctx, p.x, p.y, p.w, p.h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 230, 170, 0.5)';
    ctx.lineWidth = 2;
    rr(ctx, p.x + 1, p.y + 1, p.w - 2, p.h - 2, 8);
    ctx.stroke();
    ctx.fillStyle = '#ffe9b8';
    ctx.fillRect(p.x + p.w / 2 - 9, p.y + 8, 6, 12);
    ctx.fillRect(p.x + p.w / 2 + 3, p.y + 8, 6, 12);

    const mu = BTN.mute;
    const mh = hover && inRect(mu, hover.x, hover.y);
    ctx.fillStyle = mh ? 'rgba(255, 235, 180, 0.28)' : 'rgba(0, 0, 0, 0.3)';
    rr(ctx, mu.x, mu.y, mu.w, mu.h, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 230, 170, 0.5)';
    ctx.lineWidth = 2;
    rr(ctx, mu.x + 1, mu.y + 1, mu.w - 2, mu.h - 2, 8);
    ctx.stroke();
    ctx.fillStyle = '#ffe9b8';
    ctx.beginPath();
    ctx.moveTo(mu.x + 12, mu.y + 10);
    ctx.lineTo(mu.x + 17, mu.y + 10);
    ctx.lineTo(mu.x + 23, mu.y + 6);
    ctx.lineTo(mu.x + 23, mu.y + 22);
    ctx.lineTo(mu.x + 17, mu.y + 18);
    ctx.lineTo(mu.x + 12, mu.y + 18);
    ctx.closePath();
    ctx.fill();
    if (mute) {
      ctx.strokeStyle = '#ff8e7a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(mu.x + 27, mu.y + 10);
      ctx.lineTo(mu.x + 38, mu.y + 19);
      ctx.moveTo(mu.x + 38, mu.y + 10);
      ctx.lineTo(mu.x + 27, mu.y + 19);
      ctx.stroke();
    } else {
      ctx.strokeStyle = '#ffe9b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mu.x + 24, mu.y + 14, 7, -0.8, 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBottomHints(ctx, game) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    const y = 688;
    text(ctx, '点击卡片 → 点击草坪种植', L.W / 2 - 250, y, 14, '#f1e5c6', { weight: 600, outlineWidth: 3 });
    text(ctx, '点击阳光收集', L.W / 2 - 40, y, 14, '#f1e5c6', { weight: 600, outlineWidth: 3 });
    text(ctx, '数字键 1–7 选卡 · 空格暂停 · M 静音', L.W / 2 + 210, y, 14, '#f1e5c6', { weight: 600, outlineWidth: 3 });
    ctx.restore();
  }

  /* ------------------------------------------------------------------ 横幅 */

  function drawBanner(ctx, game) {
    const b = game.banner;
    if (!b) return;
    const k = b.t / b.life;
    const inK = Math.min(1, b.t / 0.28);
    const outK = Math.min(1, Math.max(0, (b.life - b.t) / 0.5));
    const scale = 0.6 + 0.4 * (1 - Math.pow(1 - inK, 3)) + Math.sin(b.t * 22) * 0.006;
    const alpha = Math.min(inK, outK);
    const big = b.kind === 'flag' || b.kind === 'final';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(L.W / 2, big ? 208 : 190);
    ctx.scale(scale, scale);
    if (big) {
      ctx.fillStyle = 'rgba(40, 10, 6, 0.42)';
      rr(ctx, -250, -44, 500, 86, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 120, 80, 0.6)';
      ctx.lineWidth = 3;
      rr(ctx, -250, -44, 500, 86, 16);
      ctx.stroke();
      text(ctx, b.text, 0, 0, b.kind === 'final' ? 42 : 38, '#ffdf6b', {
        weight: 800,
        outlineColor: 'rgba(90, 20, 10, 0.95)',
        outlineWidth: 7
      });
    } else {
      text(ctx, b.text, 0, 0, 27, '#fff3d0', { weight: 700, outlineColor: 'rgba(60, 42, 20, 0.9)', outlineWidth: 6 });
    }
    ctx.restore();
    if (big && k < 0.25) {
      ctx.save();
      ctx.globalAlpha = (0.25 - k) * 0.5;
      ctx.fillStyle = '#ffdf6b';
      ctx.fillRect(0, 0, L.W, L.H);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ 菜单与覆盖层 */

  function drawMenu(ctx, game) {
    const t = game.time || performance.now() / 1000;
    window.ART.drawBackground(ctx, L, t, 'day');
    // 压暗
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, L.H);
    g.addColorStop(0, 'rgba(20, 30, 12, 0.35)');
    g.addColorStop(0.55, 'rgba(20, 30, 12, 0.15)');
    g.addColorStop(1, 'rgba(16, 22, 8, 0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.restore();

    // 主角阵容
    ctx.save();
    ctx.translate(300, 690);
    ctx.scale(1.25, 1.25);
    window.ART.drawPlant(ctx, 'sunflower', { t, scale: 1, hpRatio: 1, state: 'idle', pop: 1, flash: 0 });
    ctx.restore();
    ctx.save();
    ctx.translate(430, 700);
    ctx.scale(1.3, 1.3);
    window.ART.drawPlant(ctx, 'peashooter', { t: t + 0.8, scale: 1, hpRatio: 1, state: 'idle', pop: 1, flash: 0 });
    ctx.restore();
    ctx.save();
    ctx.translate(940, 692);
    ctx.scale(1.15, 1.15);
    window.ART.drawZombie(ctx, 'basic', { t, scale: 1, phase: 0.2, state: 'walk', hpRatio: 1, flash: 0, slow: 0 });
    ctx.restore();
    ctx.save();
    ctx.translate(1070, 700);
    ctx.scale(1.22, 1.22);
    window.ART.drawZombie(ctx, 'cone', { t: t + 0.5, scale: 1, phase: 0.65, state: 'walk', hpRatio: 1, flash: 0, slow: 0 });
    ctx.restore();

    // 标题牌
    ctx.save();
    const sway = Math.sin(t * 0.9) * 0.01;
    ctx.translate(L.W / 2, 190);
    ctx.rotate(sway);
    panel(ctx, -330, -96, 660, 190, { top: '#4a341c', bottom: '#2c1f10', border: '#d5a45e' });
    // 钉子
    [[-310, -76], [310, -76], [-310, 74], [310, 74]].forEach(([x, y]) => {
      ctx.fillStyle = '#d8c39a';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6b4d26';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    const tg = ctx.createLinearGradient(0, -70, 0, 30);
    tg.addColorStop(0, '#d9f27e');
    tg.addColorStop(0.55, '#8fd14f');
    tg.addColorStop(1, '#4f9c31');
    ctx.font = f(74, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#233d12';
    ctx.strokeText('植物大战僵尸', 0, -18);
    ctx.fillStyle = tg;
    ctx.fillText('植物大战僵尸', 0, -18);
    text(ctx, '草 坪 保 卫 战', 0, 54, 25, '#f7e3ae', { weight: 700, outlineColor: 'rgba(40, 26, 10, 0.9)', outlineWidth: 5 });
    ctx.restore();

    // 开始按钮
    const hoverStart = window.__pvzHover && inRect(BTN.start, window.__pvzHover.x, window.__pvzHover.y);
    ctx.save();
    const pulse = 1 + Math.sin(t * 3) * 0.012;
    ctx.translate(BTN.start.x + BTN.start.w / 2, BTN.start.y + BTN.start.h / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-(BTN.start.x + BTN.start.w / 2), -(BTN.start.y + BTN.start.h / 2));
    button(ctx, BTN.start, '开始游戏', { variant: 'green', hover: hoverStart, fontSize: 30, radius: 20 });
    ctx.restore();
    text(ctx, '按 Enter 也可以开始', L.W / 2, 548, 15, 'rgba(255, 245, 210, 0.8)', { weight: 600, outlineWidth: 3 });

    // 提示
    ctx.save();
    const hints = [
      '① 点击顶部卡片选中植物，再点草坪格子种下',
      '② 点击天上和向日葵产出的阳光来收集',
      '③ 别让僵尸走到最左边——每行只有一台割草机',
      '④ 挡住 10 波僵尸就赢，阳光是唯一资源'
    ];
    ctx.globalAlpha = 0.92;
    text(ctx, '玩法速览', L.W / 2, 586, 16, '#ffd97a', { weight: 700, outlineWidth: 4 });
    hints.forEach((line, i) => {
      text(ctx, line, L.W / 2, 612 + i * 21, 14, '#f4ecd8', { weight: 500, outlineWidth: 3 });
    });
    ctx.restore();
  }

  function drawPause(ctx, game, hover) {
    ctx.save();
    ctx.fillStyle = 'rgba(12, 16, 8, 0.62)';
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.restore();
    const p = BTN.pausePanel;
    panel(ctx, p.x, p.y, p.w, p.h);
    text(ctx, '暂停中', L.W / 2, p.y + 70, 46, '#ffe9b8', { weight: 800 });
    text(ctx, `第 ${Math.min(game.waveIndex + 1, game.totalWaves)} / ${game.totalWaves} 波 · 已击杀 ${game.killed} 只`, L.W / 2, p.y + 126, 17, '#d9c9a4', {
      weight: 600
    });
    text(ctx, '游戏已暂停，喝口水吧', L.W / 2, p.y + 158, 15, 'rgba(217, 201, 164, 0.8)', { weight: 500 });
    button(ctx, BTN.resume, '继续', { variant: 'green', hover: hover && inRect(BTN.resume, hover.x, hover.y), fontSize: 22 });
    button(ctx, BTN.pauseRestart, '重开', { hover: hover && inRect(BTN.pauseRestart, hover.x, hover.y), fontSize: 22 });
    button(ctx, BTN.pauseMenu, '返回标题', { hover: hover && inRect(BTN.pauseMenu, hover.x, hover.y), fontSize: 18 });
    text(ctx, '空格 / Esc 继续 · R 重开 · M 静音', L.W / 2, p.y + p.h - 24, 13, 'rgba(217, 201, 164, 0.75)', { weight: 500 });
  }

  function drawStats(ctx, game) {
    const mm = Math.floor(game.endedAt / 60);
    const ss = Math.floor(game.endedAt % 60).toString().padStart(2, '0');
    const left = game.mowers.filter((m) => !m.used && !m.active).length;
    const rows = [
      ['存活时长', `${mm}:${ss}`],
      ['击杀僵尸', `${game.killed} 只`],
      ['种下植物', `${game.planted} 株`],
      ['剩余割草机', `${left} 台`]
    ];
    ctx.save();
    rows.forEach((row, i) => {
      const y = 330 + i * 28;
      text(ctx, row[0], L.W / 2 - 110, y, 16, '#cbb98f', { weight: 600, align: 'right', outlineWidth: 2 });
      text(ctx, row[1], L.W / 2 - 80, y, 17, '#fff2cb', { weight: 800, align: 'left', outlineWidth: 3 });
    });
    ctx.restore();
  }

  function drawEnd(ctx, game, hover, won) {
    ctx.save();
    ctx.fillStyle = won ? 'rgba(16, 26, 8, 0.66)' : 'rgba(30, 8, 6, 0.72)';
    ctx.fillRect(0, 0, L.W, L.H);
    ctx.restore();
    const p = BTN.endPanel;
    panel(ctx, p.x, p.y, p.w, p.h, won
      ? { top: '#3b4a1c', bottom: '#22300f', border: '#cfe07a' }
      : { top: '#4a221a', bottom: '#2c0f0b', border: '#d58a6a' });

    if (won) {
      const t = performance.now() / 1000;
      ctx.save();
      ctx.translate(p.x + 60, p.y + 70);
      window.ART.drawSun(ctx, { t, r: 34, glow: 1 });
      ctx.restore();
      text(ctx, '草坪守住了！', L.W / 2 + 20, p.y + 76, 44, '#e9ff9b', { weight: 900 });
      text(ctx, '僵尸们灰溜溜地撤退了，你的脑子保住了。', L.W / 2, p.y + 132, 15, '#d7e6b0', { weight: 500, outlineWidth: 2 });
    } else {
      text(ctx, '僵尸吃掉了你的脑子…', L.W / 2, p.y + 76, 38, '#ffb09a', { weight: 900 });
      text(ctx, '别灰心，多种向日葵、早点布防再来一次。', L.W / 2, p.y + 132, 15, '#e8c4b8', { weight: 500, outlineWidth: 2 });
    }
    ctx.save();
    ctx.strokeStyle = won ? 'rgba(220, 240, 150, 0.3)' : 'rgba(230, 150, 120, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 60, p.y + 172);
    ctx.lineTo(p.x + p.w - 60, p.y + 172);
    ctx.stroke();
    ctx.restore();

    drawStats(ctx, game);

    button(ctx, BTN.endRestart, '再玩一次', { variant: 'green', hover: hover && inRect(BTN.endRestart, hover.x, hover.y), fontSize: 24 });
    button(ctx, BTN.endMenu, '返回标题', { hover: hover && inRect(BTN.endMenu, hover.x, hover.y), fontSize: 20 });
  }

  /* ------------------------------------------------------------------ 对外 */

  const HUD = {
    BTN,
    draw(ctx, game, hover) {
      window.__pvzHover = hover;
      if (game.state === 'menu') {
        drawMenu(ctx, game);
        return;
      }
      game.draw(ctx, hover);
      window.ART.drawTopBar(ctx, L, game.time);
      drawSunCounter(ctx, game);
      drawSeedBar(ctx, game, hover);
      drawWaveMeter(ctx, game);
      drawHudButtons(ctx, game, hover);
      drawBottomHints(ctx, game);
      drawBanner(ctx, game);
      if (game.state === 'paused') drawPause(ctx, game, hover);
      else if (game.state === 'won') drawEnd(ctx, game, hover, true);
      else if (game.state === 'lost') drawEnd(ctx, game, hover, false);
    },
    hitTest(game, x, y) {
      if (game.state === 'menu') {
        if (inRect(BTN.start, x, y)) return 'start';
        return null;
      }
      if (game.state === 'paused') {
        if (inRect(BTN.resume, x, y)) return 'resume';
        if (inRect(BTN.pauseRestart, x, y)) return 'restart';
        if (inRect(BTN.pauseMenu, x, y)) return 'menu';
        return null;
      }
      if (game.state === 'won' || game.state === 'lost') {
        if (inRect(BTN.endRestart, x, y)) return 'restart';
        if (inRect(BTN.endMenu, x, y)) return 'menu';
        return null;
      }
      if (inRect(BTN.pause, x, y)) return 'pause';
      if (inRect(BTN.mute, x, y)) return 'mute';
      return null;
    }
  };

  window.HUD = HUD;
})();