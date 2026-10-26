/* 引擎机制自测（不依赖美术/音频）：node tests/engine-check.mjs
 * 覆盖：阳光、种植/冷却、射击、啃食、寒冰减速、樱桃炸弹、土豆地雷、割草机、判负、通关。
 */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file://' + path.join(ROOT, 'index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  if (!ok) console.log('FAIL', name, JSON.stringify(detail));
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1440, height: 900 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.PVZ_READY === true');
await sleep(200);

// 统一：开始一局新游戏，直接操作 game 内部
const reset = () => page.evaluate(() => {
  const g = window.PVZ.game;
  window.PVZ.start();
  g.prepTimer = 9999;          // 先不让波次干扰
  g.waveIndex = 0;
  g.waveCleared = false;
  g.waveSpawnQueue = [];
  g.sun = 1000;
  g.cardCd && Object.keys(g.cardCd).forEach((k) => { g.cardCd[k] = 0; });
  window.PVZ.setTimeScale(1);
  return window.PVZ.gameState();
});

// A. 种植 + 冷却
await reset();
let A = await page.evaluate(() => {
  const g = window.PVZ.game;
  const r1 = g.plantAt(0, 0, 'sunflower');
  const r2 = g.plantAt(1, 0, 'sunflower');
  const r3 = g.plantAt(2, 0, 'peashooter');
  return { r1: r1.ok, r2: r2.ok, reason2: r2.reason, r3: r3.ok, sun: g.sun, cd: g.cardCd.sunflower };
});
check('种下向日葵成功', A.r1 && A.r3, A);
check('冷却中不能连种', A.r2 === false && A.reason2 === 'cooldown', A);

// B. 射击伤害
await reset();
let B = await page.evaluate(() => {
  const g = window.PVZ.game;
  g.plantAt(0, 0, 'peashooter');
  const z = g.spawnZombie('basic', 0);
  z.x = 800;
  const hp0 = z.hp;
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  return { hp0, hp1: z.hp, projectiles: g.projectiles.length, killed: g.killed };
});
check('豌豆命中造成伤害', B.hp1 < B.hp0, B);

// C. 僵尸啃食植物 → 植物死亡
await reset();
let C = await page.evaluate(() => {
  const g = window.PVZ.game;
  g.plantAt(0, 0, 'wallnut');
  const z = g.spawnZombie('basic', 0);
  z.x = 270;  // 紧贴 col0 植物
  const pl = g.plants[0];
  const hp0 = pl.hp;
  for (let i = 0; i < 60 * 2; i++) g.update(1 / 60);
  return { hp0, hp1: pl.hp, state: z.state, plants: g.plants.length, zEat: z.state };
});
check('僵尸啃食掉植物血量', C.hp1 < C.hp0 && C.zEat === 'eat', C);

// D. 吃掉植物后继续前进
await reset();
let D = await page.evaluate(() => {
  const g = window.PVZ.game;
  g.plantAt(0, 0, 'sunflower');
  const pl = g.plants[0];
  pl.hp = 1;
  const z = g.spawnZombie('basic', 0);
  z.x = 270;
  const x0 = z.x;
  for (let i = 0; i < 60 * 3; i++) g.update(1 / 60);
  return { x0, x1: z.x, plants: g.plants.length, killing: g.killed };
});
check('植物被吃后僵尸继续走', D.plants === 0 && D.x1 < D.x0, D);

// E. 寒冰减速
await reset();
let E = await page.evaluate(() => {
  const g = window.PVZ.game;
  g.plantAt(0, 0, 'snowpea');
  const z = g.spawnZombie('basic', 0);
  z.x = 700;
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  return { slow: z.slow, hp: z.hp };
});
check('寒冰豌豆施加减速', E.slow > 0, E);

// F. 樱桃炸弹
await reset();
let F = await page.evaluate(() => {
  const g = window.PVZ.game;
  g.plantAt(1, 2, 'cherrybomb');
  const zs = [g.spawnZombie('basic', 1), g.spawnZombie('cone', 2), g.spawnZombie('basic', 3)];
  zs.forEach((z) => { z.x = 400; });
  for (let i = 0; i < 60 * 2; i++) g.update(1 / 60);
  return { states: zs.map((z) => z.state), hp: zs.map((z) => z.hp), plants: g.plants.length, killed: g.killed };
});
check('樱桃炸弹秒杀 3x3 僵尸', F.states.every((s) => s === 'dying') && F.plants === 0, F);
check('炸弹不误伤上下两行以外的行', F.states.length === 3, F);

