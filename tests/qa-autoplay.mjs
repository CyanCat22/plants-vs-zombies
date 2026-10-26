/* 独立 QA · 自动对局机器人（8x 时间倍速，真实游戏逻辑）
 * 策略：开局 3~4 向日葵 → 每行 1 个豌豆射手 → 补寒冰/双发 → 前排放坚果 → 危险行樱桃炸弹
 *      每 tick 通过 game.handleClick(x,y) 收集全部阳光（真实点击路径）。
 * 用法：node tests/qa-autoplay.mjs  （退出码 0 = 对局完成且无报错）
 */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file://' + path.join(ROOT, 'index.html');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CARDS = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'repeater', 'cherrybomb', 'potatomine'];
const CELL = (c, r) => ({ x: 200 + c * 100 + 50, y: 140 + r * 100 + 50 });
const CARD = (i) => ({ x: 206 + i * 92 + 42, y: 26 + 48 });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows'
  ],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.PVZ_READY === true', { timeout: 15000 });
await sleep(300);

/* 固定随机种子：同一种子下对局可复现，便于比较策略/回归（QA_SEED 可覆盖） */
const SEED = Number(process.env.QA_SEED || 12345);
await page.evaluate((seed) => {
  let a = seed >>> 0;
  Math.random = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}, SEED);

/* 真实鼠标点击开始游戏 */
{
  const r = await page.evaluate(() => { const b = document.getElementById('game').getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; });
  await page.mouse.click(r.left + (640 / 1280) * r.width, r.top + (489 / 720) * r.height);
}
await sleep(300);
const started = await page.evaluate(() => window.PVZ.game.state);
if (started !== 'playing') { console.error('启动失败：', started); process.exit(1); }

