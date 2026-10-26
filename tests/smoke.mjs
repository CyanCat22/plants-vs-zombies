/* 引擎冒烟测试：真实鼠标路径种植、刷怪、战斗、胜负界面 + 截图
 * 用法：node tests/smoke.mjs
 */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

const URL = 'file://' + path.join(ROOT, 'index.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1'
  ],
  defaultViewport: { width: 1440, height: 900 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.PVZ_READY === true', { timeout: 15000 });
await sleep(400);

const shot = async (name) => {
  const file = path.join(SHOTS, name);
  await page.screenshot({ path: file });
  return file;
};

await page.evaluate(() => {
  window.__click = (x, y, button = 0) => {
    const c = document.getElementById('game');
    const r = c.getBoundingClientRect();
    const opts = {
      clientX: r.left + (x / 1280) * r.width,
      clientY: r.top + (y / 720) * r.height,
      bubbles: true,
      button,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    };
    c.dispatchEvent(new PointerEvent('pointerdown', opts));
    c.dispatchEvent(new PointerEvent('pointerup', opts));
  };
  window.__rect = () => {
    const r = document.getElementById('game').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  };
});

const R = {};
R.rect = await page.evaluate(() => window.__rect());
R.menuShot = await shot('smoke-01-menu.png');

// 开始游戏
await page.evaluate(() => window.__click(640, 489));
await sleep(600);
R.afterStart = await page.evaluate(() => window.PVZ.gameState());

// 种植物（真实点击路径：选卡 → 点格子）
await page.evaluate(() => window.PVZ.addSun(2000));
const plantPlan = [
  ['sunflower', 0, 0], ['peashooter', 1, 0], ['snowpea', 2, 1],
  ['sunflower', 0, 2], ['wallnut', 1, 3], ['repeater', 3, 2], ['potatomine', 4, 4]
];
const cardIndex = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'repeater', 'cherrybomb', 'potatomine'];
for (const [type, col, row] of plantPlan) {
  const ci = cardIndex.indexOf(type);
  await page.evaluate((ci) => window.__click(206 + ci * 92 + 42, 74), ci);
  await sleep(120);
  await page.evaluate(([col, row]) => window.__click(200 + col * 100 + 50, 140 + row * 100 + 50), [col, row]);
  await sleep(160);
}
R.afterPlant = await page.evaluate(() => window.PVZ.gameState());

// 刷怪并观察战斗
await page.evaluate(() => {
  window.PVZ.spawn('basic', 0);
  window.PVZ.spawn('cone', 1);
  window.PVZ.spawn('bucket', 2);
  window.PVZ.spawn('flag', 3);
  window.PVZ.spawn('football', 4);
  window.PVZ.setTimeScale(3);
});
await sleep(2600);
R.battle = await page.evaluate(() => ({
  s: window.PVZ.gameState(),
  zombieSample: window.PVZ.game.zombies.map((z) => ({ type: z.type, row: z.row, x: Math.round(z.x), hp: Math.round(z.hp), state: z.state })),
  plantSample: window.PVZ.game.plants.map((p) => ({ type: p.type, row: p.row, col: p.col, hp: Math.round(p.hp) })),
  suns: window.PVZ.game.suns.length,
  projectiles: window.PVZ.game.projectiles.length
}));
R.battleShot = await shot('smoke-02-battle.png');

// 点击阳光收集
R.beforeSunClick = await page.evaluate(() => window.PVZ.game.sun);
const sunPos = await page.evaluate(() => {
  const s = window.PVZ.game.suns[0];
  return s ? { x: s.x, y: s.y } : null;
});
if (sunPos) {
  await page.evaluate((p) => window.__click(p.x, p.y), sunPos);
  await sleep(800);
}
R.afterSunClick = await page.evaluate(() => window.PVZ.game.sun);

// 暂停界面
await page.evaluate(() => window.__click(1177, 102));
await sleep(300);
R.pausedState = await page.evaluate(() => window.PVZ.game.state);
R.pauseShot = await shot('smoke-03-pause.png');
await page.evaluate(() => window.__click(509, 421));
await sleep(250);
R.resumed = await page.evaluate(() => window.PVZ.game.state);

// 胜利界面
await page.evaluate(() => { window.PVZ.setTimeScale(1); window.PVZ.end(true); });
await sleep(500);
R.winShot = await shot('smoke-04-win.png');
R.wonState = await page.evaluate(() => window.PVZ.game.state);

// 重开 → 失败界面
await page.evaluate(() => window.__click(555, 488));
await sleep(400);
R.restartState = await page.evaluate(() => window.PVZ.game.state);
await page.evaluate(() => {
  const g = window.PVZ.game;
  const z = g.spawnZombie('basic', 2);
  z.x = 100;
  g.update(0.05);
});
await sleep(400);
R.lostState = await page.evaluate(() => window.PVZ.game.state);
R.loseShot = await shot('smoke-05-lose.png');

R.errors = errors.slice(0, 10);
console.log(JSON.stringify(R, null, 2));
await browser.close();