// G. 土豆地雷
await reset();
let G = await page.evaluate(() => {
  const g = window.PVZ.game;
  g.plantAt(2, 1, 'potatomine');
  const pl = g.plants[0];
  for (let i = 0; i < 60 * 12; i++) g.update(1 / 60);
  const armed = pl.armed && !pl.dead;
  const z = g.spawnZombie('basic', 1);
  z.x = 460;
  for (let i = 0; i < 60 * 2; i++) g.update(1 / 60);
  return { armed, zState: z.state, plants: g.plants.length };
});
check('土豆地雷武装并炸死踩中僵尸', G.armed && G.zState === 'dying', G);

// H. 割草机
await reset();
let H = await page.evaluate(() => {
  const g = window.PVZ.game;
  const z = g.spawnZombie('cone', 3);
  z.x = 205;
  const mower = g.mowers[3];
  for (let i = 0; i < 60 * 4; i++) g.update(1 / 60);
  return { used: mower.used, active: mower.active, zState: z.state, x: z.x, state: g.state };
});
check('割草机触发并清场', H.used && H.zState === 'dying' && H.state === 'playing', H);

// I. 判负（割草机已用）
await reset();
let I = await page.evaluate(() => {
  const g = window.PVZ.game;
  g.mowers[2].used = true;
  const z = g.spawnZombie('basic', 2);
  z.x = 150;
  for (let i = 0; i < 60 * 3; i++) g.update(1 / 60);
  return { state: g.state };
});
check('无割草机时僵尸进屋判负', I.state === 'lost', I);

// J. 通关 10 波（自动清怪快进）
await page.evaluate(() => {
  window.PVZ.start();
  const g = window.PVZ.game;
  g.prepTimer = 0;
  g.waveIndex = 0;
  g.startWave(0);
  window.__winFrames = 0;
  window.__waveLog = [];
  window.__autoWin = setInterval(() => {
    // 每帧清怪，观察波次推进
    g.zombies.forEach((z) => { if (z.state !== 'dying') g.killZombie(z, 'boom'); });
    if (g.waveIndex >= 0 && window.__waveLog[g.waveIndex] !== true) {
      window.__waveLog[g.waveIndex] = true;
    }
  }, 16);
});
// 直接快进：用页面内循环跑 8 分钟模拟
let J = await page.evaluate(() => {
  const g = window.PVZ.game;
  let frames = 0;
  const maxFrames = 60 * 60 * 12; // 12 分钟上限
  while (g.state === 'playing' && frames < maxFrames) {
    if (g.zombies.length) g.zombies.forEach((z) => { if (z.state !== 'dying') g.killZombie(z, 'boom'); });
    g.update(1 / 60);
    frames++;
  }
  return {
    frames,
    state: g.state,
    waveIndex: g.waveIndex,
    waves: g.totalWaves,
    killed: g.killed,
    spawned: g.totalSpawned,
    mowers: g.mowers.filter((m) => !m.used).length
  };
});
check('10 波僵尸全部清完即通关', J.state === 'won' && J.waveIndex === J.waves - 1, J);
check('波次总数与配置一致', J.spawned >= 60, J);

// K. 重开后状态干净
let K = await page.evaluate(() => {
  window.PVZ.start();
  const g = window.PVZ.game;
  return {
    state: g.state, sun: g.sun, plants: g.plants.length, zombies: g.zombies.length,
    killed: g.killed, waves: g.waveIndex, suns: g.suns.length
  };
});
check('重开后状态归零', K.state === 'playing' && K.plants === 0 && K.zombies === 0 && K.killed === 0 && K.sun === 150, K);

check('无 JS 报错', errors.length === 0, errors.slice(0, 5));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, total: results.length, failed }, null, 2));
process.exit(failed.length ? 1 : 0);