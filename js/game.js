/* 植物大战僵尸 · 核心引擎
 * 负责：阳光经济、种植、僵尸波次、子弹与伤害、割草机、胜负判定、粒子特效。
 * 渲染顺序与 HUD 由 hud.js 完成；输入由 main.js 完成。
 */
(function () {
  'use strict';

  const CFG = window.PVZ_CONFIG;
  const L = CFG.LAYOUT;
  const P = CFG.PLANTS;
  const Z = CFG.ZOMBIES;
  const WAVES = CFG.WAVES;
  const T = CFG.TUNING;
  const CARDS = CFG.CARD_ORDER;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const laneBottom = (row) => L.lawn.y + (row + 1) * L.lawn.cell - 4;
  const laneCenterY = (row) => L.lawn.y + row * L.lawn.cell + L.lawn.cell * 0.5;
  const cellCenterX = (col) => L.lawn.x + col * L.lawn.cell + L.lawn.cell / 2;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  class Game {
    constructor() {
      this.state = 'menu';
      this.timeScale = 1;
      this.time = 0;
      this.reset();
    }

    /* ---------------------------------------------------------------- 初始化 */

    reset() {
      this.state = 'menu';
      this.time = 0;
      this.sun = T.startSun;
      this.grid = [];
      for (let r = 0; r < L.lawn.rows; r++) this.grid.push(new Array(L.lawn.cols).fill(null));
      this.plants = [];
      this.zombies = [];
      this.projectiles = [];
      this.suns = [];
      this.particles = [];
      this.splats = [];
      this.texts = [];
      this.explosions = [];
      this.mowers = [];
      for (let r = 0; r < L.lawn.rows; r++) {
        this.mowers.push({ row: r, x: L.mowerX, active: false, used: false });
      }
      this.selected = null;
      this.shovelMode = false;
      this.cardCd = {};
      CARDS.forEach((t) => { this.cardCd[t] = 0; });
      this.waveIndex = -1;
      this.waveTimer = 0;
      this.waveSpawnQueue = [];
      this.waveCleared = true;
      this.gapTimer = 0;
      this.prepTimer = 0;
      this.banner = null;
      this.killed = 0;
      this.planted = 0;
      this.totalSpawned = 0;
      this.skySunTimer = T.skySunFirst;
      this.groanTimer = 5;
      this.shake = 0;
      this.flashRed = 0;
      this.sunPulse = 0;
      this.hover = null;
      this.nextId = 1;
      this.endedAt = 0;
      this.lastWaveCleared = false;
    }

    start() {
      this.reset();
      this.state = 'playing';
      this.prepTimer = 15;
      this.waveIndex = 0;
      this.waveCleared = false;
      this.banner = { text: '准备种植，僵尸马上就来！', t: 0, life: 3.2, kind: 'info' };
      if (window.SFX) { window.SFX.init(); window.SFX.startMusic(); }
    }

    /* ---------------------------------------------------------------- 波次 */

    get totalWaves() { return WAVES.length; }

    startWave(index) {
      const wave = WAVES[index];
      if (!wave) return;
      this.waveIndex = index;
      this.waveTimer = 0;
      this.waveCleared = false;
      this.gapTimer = 0;
      this.waveSpawnQueue = [];
      const list = [];
      Object.keys(wave.pool).forEach((type) => {
        for (let i = 0; i < wave.pool[type]; i++) list.push(type);
      });
      shuffle(list);
      // 旗帜僵尸领头
      const flagIdx = list.indexOf('flag');
      if (flagIdx > 0) { list.splice(flagIdx, 1); list.unshift('flag'); }
      const n = list.length;
      const rows = [];
      for (let i = 0; i < n; i++) {
        let row = Math.floor(Math.random() * L.lawn.rows);
        // 避免同一行连续刷太多
        const recent = rows.slice(-2);
        if (recent.length === 2 && recent[0] === row && recent[1] === row) row = (row + 1 + Math.floor(Math.random() * (L.lawn.rows - 1))) % L.lawn.rows;
        rows.push(row);
      }
      list.forEach((type, i) => {
        const at = n === 1 ? 0 : (i / n) * wave.dur * 0.86 + rand(0, 1.4);
        this.waveSpawnQueue.push({ type, row: rows[i], at });
      });
      this.waveSpawnQueue.sort((a, b) => a.at - b.at);
      if (wave.banner) {
        this.banner = { text: wave.banner, t: 0, life: 4.2, kind: wave.final ? 'final' : 'flag' };
        if (window.SFX) window.SFX.play('waveHorn');
      }
      if (window.SFX) window.SFX.play('zombieGroan', { vol: 0.7 });
    }

    updateWaves(dt) {
      if (this.prepTimer > 0) {
        this.prepTimer -= dt;
        if (this.prepTimer <= 0) this.startWave(0);
        return;
      }
      if (this.waveCleared) {
        this.gapTimer -= dt;
        if (this.gapTimer <= 0) {
          if (this.waveIndex < WAVES.length - 1) this.startWave(this.waveIndex + 1);
        }
        return;
      }
      this.waveTimer += dt;
      while (this.waveSpawnQueue.length && this.waveSpawnQueue[0].at <= this.waveTimer) {
        const s = this.waveSpawnQueue.shift();
        this.spawnZombie(s.type, s.row);
      }
      if (!this.waveSpawnQueue.length && !this.zombies.length && this.waveTimer > 1.2) {
        this.waveCleared = true;
        const isFinal = this.waveIndex >= WAVES.length - 1;
        if (isFinal) {
          this.endGame(true);
        } else {
          this.gapTimer = WAVES[this.waveIndex].gap;
          this.banner = { text: '这一波守住了！', t: 0, life: 2.0, kind: 'info' };
        }
      }
    }

    /* ---------------------------------------------------------------- 实体创建 */

    spawnZombie(type, row) {
      const def = Z[type];
      if (!def) return null;
      const z = {
        id: this.nextId++,
        type,
        row: clamp(row | 0, 0, L.lawn.rows - 1),
        x: L.zombieSpawnX + rand(0, 46),
        y: laneBottom(clamp(row | 0, 0, L.lawn.rows - 1)),
        hp: def.hp,
        maxHp: def.hp,
        speed: def.speed,
        eatDps: def.eatDps,
        state: 'walk',
        phase: Math.random(),
        animT: 0,
        eatTimer: 0,
        biteAnim: 0,
        slow: 0,
        flash: 0,
        dyingT: 0,
        groanTimer: rand(3, 9)
      };
      this.zombies.push(z);
      this.totalSpawned++;
      return z;
    }

    plantAt(col, row, type) {
      if (this.state !== 'playing') return { ok: false, reason: 'state' };
      if (col < 0 || col >= L.lawn.cols || row < 0 || row >= L.lawn.rows) return { ok: false, reason: 'out' };
      const def = P[type];
      if (!def) return { ok: false, reason: 'type' };
      if (this.grid[row][col]) return { ok: false, reason: 'occupied' };
      if ((this.cardCd[type] || 0) > 0) return { ok: false, reason: 'cooldown' };
      if (this.sun < def.cost) return { ok: false, reason: 'sun' };
      const now = performance.now();
      const plant = {
        id: this.nextId++,
        type,
        col,
        row,
        x: cellCenterX(col),
        y: laneBottom(row),
        hp: def.hp,
        maxHp: def.hp,
        age: 0,
        pop: 0,
        state: 'idle',
        stateT: 0,
        fireTimer: rand(0, 0.3),
        sunTimer: def.firstSun || 6,
        armed: false,
        armTimer: def.armTime || 0,
        fuse: def.fuse || 0,
        flash: 0,
        pendingShots: [],
        lastShotAt: 0,
        hurtT: 0
      };
      this.grid[row][col] = plant;
      this.plants.push(plant);
      this.sun -= def.cost;
      this.cardCd[type] = def.cooldown;
      this.planted++;
      this.selected = null;
      this.shovelMode = false;
      this.addDirtBurst(plant.x, plant.y);
      if (window.SFX) window.SFX.play('plant');
      return { ok: true, plant };
    }

    removePlant(plant, reason) {
      if (!plant) return;
      const idx = this.plants.indexOf(plant);
      if (idx >= 0) this.plants.splice(idx, 1);
      if (this.grid[plant.row] && this.grid[plant.row][plant.col] === plant) this.grid[plant.row][plant.col] = null;
      plant.dead = true;
      if (reason === 'shovel') {
        this.addDirtBurst(plant.x, plant.y, 14);
        if (window.SFX) window.SFX.play('shovel');
      }
    }

    spawnSun(x, y, targetY, value, fromSky) {
      this.suns.push({
        id: this.nextId++,
        x, y,
        targetY: targetY == null ? y : targetY,
        value: value == null ? T.sunValue : value,
        t: 0,
        life: T.sunLife,
        state: 'falling',
        collectT: 0,
        startX: x,
        startY: y,
        fromSky: !!fromSky,
        r: 38
      });
      if (window.SFX) window.SFX.play('sunSpawn', { vol: 0.35 });
    }

    collectSun(sun) {
      if (!sun || sun.state === 'collect') return;
      sun.state = 'collect';
      sun.collectT = 0;
      sun.startX = sun.x;
      sun.startY = sun.y;
      if (window.SFX) window.SFX.play('sunCollect');
      this.texts.push({ x: sun.x, y: sun.y - 20, text: '+' + sun.value, life: 0.9, maxLife: 0.9, color: '#ffe066', size: 22, vy: -46 });
    }

    /* ---------------------------------------------------------------- 主循环 */

    update(dt) {
      this.flashRed = Math.max(0, this.flashRed - dt * 2.4);
      if (this.state !== 'playing') return;
      dt = clamp(dt, 0, 0.08);
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 26);
      this.sunPulse = Math.max(0, this.sunPulse - dt * 3.2);

      CARDS.forEach((t) => {
        if (this.cardCd[t] > 0) this.cardCd[t] = Math.max(0, this.cardCd[t] - dt);
      });

      this.updateWaves(dt);
      if (this.state !== 'playing') return;

      // 天降阳光
      this.skySunTimer -= dt;
      if (this.skySunTimer <= 0) {
        this.skySunTimer = rand(T.skySunEvery[0], T.skySunEvery[1]);
        const x = rand(L.lawn.x + 40, L.lawn.x + L.lawn.cols * L.lawn.cell - 40);
        const y = L.lawn.y - 10;
        const targetY = rand(L.lawn.y + 60, L.lawn.y + L.lawn.rows * L.lawn.cell - 70);
        this.spawnSun(x, y, targetY, T.sunValue, true);
      }

      this.updatePlants(dt);
      this.updateZombies(dt);
      this.updateProjectiles(dt);
      this.updateSuns(dt);
      this.updateMowers(dt);
      this.updateEffects(dt);

      // 偶尔的僵尸低吼
      this.groanTimer -= dt;
      if (this.groanTimer <= 0) {
        this.groanTimer = rand(6, 11);
        if (this.zombies.length && window.SFX) window.SFX.play('zombieGroan', { vol: 0.3, rate: rand(0.85, 1.1) });
      }
      if (this.banner) {
        this.banner.t += dt;
        if (this.banner.t > this.banner.life) this.banner = null;
      }
    }

    updatePlants(dt) {
      const zombies = this.zombies;
      for (let i = this.plants.length - 1; i >= 0; i--) {
        const pl = this.plants[i];
        const def = P[pl.type];
        pl.age += dt;
        pl.pop = Math.min(1, pl.pop + dt / T.plantPopTime);
        pl.flash = Math.max(0, pl.flash - dt * 5);
        if (pl.state === 'shoot') {
          pl.stateT -= dt;
          if (pl.stateT <= 0) pl.state = 'idle';
        }
        // 定时连发
        for (let s = pl.pendingShots.length - 1; s >= 0; s--) {
          pl.pendingShots[s] -= dt;
          if (pl.pendingShots[s] <= 0) {
            pl.pendingShots.splice(s, 1);
            this.fireProjectile(pl);
          }
        }

        if (def.kind === 'producer') {
          pl.sunTimer -= dt;
          if (pl.sunTimer <= 0) {
            pl.sunTimer = def.sunEvery;
            const sx = pl.x + rand(-16, 16);
            this.spawnSun(sx, pl.y - 74, pl.y - 24, T.sunValue);
            pl.state = 'idle';
            if (window.SFX) window.SFX.play('sunSpawn', { vol: 0.3 });
          }
        } else if (def.kind === 'shooter') {
          pl.fireTimer -= dt;
          const target = this.findZombieAhead(pl);
          if (target && pl.fireTimer <= 0) {
            pl.fireTimer = def.interval;
            pl.state = 'shoot';
            pl.stateT = 0.18;
            this.fireProjectile(pl);
            if (def.double) pl.pendingShots.push(0.17);
          }
        } else if (def.kind === 'bomb') {
          pl.fuse -= dt;
          if (pl.fuse <= 0) {
            this.explode(pl.x, pl.y - 40, def.radius, def.damage, def.radius * 1.5, 'cherry', pl.row);
            this.removePlant(pl);
          }
        } else if (def.kind === 'mine') {
          if (!pl.armed) {
            pl.armTimer -= dt;
            if (pl.armTimer <= 0) pl.armed = true;
          } else {
            const victim = zombies.find((z) =>
              z.state !== 'dying' && z.row === pl.row && Math.abs(z.x - pl.x) < def.radius
            );
            if (victim) {
              this.explode(pl.x, pl.y - 20, def.radius * 1.4, def.damage, 90, 'mine', pl.row);
              this.removePlant(pl);
            }
          }
        }
      }
    }

    findZombieAhead(pl) {
      let best = null;
      for (const z of this.zombies) {
        if (z.state === 'dying' || z.row !== pl.row) continue;
        if (z.x > pl.x - 30 && z.x < L.W + 80) {
          if (!best || z.x < best.x) best = z;
        }
      }
      return best;
    }

    fireProjectile(pl) {
      const def = P[pl.type];
      const kind = pl.type === 'snowpea' ? 'snow' : 'pea';
      this.projectiles.push({
        id: this.nextId++,
        x: pl.x + 30,
        y: pl.y - 66,
        row: pl.row,
        kind,
        speed: def.speed,
        damage: def.damage,
        slow: def.slow || 0,
        r: 11,
        t: 0
      });
      if (window.SFX) window.SFX.play(kind === 'snow' ? 'snowShoot' : 'shoot', { vol: 0.5, rate: rand(0.94, 1.08) });
    }

    updateProjectiles(dt) {
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.x += p.speed * dt;
        p.t += dt;
        if (p.x > L.W + 60) { this.projectiles.splice(i, 1); continue; }
        let hit = null;
        for (const z of this.zombies) {
          if (z.state === 'dying' || z.row !== p.row) continue;
          if (p.x + p.r >= z.x - 26 && p.x - p.r <= z.x + 26) {
            if (!hit || z.x < hit.x) hit = z;
          }
        }
        if (hit) {
          this.damageZombie(hit, p.damage, p.kind);
          this.splats.push({ x: p.x, y: p.y, age: 0, life: 0.32, kind: p.kind });
          this.projectiles.splice(i, 1);
        }
      }
    }

    damageZombie(z, amount, kind) {
      if (!z || z.state === 'dying') return;
      z.hp -= amount;
      z.flash = 1;
      if (kind === 'snow') z.slow = Math.max(z.slow, P.snowpea.slow || 3);
      const armored = (z.type === 'cone' || z.type === 'bucket' || z.type === 'football') && z.hp > z.maxHp * 0.28;
      if (window.SFX) window.SFX.play(armored ? 'hitArmor' : 'hitFlesh', { vol: 0.32, rate: rand(0.9, 1.15) });
      if (kind === 'pea') this.addSplatParticles(z.x + 8, z.y - 80);
      if (z.hp <= 0) {
        z.hp = 0;
        this.killZombie(z, kind === 'snow' ? 'freeze' : 'normal');
      }
    }

    killZombie(z, style) {
      if (z.state === 'dying') return;
      z.state = 'dying';
      z.dyingT = 0;
      z.deathStyle = style || 'normal';
      this.killed++;
      this.shake = Math.max(this.shake, 3);
      if (window.SFX) window.SFX.play('zombieDie', { vol: 0.55, rate: rand(0.9, 1.1) });
      const n = style === 'boom' ? 18 : 9;
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: z.x + rand(-14, 14),
          y: z.y - rand(40, 110),
          vx: rand(-90, 90),
          vy: rand(-180, -30),
          g: 420,
          life: rand(0.4, 0.9),
          maxLife: 0.9,
          size: rand(2.5, 5.5),
          color: ['#8dbb6a', '#6f9a52', '#c9d6b0'][Math.floor(Math.random() * 3)],
          shape: 'square'
        });
      }
    }

    explode(x, y, radius, damage, visualR, kind, row) {
      const boom = { x, y, r: visualR || radius, age: 0, life: 0.55, kind: kind || 'cherry' };
      this.explosions.push(boom);
      this.shake = Math.max(this.shake, kind === 'mine' ? 9 : 14);
      if (window.SFX) window.SFX.play('explode', { vol: 0.9 });
      for (let i = 0; i < 26; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(60, 320);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60,
          g: 300,
          life: rand(0.3, 0.8),
          maxLife: 0.8,
          size: rand(3, 8),
          color: ['#ffd166', '#ff9f1c', '#ff6b35', '#3d3d3d'][Math.floor(Math.random() * 4)],
          shape: 'circle'
        });
      }
      const rowSpan = kind === 'cherry' ? 1 : 0;
      for (const z of this.zombies) {
        if (z.state === 'dying') continue;
        if (Math.abs(z.x - x) > radius) continue;
        if (Math.abs(z.row - row) > rowSpan) continue;
        z.hp -= damage;
        z.flash = 1;
        if (z.hp <= 0) this.killZombie(z, 'boom');
      }
    }

    rowAtY(y) {
      const r = Math.floor((y + 40 - L.lawn.y) / L.lawn.cell);
      return clamp(r, 0, L.lawn.rows - 1);
    }

    updateZombies(dt) {
      for (let i = this.zombies.length - 1; i >= 0; i--) {
        const z = this.zombies[i];
        z.animT += dt;
        z.flash = Math.max(0, z.flash - dt * 5);
        if (z.state === 'dying') {
          z.dyingT += dt;
          if (z.dyingT > T.zombieDeathTime) this.zombies.splice(i, 1);
          continue;
        }
        if (z.slow > 0) z.slow = Math.max(0, z.slow - dt);
        z.phase = (z.phase + dt * (z.state === 'eat' ? 2.6 : 1.15) * (z.slow > 0 ? 0.55 : 1)) % 1;

        // 找可啃的植物
        const col = Math.floor((z.x - 18 - L.lawn.x) / L.lawn.cell);
        let target = null;
        if (col >= 0 && col < L.lawn.cols) {
          const pl = this.grid[z.row][col];
          if (pl && !pl.dead && z.x - 20 <= pl.x + 40) target = pl;
        }
        if (target) {
          z.state = 'eat';
          z.eatTimer += dt;
          z.biteAnim += dt;
          if (z.eatTimer >= T.zombieBiteEvery) {
            z.eatTimer = 0;
            this.damagePlant(target, z.eatDps * T.zombieBiteEvery);
            if (window.SFX) window.SFX.play('chomp', { vol: 0.3, rate: rand(0.9, 1.1) });
          }
        } else {
          z.state = 'walk';
          const speed = z.speed * (z.slow > 0 ? 0.5 : 1);
          z.x -= speed * dt;
        }

        // 割草机 / 判负
        if (z.x <= L.lawn.x - 6) {
          const mower = this.mowers[z.row];
          if (mower && !mower.used && !mower.active) {
            mower.active = true;
            this.shake = Math.max(this.shake, 7);
            if (window.SFX) window.SFX.play('mower');
            this.banner = { text: '割草机启动！', t: 0, life: 1.6, kind: 'info' };
          }
        }
        if (z.x < L.loseX) {
          this.endGame(false);
          return;
        }
      }
    }

    damagePlant(pl, amount) {
      if (!pl || pl.dead) return;
      pl.hp -= amount;
      pl.flash = 1;
      if (pl.type === 'cherrybomb') return;
      if (pl.hp <= 0) {
        this.removePlant(pl, 'eaten');
        if (window.SFX) window.SFX.play('plant', { vol: 0.2, rate: 0.7 });
      }
    }

    updateSuns(dt) {
      const target = { x: L.sunCounter.x + 54, y: L.sunCounter.y + 46 };
      for (let i = this.suns.length - 1; i >= 0; i--) {
        const s = this.suns[i];
        s.t += dt;
        if (s.state === 'falling') {
          s.y += Math.min(T.sunFallSpeed, (s.targetY - s.y) * 2.2) * dt;
          if (s.y >= s.targetY - 1) {
            s.y = s.targetY;
            s.state = 'idle';
            s.life = T.sunLife;
          }
        } else if (s.state === 'idle') {
          s.life -= dt;
          if (s.life <= 0) { this.suns.splice(i, 1); continue; }
        } else if (s.state === 'collect') {
          s.collectT += dt;
          const k = clamp(s.collectT / 0.42, 0, 1);
          const e = k * k * (3 - 2 * k);
          s.x = s.startX + (target.x - s.startX) * e;
          s.y = s.startY + (target.y - s.startY) * e - Math.sin(k * Math.PI) * 30;
          if (k >= 1) {
            this.sun = Math.min(T.maxSun, this.sun + s.value);
            this.sunPulse = 1;
            this.suns.splice(i, 1);
          }
        }
      }
    }

    updateMowers(dt) {
      for (const m of this.mowers) {
        if (!m.active) continue;
        m.x += T.mowerSpeed * dt;
        for (const z of this.zombies) {
          if (z.state === 'dying' || z.row !== m.row) continue;
          if (Math.abs(z.x - m.x) < 52) {
            z.hp -= T.mowerDamage;
            z.flash = 1;
            this.killZombie(z, 'boom');
            this.addSplatParticles(z.x, z.y - 70);
          }
        }
        for (let i = 0; i < 2; i++) {
          this.particles.push({
            x: m.x - 30 + rand(-6, 6),
            y: laneBottom(m.row) - 10,
            vx: rand(-140, -40),
            vy: rand(-90, -10),
            g: 200,
            life: rand(0.2, 0.5),
            maxLife: 0.5,
            size: rand(2, 4),
            color: Math.random() > 0.5 ? '#ffe066' : '#c8c8c8',
            shape: 'circle'
          });
        }
        if (m.x > L.W + 100) { m.active = false; m.used = true; m.x = L.W + 200; }
      }
    }

    updateEffects(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      for (let i = this.splats.length - 1; i >= 0; i--) {
        const s = this.splats[i];
        s.age += dt;
        if (s.age >= s.life) this.splats.splice(i, 1);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i];
        t.life -= dt;
        t.y += (t.vy || 0) * dt;
        if (t.life <= 0) this.texts.splice(i, 1);
      }
      for (let i = this.explosions.length - 1; i >= 0; i--) {
        const e = this.explosions[i];
        e.age += dt;
        if (e.age >= e.life) this.explosions.splice(i, 1);
      }
    }

    addDirtBurst(x, y, n) {
      n = n || 10;
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: x + rand(-26, 26),
          y: y - rand(0, 8),
          vx: rand(-70, 70),
          vy: rand(-160, -40),
          g: 520,
          life: rand(0.3, 0.55),
          maxLife: 0.55,
          size: rand(2, 5),
          color: ['#8a5a34', '#6f4526', '#a9784a'][Math.floor(Math.random() * 3)],
          shape: 'square'
        });
      }
    }

    addSplatParticles(x, y) {
      for (let i = 0; i < 4; i++) {
        this.particles.push({
          x, y,
          vx: rand(-80, 80),
          vy: rand(-120, -20),
          g: 420,
          life: rand(0.2, 0.45),
          maxLife: 0.45,
          size: rand(1.8, 3.4),
          color: '#7cc63f',
          shape: 'circle'
        });
      }
    }

    endGame(won) {
      if (this.state !== 'playing') return;
      this.state = won ? 'won' : 'lost';
      this.endedAt = this.time;
      this.selected = null;
      this.shovelMode = false;
      if (window.SFX) {
        window.SFX.play(won ? 'win' : 'lose');
        window.SFX.stopMusic();
      }
      if (!won) this.flashRed = 1;
    }

    togglePause() {
      if (this.state === 'playing') {
        this.state = 'paused';
        if (window.SFX) window.SFX.stopMusic();
      } else if (this.state === 'paused') {
        this.state = 'playing';
        if (window.SFX) window.SFX.startMusic();
      }
    }

    /* ---------------------------------------------------------------- 交互辅助 */

    cardRect(i) {
      const s = L.seed;
      return { x: s.x + i * (s.w + s.gap), y: s.y, w: s.w, h: s.h };
    }

    cellAt(x, y) {
      const lawn = L.lawn;
      if (x < lawn.x || x >= lawn.x + lawn.cols * lawn.cell) return null;
      if (y < lawn.y || y >= lawn.y + lawn.rows * lawn.cell) return null;
      return {
        col: Math.floor((x - lawn.x) / lawn.cell),
        row: Math.floor((y - lawn.y) / lawn.cell)
      };
    }

    sunAt(x, y) {
      for (let i = this.suns.length - 1; i >= 0; i--) {
        const s = this.suns[i];
        if (s.state === 'collect') continue;
        const d = Math.hypot(x - s.x, y - s.y);
        if (d < s.r + 10) return s;
      }
      return null;
    }

    /** 供 main.js / QA 使用：把逻辑坐标点击分发给游戏 */
    handleClick(x, y) {
      if (this.state !== 'playing') return false;
      const sun = this.sunAt(x, y);
      if (sun) { this.collectSun(sun); return true; }
      // 种子卡
      for (let i = 0; i < CARDS.length; i++) {
        const r = this.cardRect(i);
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          const type = CARDS[i];
          if ((this.cardCd[type] || 0) > 0 || this.sun < P[type].cost) {
            if (window.SFX) window.SFX.play('error', { vol: 0.4 });
            return true;
          }
          this.selected = this.selected === type ? null : type;
          this.shovelMode = false;
          if (window.SFX) window.SFX.play('seedSelect', { vol: 0.5 });
          return true;
        }
      }
      // 铲子
      const sh = L.shovel;
      if (x >= sh.x && x <= sh.x + sh.w && y >= sh.y && y <= sh.y + sh.h) {
        this.shovelMode = !this.shovelMode;
        this.selected = null;
        if (window.SFX) window.SFX.play('click');
        return true;
      }
      const cell = this.cellAt(x, y);
      if (!cell) return false;
      if (this.shovelMode) {
        const pl = this.grid[cell.row][cell.col];
        if (pl) this.removePlant(pl, 'shovel');
        this.shovelMode = false;
        return true;
      }
      if (this.selected) {
        const res = this.plantAt(cell.col, cell.row, this.selected);
        if (!res.ok) {
          if (window.SFX) window.SFX.play('error', { vol: 0.45 });
          if (res.reason === 'sun') {
            this.texts.push({ x, y: y - 30, text: '阳光不足', life: 1.0, maxLife: 1.0, color: '#ff9f9f', size: 20, vy: -40 });
          }
        }
        return true;
      }
      return false;
    }

    cancelSelection() {
      this.selected = null;
      this.shovelMode = false;
    }

    /* ---------------------------------------------------------------- 绘制 */

    draw(ctx, hover) {
      const ART = window.ART;
      const t = this.time;
      ctx.save();
      if (this.shake > 0.4) {
        const s = this.shake;
        ctx.translate(Math.sin(t * 97) * s * 0.6, Math.cos(t * 83) * s * 0.45);
      }
      ART.drawBackground(ctx, L, t, 'day');
      // 草坪悬停高亮
      if (hover) {
        const cell = this.cellAt(hover.x, hover.y);
        if (cell && (this.selected || this.shovelMode)) {
          const occupied = !!this.grid[cell.row][cell.col];
          const ok = this.shovelMode ? occupied : !occupied;
          ctx.save();
          ctx.fillStyle = ok ? 'rgba(255,255,255,0.28)' : 'rgba(220,60,60,0.24)';
          ctx.fillRect(L.lawn.x + cell.col * L.lawn.cell, L.lawn.y + cell.row * L.lawn.cell, L.lawn.cell, L.lawn.cell);
          ctx.strokeStyle = ok ? 'rgba(255,255,255,0.85)' : 'rgba(255,120,120,0.9)';
          ctx.lineWidth = 3;
          ctx.strokeRect(L.lawn.x + cell.col * L.lawn.cell + 2, L.lawn.y + cell.row * L.lawn.cell + 2, L.lawn.cell - 4, L.lawn.cell - 4);
          if (this.selected) {
            ctx.globalAlpha = 0.42;
            ctx.translate(cellCenterX(cell.col), laneBottom(cell.row));
            ART.drawPlant(ctx, this.selected, { t, scale: 0.95, hpRatio: 1, state: 'idle', pop: 1 });
          }
          ctx.restore();
        }
      }

      // 割草机（未使用的在左侧）
      for (const m of this.mowers) {
        if (m.used && !m.active) continue;
        ctx.save();
        ctx.translate(m.x, laneBottom(m.row));
        ART.drawMower(ctx, { t, active: m.active, x: m.x });
        ctx.restore();
      }

      // 按“脚底 y”排序绘制植物与僵尸
      const sprites = [];
      for (const pl of this.plants) sprites.push({ y: pl.y, kind: 'plant', ref: pl });
      for (const z of this.zombies) sprites.push({ y: z.y, kind: 'zombie', ref: z });
      sprites.sort((a, b) => (a.y - b.y) || (a.kind === 'plant' ? -1 : 1));
      for (const sp of sprites) {
        ctx.save();
        if (sp.kind === 'plant') {
          const pl = sp.ref;
          ctx.translate(pl.x, pl.y);
          const pop = pl.pop < 1 ? 0.6 + 0.55 * Math.sin(pl.pop * Math.PI * 0.9) : 1;
          ctx.scale(pop, pop);
          ART.drawPlant(ctx, pl.type, {
            t: t + pl.id * 0.37,
            scale: 1,
            hpRatio: pl.hp / pl.maxHp,
            state: pl.state === 'shoot' ? 'shoot' : (pl.type === 'potatomine' && pl.armed ? 'armed' : 'idle'),
            pop: pl.pop,
            flash: pl.flash,
            age: pl.age
          });
        } else {
          const z = sp.ref;
          ctx.translate(z.x, z.y);
          const ratio = z.hp / z.maxHp;
          ART.drawZombie(ctx, z.type, {
            t: z.animT + z.id * 0.7,
            scale: 1,
            phase: z.phase,
            state: z.state === 'dying' ? 'die' : z.state,
            hpRatio: ratio,
            flash: z.flash,
            slow: z.slow > 0 ? Math.min(1, z.slow * 1.4) : 0,
            deathT: z.dyingT
          });
        }
        ctx.restore();
      }

      // 子弹
      for (const p of this.projectiles) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ART.drawPea(ctx, { t: p.t, kind: p.kind, r: p.r });
        ctx.restore();
      }
      // 阳光
      for (const s of this.suns) {
        ctx.save();
        ctx.translate(s.x, s.y);
        const fade = s.state === 'idle' ? clamp(s.life / 2, 0, 1) : 1;
        ctx.globalAlpha = fade;
        ART.drawSun(ctx, { t: s.t + s.id, r: s.r, glow: s.state === 'collect' ? 1 : 0.6 });
        ctx.restore();
      }
      // 溅射
      for (const s of this.splats) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ART.drawSplat(ctx, { t: 0, age: s.age / s.life, kind: s.kind });
        ctx.restore();
      }
      // 爆炸
      for (const e of this.explosions) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ART.drawExplosion(ctx, { t: 0, age: e.age / e.life, r: e.r, kind: e.kind });
        ctx.restore();
      }
      // 粒子
      for (const p of this.particles) {
        ctx.save();
        ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle = p.color;
        if (p.shape === 'square') ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      // 飘字
      for (const tx of this.texts) {
        ctx.save();
        ctx.globalAlpha = clamp(tx.life / tx.maxLife, 0, 1);
        ctx.fillStyle = tx.color;
        ctx.font = `700 ${tx.size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(60,40,20,0.85)';
        ctx.lineWidth = 4;
        ctx.strokeText(tx.text, tx.x, tx.y);
        ctx.fillText(tx.text, tx.x, tx.y);
        ctx.restore();
      }
      ctx.restore();

      if (this.flashRed > 0) {
        ctx.save();
        ctx.globalAlpha = this.flashRed * 0.35;
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(0, 0, L.W, L.H);
        ctx.restore();
      }
    }

    stats() {
      return {
        state: this.state,
        sun: this.sun,
        time: this.time,
        waveIndex: this.waveIndex,
        totalWaves: this.totalWaves,
        killed: this.killed,
        totalSpawned: this.totalSpawned,
        zombies: this.zombies.length,
        plants: this.plants.length,
        suns: this.suns.length,
        projectiles: this.projectiles.length,
        selected: this.selected,
        shovelMode: this.shovelMode,
        mowersLeft: this.mowers.filter((m) => !m.used && !m.active).length
      };
    }
  }

  window.PVZGame = Game;
  window.PVZ_UTIL = { laneBottom, laneCenterY, cellCenterX };
})();