/* 机器人（全部操作走 handleClick 真实交互路径） */
await page.evaluate(() => {
  const g = window.PVZ.game;
  const CFG = window.PVZ_CONFIG;
  const CARDS = CFG.CARD_ORDER;
  const state = {
    actions: 0, planted: 0, sunsCollected: 0, sunsValue: 0,
    timeline: [], lastWave: -1, startedAt: performance.now(), seq: 0
  };
  const free = (c, r) => r >= 0 && r < 5 && c >= 0 && c < 9 && !g.grid[r][c];
  const countType = (t) => g.plants.reduce((n, p) => n + (p.type === t ? 1 : 0), 0);
  const rowHas = (r, types) => (g.grid[r] || []).some((p) => p && types.includes(p.type));
  const alive = () => g.zombies.filter((z) => z.state !== 'dying');
  const rowZ = (r) => alive().filter((z) => z.row === r);
  const nearest = (r) => {
    const zs = rowZ(r);
    return zs.length ? Math.min(...zs.map((z) => z.x)) : 9999;
  };
  const dangerRows = () => [0, 1, 2, 3, 4].sort((a, b) => nearest(a) - nearest(b));

  function clickCard(type) {
    const i = CARDS.indexOf(type);
    if (i < 0) return false;
    const c = { x: 206 + i * 92 + 42, y: 26 + 48 };
    g.handleClick(c.x, c.y);
    return g.selected === type;
  }
  function tryPlant(type, col, row) {
    const def = CFG.PLANTS[type];
    if (!def) return false;
    if (g.sun < def.cost || (g.cardCd[type] || 0) > 0) return false;
    if (!free(col, row)) return false;
    if (!clickCard(type)) return false;
    const p = { x: 200 + col * 100 + 50, y: 140 + row * 100 + 50 };
    const ok = g.handleClick(p.x, p.y);
    const plantedNow = !!(g.grid[row][col] && g.grid[row][col].type === type);
    if (plantedNow) { state.actions++; state.planted++; }
    return ok && plantedNow;
  }
  function collectSuns() {
    for (const s of g.suns) {
      if (s.state === 'collect') continue;
      const sx = s.x, sy = s.y, v = s.value;
      if (g.handleClick(sx, sy)) { state.sunsCollected++; state.sunsValue += v; }
    }
  }
  function logWave() {
    const w = g.waveIndex;
    if (w !== state.lastWave) {
      state.lastWave = w;
      state.timeline.push({
        wave: w + 1, t: +g.time.toFixed(1), sun: Math.round(g.sun),
        plants: g.plants.length, zombies: alive().length, killed: g.killed,
        mowers: g.mowers.filter((m) => !m.used && !m.active).length
      });
    }
  }

  /* ---- 一个决策 tick ---- */
  window.__botTick = function () {
    if (g.state === 'playing') {
      g.cancelSelection();
      collectSuns();
      logWave();

      const sun = g.sun;
      const nSun = countType('sunflower');
      const rows = dangerRows();
      const shooters = (r) => (g.grid[r] || []).filter((p) => p && ['peashooter', 'snowpea', 'repeater'].includes(p.type)).length;
      const danger = (r) => {
        const nz = rowZ(r);
        if (!nz.length) return 0;
        return nz.reduce((n, z) => n + Math.max(1, (1300 - z.x) / 100), 0);
      };
      const threatRows = [0, 1, 2, 3, 4].sort((a, b) => danger(b) - danger(a));

      // 1) 开局先铺 4 个向日葵（列 0-1，稳经济）
      if (nSun < 4) {
        const spots = [[0, 2], [1, 2], [0, 3], [1, 3], [0, 1], [1, 1], [0, 0]];
        for (const [c, r] of spots) if (free(c, r) && tryPlant('sunflower', c, r)) return { state: g.state, act: 'sunflower' };
      }

      // 2) 每行先保证 1 个豌豆射手（100 阳光，火力/阳光效率最高）
      if (sun >= 100) {
        for (const r of rows) {
          if (shooters(r) >= 1) continue;
          const c = free(2, r) ? 2 : free(3, r) ? 3 : free(4, r) ? 4 : -1;
          if (c >= 0 && tryPlant('peashooter', c, r)) return { state: g.state, act: 'peashooter1', row: r };
        }
      }

      // 3) 有僵尸的行尽早放坚果墙挡一挡（便宜、冷却 20s）
      if (sun >= 50 && (g.cardCd.wallnut || 0) <= 0) {
        for (const r of threatRows) {
          if (nearest(r) < 1000 && !rowHas(r, ['wallnut'])) {
            const c = free(6, r) ? 6 : free(7, r) ? 7 : -1;
            if (c >= 0 && tryPlant('wallnut', c, r)) return { state: g.state, act: 'wallnut', row: r };
          }
        }
      }

      // 4) 每行补到 2 个豌豆射手（火力优先，覆盖所有行）
      if (sun >= 100) {
        for (const r of rows) {
          if (shooters(r) >= 2) continue;
          const c = free(3, r) ? 3 : free(4, r) ? 4 : free(2, r) ? 2 : -1;
          if (c >= 0 && tryPlant('peashooter', c, r)) return { state: g.state, act: 'peashooter2', row: r };
        }
      }

      // 5) 危险行补寒冰射手控场（175）
      if (sun >= 175) {
        for (const r of threatRows) {
          if (nearest(r) < 1100 && !rowHas(r, ['snowpea'])) {
            const c = free(3, r) ? 3 : free(4, r) ? 4 : free(5, r) ? 5 : -1;
            if (c >= 0 && tryPlant('snowpea', c, r)) return { state: g.state, act: 'snowpea', row: r };
          }
        }
      }

      // 6) 危险行升级双发射手（200，火力翻倍）
      if (sun >= 200) {
        for (const r of threatRows) {
          if (nearest(r) < 1000 && !rowHas(r, ['repeater'])) {
            const c = free(4, r) ? 4 : free(5, r) ? 5 : free(3, r) ? 3 : -1;
            if (c >= 0 && tryPlant('repeater', c, r)) return { state: g.state, act: 'repeater', row: r };
          }
        }
      }

      // 7) 成堆僵尸丢樱桃炸弹（150，优先解围）
      if (sun >= 150 && (g.cardCd.cherrybomb || 0) <= 0) {
        for (const r of threatRows) {
          const zs = rowZ(r).filter((z) => z.x < 900);
          if (zs.length >= 2) {
            const minX = Math.min(...zs.map((z) => z.x));
            const cluster = zs.filter((z) => Math.abs(z.x - minX) < 220).length;
            if (cluster >= 2) {
              const col = Math.max(0, Math.min(8, Math.floor((minX + 50 - 200) / 100)));
              if (free(col, r) && tryPlant('cherrybomb', col, r)) return { state: g.state, act: 'cherrybomb', row: r };
            }
          }
        }
      }

      // 8) 余钱再把危险行补到 3 射手
      if (sun >= 250) {
        for (const r of threatRows) {
          if (shooters(r) < 3) continue;
          const c = free(5, r) ? 5 : free(4, r) ? 4 : -1;
          if (c >= 0 && tryPlant('peashooter', c, r)) return { state: g.state, act: 'peashooter3', row: r };
        }
      }
    }
    return {
      act: null, state: g.state,
      sun: Math.round(g.sun), time: +g.time.toFixed(1), wave: g.waveIndex + 1,
      plants: g.plants.length, zombies: g.zombies.length, killed: g.killed,
      mowers: g.mowers.filter((m) => !m.used && !m.active).length
    };
  };
  window.__botState = () => ({
    ...state,
    gameTime: +g.time.toFixed(1),
    wallMs: Math.round(performance.now() - state.startedAt),
    plantsAlive: g.plants.length,
    finalSun: Math.round(g.sun),
    state: g.state, wave: g.waveIndex + 1, killed: g.killed,
    composition: g.plants.reduce((m, p) => (m[p.type] = (m[p.type] || 0) + 1, m), {}),
    totalSpawned: g.totalSpawned, planted: g.planted,
    mowersLeft: g.mowers.filter((m) => !m.used && !m.active).length,
    mowersUsed: g.mowers.filter((m) => m.used || m.active).length
  });
});

