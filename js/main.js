/* 植物大战僵尸 · 启动、缩放、输入与主循环 */
(function () {
  'use strict';

  const CFG = window.PVZ_CONFIG;
  const L = CFG.LAYOUT;
  const CARDS = CFG.CARD_ORDER;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const game = new window.PVZGame();
  let hover = null;
  let viewScale = 1;
  let last = performance.now();
  let acc = 0;
  let webglOk = true;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = Math.min(window.innerWidth / L.W, window.innerHeight / L.H);
    const cssW = Math.max(320, Math.floor(L.W * fit));
    const cssH = Math.max(180, Math.floor(L.H * fit));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    viewScale = canvas.width / L.W;
  }

  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) / r.width) * L.W,
      y: ((ev.clientY - r.top) / r.height) * L.H
    };
  }

  function safe(fn, label) {
    try {
      fn();
    } catch (err) {
      console.error('[PvZ] ' + label + ' 出错:', err);
    }
  }

  /* ------------------------------------------------------------------ 输入 */

  function onPointerDown(ev) {
    if (ev.button === 2) return;
    ev.preventDefault();
    const pos = toLogical(ev);
    if (window.SFX) {
      window.SFX.init();
      window.SFX.play('click', { vol: 0.35 });
    }
    if (game.state === 'menu') {
      if (window.HUD.hitTest(game, pos.x, pos.y) === 'start') game.start();
      return;
    }
    const action = window.HUD.hitTest(game, pos.x, pos.y);
    if (action === 'pause') { game.togglePause(); return; }
    if (action === 'mute') { toggleMute(); return; }
    if (action === 'resume') { game.togglePause(); return; }
    if (action === 'restart') { game.start(); return; }
    if (action === 'menu') { backToMenu(); return; }
    if (game.state === 'playing') game.handleClick(pos.x, pos.y);
  }

  function onPointerMove(ev) {
    const pos = toLogical(ev);
    hover = pos;
    game.hover = pos;
  }

  function onPointerLeave() {
    hover = null;
    game.hover = null;
  }

  function onContextMenu(ev) {
    ev.preventDefault();
    game.cancelSelection();
    if (window.SFX) window.SFX.play('click', { vol: 0.25 });
  }

  function toggleMute() {
    if (!window.SFX) return;
    const muted = window.SFX.toggleMuted();
    if (!muted) window.SFX.play('click');
  }

  function backToMenu() {
    game.reset();
    if (window.SFX) window.SFX.stopMusic();
  }

  function onKeyDown(ev) {
    const k = ev.key;
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    if (game.state === 'menu') {
      if (k === 'Enter' || k === ' ') { ev.preventDefault(); game.start(); }
      return;
    }
    if (game.state === 'paused') {
      if (k === ' ' || k === 'Escape' || k === 'Enter') { ev.preventDefault(); game.togglePause(); }
      else if (k === 'r' || k === 'R') game.start();
      return;
    }
    if (game.state === 'won' || game.state === 'lost') {
      if (k === 'r' || k === 'R' || k === 'Enter' || k === ' ') { ev.preventDefault(); game.start(); }
      return;
    }
    // 进行中
    if (k >= '1' && k <= '7') {
      const type = CARDS[Number(k) - 1];
      if (!type) return;
      if ((game.cardCd[type] || 0) > 0 || game.sun < CFG.PLANTS[type].cost) {
        if (window.SFX) window.SFX.play('error', { vol: 0.4 });
        return;
      }
      game.selected = game.selected === type ? null : type;
      game.shovelMode = false;
      if (window.SFX) window.SFX.play('seedSelect', { vol: 0.5 });
      return;
    }
    if (k === 'Escape') {
      if (game.selected || game.shovelMode) game.cancelSelection();
      else game.togglePause();
      return;
    }
    if (k === ' ') { ev.preventDefault(); game.togglePause(); return; }
    if (k === 'p' || k === 'P') { game.togglePause(); return; }
    if (k === 'r' || k === 'R') { game.start(); return; }
    if (k === 's' || k === 'S') { game.shovelMode = !game.shovelMode; game.selected = null; return; }
  }

  /* ------------------------------------------------------------------ 主循环 */

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    acc += dt * game.timeScale;
    const step = 1 / 60;
    let loops = 0;
    while (acc >= step && loops < 16) {
      game.update(step);
      acc -= step;
      loops++;
    }
    if (loops >= 16) acc = 0;
    render();
  }

  function render() {
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    safe(() => window.HUD.draw(ctx, game, hover), 'draw');
  }

  /* ------------------------------------------------------------------ 初始化 */

  window.addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'playing') game.togglePause();
  });
  window.addEventListener('blur', () => {
    if (game.state === 'playing') game.togglePause();
  });

  resize();
  // 首帧立即绘制，避免黑屏
  requestAnimationFrame((t) => { last = t; frame(t); });

  window.PVZ = {
    game,
    ready: true,
    start: () => game.start(),
    addSun: (n) => { game.sun = Math.min(CFG.TUNING.maxSun, game.sun + (n || 25)); },
    spawn: (type, row) => game.spawnZombie(type, row == null ? 0 : row),
    startWave: (i) => game.startWave(i),
    killAll: () => game.zombies.forEach((z) => game.killZombie(z, 'boom')),
    setTimeScale: (s) => { game.timeScale = Math.max(0.25, Math.min(8, Number(s) || 1)); },
    end: (won) => game.endGame(!!won),
    gameState: () => game.stats()
  };
  window.PVZ_READY = true;
})();