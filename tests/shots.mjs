/* 生成 README / 交付用的正式截图（1440×900）。用法：node tests/shots.mjs */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.PVZ_READY === true');
await sleep(900);

const shot = async (name) => {
  const file = path.join(SHOTS, 'final-' + name + '.png');
  await page.screenshot({ path: file });
  return file;
};

const out = {};
out.menu = await shot('menu');

// 进入游戏
await page.evaluate(() => {
  window.PVZ.start();
  window.PVZ.game.prepTimer = 9;
});
await sleep(500);

// 开局：经济与第一道防线
out.early = await page.evaluate(async () => {
  const g = window.PVZ.game;
  g.sun = 1500;
  ['sunflower', 'sunflower', 'peashooter', 'sunflower', 'peashooter'].forEach(() => {});
  g.cardCd = g.cardCd || {};
  Object.keys(g.cardCd).forEach((k) => { g.cardCd[k] = 0; });
  g.plantAt(0, 1, 'sunflower');
  g.cardCd.sunflower = 0;
  g.plantAt(1, 1, 'sunflower');
  g.cardCd.sunflower = 0;
  g.plantAt(0, 2, 'peashooter');
  g.cardCd.peashooter = 0;
  g.plantAt(1, 2, 'peashooter');
  g.cardCd.peashooter = 0;
  g.plantAt(0, 3, 'sunflower');
  g.cardCd.peashooter = 0;
  g.plantAt(2, 3, 'peashooter');
  g.sun = 125;
  const z1 = g.spawnZombie('basic', 1);
  z1.x = 1010;
  const z2 = g.spawnZombie('basic', 2);
  z2.x = 930;
  g.spawnSun(430, 260, 380, 25, true);
  g.spawnSun(820, 330, 470, 25, true);
  for (let i = 0; i < 90; i++) g.update(1 / 60);
  return window.PVZ.gameState();
});
await sleep(350);
out.earlyShot = await shot('early');

// 中期大场面：满配植物 + 全部僵尸类型
out.battle = await page.evaluate(async () => {
  const g = window.PVZ.game;
  g.sun = 9999;
  Object.keys(g.cardCd).forEach((k) => { g.cardCd[k] = 0; });
  const plan = [
    [0, 0, 'sunflower'], [0, 1, 'sunflower'], [0, 2, 'sunflower'], [0, 3, 'sunflower'], [0, 4, 'sunflower'],
    [1, 0, 'peashooter'], [1, 1, 'repeater'], [1, 2, 'peashooter'], [1, 3, 'repeater'], [1, 4, 'peashooter'],
    [2, 0, 'snowpea'], [2, 1, 'peashooter'], [2, 2, 'snowpea'], [2, 3, 'peashooter'], [2, 4, 'snowpea'],
    [3, 0, 'wallnut'], [3, 1, 'wallnut'], [3, 2, 'wallnut'], [3, 3, 'wallnut'], [3, 4, 'wallnut'],
    [4, 0, 'potatomine'], [4, 1, 'cherrybomb'], [4, 2, 'potatomine']
  ];
  plan.forEach(([c, r, t]) => { g.cardCd[t] = 0; g.plantAt(c, r, t); });
  g.plants.forEach((p) => { if (p.type === 'cherrybomb') p.fuse = 999; });
  // 让坚果呈现受伤裂纹
  g.plants.filter((p) => p.type === 'wallnut').forEach((p, i) => { if (i % 2 === 0) p.hp = p.maxHp * 0.35; });

  const types = [['basic', 0, 980], ['cone', 1, 1050], ['bucket', 2, 900], ['flag', 3, 860], ['football', 4, 1000]];
  types.forEach(([t, r, x]) => {
    const z = g.spawnZombie(t, r);
    z.x = x;
    if (t === 'cone') z.hp = z.maxHp * 0.55;
    if (t === 'bucket') z.hp = z.maxHp * 0.45;
  });
  // 冰冻减速效果
  const slowZ = g.spawnZombie('basic', 1);
  slowZ.x = 760;
  slowZ.slow = 2.6;
  slowZ.hp = 140;
  // 阳光、子弹与爆炸
  g.spawnSun(330, 300, 330, 25, true);
  g.spawnSun(760, 260, 300, 25, true);
  g.spawnSun(1030, 420, 500, 25, true);
  g.plantAt(4, 2, 'peashooter');
  g.cardCd.peashooter = 0;
  g.waveIndex = 5;
  g.waveTimer = 12;
  g.sun = 475;
  g.waveCleared = false;
  g.waveSpawnQueue = [];
  g.prepTimer = 0;
  g.banner = null;
  for (let i = 0; i < 75; i++) g.update(1 / 60);
  return window.PVZ.gameState();
});
await sleep(300);
out.battleShot = await shot('battle');

// 暂停
await page.evaluate(() => { const g = window.PVZ.game; g.selected = 'snowpea'; g.togglePause(); });
await sleep(350);
out.pauseShot = await shot('pause');
await page.evaluate(() => window.PVZ.game.togglePause());

// 胜利
await page.evaluate(() => {
  const g = window.PVZ.game;
  g.killed = 68; g.planted = 23; g.endedAt = 268;
  g.mowers[0].used = true;
  g.endGame(true);
});
await sleep(400);
out.winShot = await shot('win');

// 失败
await page.evaluate(() => {
  const g = window.PVZ.game;
  g.killed = 31; g.planted = 15; g.endedAt = 176;
  g.endGame(false);
});
await sleep(400);
out.loseShot = await shot('lose');

out.errors = errors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