/* 8x 倍速跑完整局 */
await page.evaluate(() => window.PVZ.setTimeScale(8));
const wallStart = Date.now();
let snap = null;
while (Date.now() - wallStart < 180000) {
  snap = await page.evaluate(() => window.__botTick());
  if (snap.state && snap.state !== 'playing') break;
  await sleep(90);
}
const wallSec = (Date.now() - wallStart) / 1000;
const result = await page.evaluate(() => window.__botState());
result.wallSec = +wallSec.toFixed(1);
result.speedFactor = +(result.gameTime / Math.max(0.1, wallSec)).toFixed(2);
result.consoleErrors = errors.slice(0, 10);

/* 结果判定 */
const pass = (result.state === 'won' || result.state === 'lost') && errors.length === 0 && result.planted >= 5 && result.speedFactor >= 4;
const difficulty = result.state === 'won'
  ? (result.mowersLeft >= 4 && result.gameTime < 200
    ? '偏简单（几乎无压力通关）'
    : result.mowersLeft <= 1
      ? '偏难（靠最后割草机险胜）'
      : '合理（能赢但有消耗）')
  : '偏难（策略机器人未通关）';

console.log('\n===== 自动对局结果 =====');
console.log(JSON.stringify({
  result: result.state === 'won' ? '通关' : result.state === 'lost' ? '失败' : result.state,
  waveReached: `${result.wave} / 10`,
  killed: result.killed + ' / ' + result.totalSpawned,
  planted: result.planted,
  mowersLeft: result.mowersLeft,
  mowersUsed: result.mowersUsed,
  gameTimeSec: result.gameTime,
  wallSec: result.wallSec,
  speedFactor: result.speedFactor,
  finalSun: result.finalSun,
  plantsAlive: result.plantsAlive,
  sunsCollected: result.sunsCollected,
  botActions: result.actions,
  seed: SEED,
  composition: result.composition,
  difficulty,
  consoleErrors: result.consoleErrors
}, null, 2));
console.log('\n波次时间线（波次 / 游戏时间 / 阳光 / 植物 / 场上僵尸 / 累计击杀 / 割草机）:');
for (const w of result.timeline) console.log(`  第${w.wave}波  t=${w.t}s  sun=${w.sun}  plants=${w.plants}  zombies=${w.zombies}  killed=${w.killed}  mowers=${w.mowers}`);

if (result.state === 'won') await page.screenshot({ path: path.join(ROOT, 'shots', 'game-autoplay-win.png') });
else await page.screenshot({ path: path.join(ROOT, 'shots', 'game-autoplay-end.png') });

console.log(`\n${pass ? 'PASS' : 'FAIL'} · 自动对局（完成状态=${result.state}, 倍速=${result.speedFactor}x, 控制台错误=${errors.length}）`);
await browser.close();
process.exit(pass ? 0 : 1);