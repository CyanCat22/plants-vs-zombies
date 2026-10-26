/* 独立 QA · 功能测试（真实指针事件路径）
 * 覆盖：菜单开始 / 选卡种植 / 阳光收集 / 铲子 / 右键取消 / 暂停恢复 / 静音 /
 *       重开 / 胜负界面 / 键盘快捷键 / 四种窗口尺寸下的 letterbox 坐标映射 / 控制台零报错。
 * 用法：node tests/qa-func.mjs  （退出码 0 = 全通过）
 */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'file://' + path.join(ROOT, 'index.html');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 逻辑坐标常量（1280x720） */
const L = {
  W: 1280, H: 720,
  card: (i) => ({ x: 206 + i * 92 + 42, y: 26 + 48 }),
  cell: (c, r) => ({ x: 200 + c * 100 + 50, y: 140 + r * 100 + 50 }),
  shovel: { x: 910, y: 74 },
  pause: { x: 1177, y: 102 },
  mute: { x: 1231, y: 102 },
  resume: { x: 509, y: 421 },
  pauseRestart: { x: 647, y: 421 },
  pauseMenu: { x: 785, y: 421 },
  start: { x: 640, y: 489 },
  endRestart: { x: 555, y: 488 },
  endMenu: { x: 744, y: 488 },
  lawnBottom: 640
};

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS' : 'FAIL') + ' · ' + name + (ok ? '' : '  <<< ' + JSON.stringify(detail)));
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'
  ],
  defaultViewport: { width: 1440, height: 900 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

async function load() {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.PVZ_READY === true', { timeout: 15000 });
  await sleep(250);
}

const rectOf = () => page.evaluate(() => {
  const r = document.getElementById('game').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
async function clickLogical(x, y, opts) {
  const r = await rectOf();
  await page.mouse.click(r.left + (x / L.W) * r.width, r.top + (y / L.H) * r.height, opts);
  await sleep(90);
}
async function clickClient(x, y) {
  await page.mouse.click(x, y);
  await sleep(90);
}
const gs = () => page.evaluate(() => window.PVZ.gameState());
const gridType = (c, r) => page.evaluate(([c, r]) => {
  const p = window.PVZ.game.grid[r][c];
  return p ? p.type : null;
}, [c, r]);
const plantCount = () => page.evaluate(() => window.PVZ.game.plants.length);
const sunNow = () => page.evaluate(() => window.PVZ.game.sun);
const setSun = (n) => page.evaluate((n) => { window.PVZ.game.sun = n; }, n);
const muted = () => page.evaluate(() => !!(window.SFX && window.SFX.muted));

await load();

/* ============================================================ A. 菜单与开始 */
{
  const s = await gs();
  const r = await rectOf();
  check('A1 初始状态为 menu', s.state === 'menu', s.state);
  check('A2 画布 1440x900 下等比缩放并垂直居中', Math.abs(r.width - 1440) < 1 && Math.abs(r.height - 810) < 1 && Math.abs(r.left) < 1 && Math.abs(r.top - 45) < 1, r);
  check('A3 画布宽高比 16:9', Math.abs(r.width / r.height - 16 / 9) < 0.005, r.width / r.height);
  check('A4 PVZ 调试 API 完整', await page.evaluate(() => {
    const P = window.PVZ; const need = ['start', 'addSun', 'spawn', 'startWave', 'killAll', 'setTimeScale', 'end', 'gameState'];
    return !!P && P.ready === true && need.every((k) => typeof P[k] === 'function') && !!P.game;
  }));

  await clickLogical(L.start.x, L.start.y);
  const s2 = await gs();
  check('A5 鼠标点击「开始游戏」进入 playing', s2.state === 'playing', s2.state);
  check('A6 开局有 15s 准备时间', await page.evaluate(() => window.PVZ.game.prepTimer > 14), await page.evaluate(() => window.PVZ.game.prepTimer));
  check('A7 开局阳光 150', s2.sun === 150, s2.sun);

  // 回到菜单（失败界面 → 返回标题）
  await page.evaluate(() => window.PVZ.end(false));
  await sleep(120);
  await clickLogical(L.endMenu.x, L.endMenu.y);
  check('A8 失败界面「返回标题」可回到 menu', (await gs()).state === 'menu', await gs());
  // 菜单按 Enter 开始
  await page.keyboard.press('Enter');
  await sleep(120);
  check('A9 菜单按 Enter 开始游戏', (await gs()).state === 'playing', await gs());
  // 菜单点开始
  await page.evaluate(() => window.PVZ.end(false));
  await sleep(100);
  await clickLogical(L.endMenu.x, L.endMenu.y);
  await clickLogical(L.start.x, L.start.y);
  check('A10 回到菜单后再次点击开始游戏', (await gs()).state === 'playing', await gs());
}

/* ============================================================ B. 选卡与种植 */
{
  await page.evaluate(() => { window.PVZ.addSun(1000); window.PVZ.setTimeScale(1); });
  const c0 = L.card(0);
  await clickLogical(c0.x, c0.y);
  check('B1 点击向日葵卡片选中', (await gs()).selected === 'sunflower', await gs());
  check('B2 选中时不扣阳光', (await sunNow()) === 1150, await sunNow());

  const cell = L.cell(3, 2);
  await clickLogical(cell.x, cell.y);
  check('B3 点击格子种下向日葵（坐标精确命中 col3/row2）', (await gridType(3, 2)) === 'sunflower', await gridType(3, 2));
  check('B4 种植扣除 50 阳光', (await sunNow()) === 1100, await sunNow());
  check('B5 种植后冷却开始计时', await page.evaluate(() => window.PVZ.game.cardCd.sunflower > 0), null);
  check('B6 种植后清空选中态', (await gs()).selected === null, await gs());

  // 冷却中点击同卡不选中
  await clickLogical(c0.x, c0.y);
  check('B7 冷却中点击卡片不会选中', (await gs()).selected === null, await gs());

  // 选卡 → 再点同卡取消
  const c1 = L.card(1);
  await clickLogical(c1.x, c1.y);
  await clickLogical(c1.x, c1.y);
  check('B8 再次点击同一卡片取消选中', (await gs()).selected === null, await gs());

  // 键盘选卡
  await page.evaluate(() => window.PVZ.setTimeScale(1));
  await page.keyboard.press('2');
  await sleep(80);
  check('B9 数字键 2 选中豌豆射手', (await gs()).selected === 'peashooter', await gs());
  await page.keyboard.press('Escape');
  await sleep(80);
  check('B10 Esc 取消选中且不暂停', (await gs()).selected === null && (await gs()).state === 'playing', await gs());

  // 已占用格子：种植失败且不扣钱
  const sunBefore = await sunNow();
  const plantsBefore = await plantCount();
  await page.keyboard.press('2');
  await sleep(80);
  await clickLogical(cell.x, cell.y);
  check('B11 点击已占用格子种植失败', (await plantCount()) === plantsBefore && (await sunNow()) === sunBefore, { plants: await plantCount(), sun: await sunNow() });

  // 阳光不足（B11 后 peashooter 仍处于选中态，不能重复按 2 否则会取消选中）
  await setSun(0);
  await clickLogical(L.cell(4, 2).x, L.cell(4, 2).y);
  const texts = await page.evaluate(() => window.PVZ.game.texts.map((t) => t.text));
  check('B12 阳光不足时点击格子不种植并提示', (await gridType(4, 2)) === null && texts.includes('阳光不足'), texts);
  await setSun(150);
}

/* ============================================================ C. 阳光收集 */
{
  const info = await page.evaluate(() => {
    const g = window.PVZ.game;
    g.spawnSun(600, 420, 420, 25, false);
    const s = g.suns[g.suns.length - 1];
    return { x: s.x, y: s.y, id: s.id };
  });
  await sleep(200);
  // 手动推进 2 帧，消除 rAF 帧率抖动带来的不确定性（真实逻辑不变）
  await page.evaluate(() => { const g = window.PVZ.game; for (let i = 0; i < 2; i++) g.update(1 / 60); });
  const sunBefore = await sunNow();
  const collected = await page.evaluate(() => {
    const g = window.PVZ.game;
    const s = g.suns[g.suns.length - 1];
    return s ? { x: s.x, y: s.y, state: s.state } : null;
  });
  check('C1 阳光生成并进入 idle 状态', collected && collected.state === 'idle', collected);
  await clickLogical(collected.x, collected.y);
  const midState = await page.evaluate(() => window.PVZ.game.suns.map((s) => s.state));
  check('C2 点击阳光进入收集动画', midState.includes('collect'), midState);
  await sleep(800);
  check('C3 收集后阳光 +25', (await sunNow()) === sunBefore + 25, { before: sunBefore, after: await sunNow() });
  check('C4 收集后阳光从场景移除', await page.evaluate(() => window.PVZ.game.suns.length === 0), await page.evaluate(() => window.PVZ.game.suns.length));

  // 空白草坪点击无副作用（先清空选中态，避免误种）
  await page.evaluate(() => window.PVZ.game.cancelSelection());
  const s0 = await gs();
  await clickLogical(L.cell(7, 4).x, L.cell(7, 4).y);
  const s1 = await gs();
  check('C5 无选中时点击空白草坪无副作用', s0.plants === s1.plants && s0.sun === s1.sun, { s0: s0.plants, s1: s1.plants });
}

/* ============================================================ D. 铲子与右键 */
{
  // 先种一棵用于铲除
  await page.evaluate(() => { window.PVZ.game.sun = 1000; window.PVZ.game.cardCd.sunflower = 0; });
  await clickLogical(L.card(0).x, L.card(0).y);
  await clickLogical(L.cell(6, 3).x, L.cell(6, 3).y);
  check('D1 前置：col6/row3 有向日葵', (await gridType(6, 3)) === 'sunflower', await gridType(6, 3));

  await clickLogical(L.shovel.x, L.shovel.y);
  check('D2 点击铲子进入铲除模式', (await gs()).shovelMode === true, await gs());
  await clickLogical(L.cell(6, 3).x, L.cell(6, 3).y);
  check('D3 铲除后格子清空', (await gridType(6, 3)) === null, await gridType(6, 3));
  check('D4 铲除后退出铲子模式', (await gs()).shovelMode === false, await gs());

  // 右键取消选中
  await page.evaluate(() => { window.PVZ.game.sun = 1000; window.PVZ.game.cardCd.peashooter = 0; });
  await clickLogical(L.card(1).x, L.card(1).y);
  check('D5 前置：已选中豌豆射手', (await gs()).selected === 'peashooter', await gs());
  const r = await rectOf();
  await page.mouse.click(r.left + (640 / 1280) * r.width, r.top + (400 / 720) * r.height, { button: 'right' });
  await sleep(150);
  check('D6 右键取消选中', (await gs()).selected === null, await gs());
}

/* ============================================================ E. 暂停 / 继续 / 重开 */
{
  const t0 = await page.evaluate(() => window.PVZ.game.time);
  await clickLogical(L.pause.x, L.pause.y);
  check('E1 点击暂停按钮进入 paused', (await gs()).state === 'paused', (await gs()).state);
  await sleep(400);
  const t1 = await page.evaluate(() => window.PVZ.game.time);
  check('E2 暂停后游戏时间冻结', Math.abs(t1 - t0) < 0.05, { t0, t1 });
  await clickLogical(L.resume.x, L.resume.y);
  check('E3 点击继续恢复 playing', (await gs()).state === 'playing', (await gs()).state);

  await page.keyboard.press('Space');
  await sleep(100);
  check('E4 空格键暂停', (await gs()).state === 'paused', (await gs()).state);
  await page.keyboard.press('Space');
  await sleep(100);
  check('E5 空格键继续', (await gs()).state === 'playing', (await gs()).state);
  await page.keyboard.press('p');
  await sleep(100);
  check('E6 字母 P 暂停', (await gs()).state === 'paused', (await gs()).state);
  await page.keyboard.press('Escape');
  await sleep(100);
  check('E7 Esc 继续（无选中时）', (await gs()).state === 'playing', (await gs()).state);

  // 暂停界面按钮：重开
  await clickLogical(L.pause.x, L.pause.y);
  check('E8 前置：暂停中', (await gs()).state === 'paused', await gs());
  await clickLogical(L.pauseRestart.x, L.pauseRestart.y);
  const s = await gs();
  check('E9 暂停界面「重开」重开一局', s.state === 'playing' && s.plants === 0 && s.sun === 150, s);

  // 暂停界面：返回标题
  await clickLogical(L.pause.x, L.pause.y);
  await clickLogical(L.pauseMenu.x, L.pauseMenu.y);
  check('E10 暂停界面「返回标题」回到菜单', (await gs()).state === 'menu', await gs());
  await clickLogical(L.start.x, L.start.y);

  // R 键重开
  await page.evaluate(() => { window.PVZ.addSun(500); });
  await clickLogical(L.card(0).x, L.card(0).y);
  await clickLogical(L.cell(0, 0).x, L.cell(0, 0).y);
  check('E11 前置：已种植 1 株', (await plantCount()) === 1, await plantCount());
  await page.keyboard.press('r');
  await sleep(120);
  const s2 = await gs();
  check('E12 R 键重开（植物清零、阳光回 150）', s2.state === 'playing' && s2.plants === 0 && s2.sun === 150, s2);
}

/* ============================================================ F. 静音 */
{
  const m0 = await muted();
  await clickLogical(L.mute.x, L.mute.y);
  const m1 = await muted();
  check('F1 点击静音按钮切换静音状态', m1 !== m0, { m0, m1 });
  await clickLogical(L.mute.x, L.mute.y);
  check('F2 再次点击恢复声音', (await muted()) === m0, { m0, now: await muted() });
  await page.keyboard.press('m');
  await sleep(100);
  check('F3 M 键静音', (await muted()) === !m0, await muted());
  await page.keyboard.press('m');
  await sleep(100);
  check('F4 再按 M 键恢复', (await muted()) === m0, await muted());
}

/* ============================================================ G. 胜负界面 */
{
  await page.evaluate(() => window.PVZ.end(true));
  await sleep(150);
  check('G1 胜利状态与界面', (await gs()).state === 'won', (await gs()).state);
  await clickLogical(L.endRestart.x, L.endRestart.y);
  const s = await gs();
  check('G2 胜利界面「再玩一次」重开', s.state === 'playing' && s.plants === 0 && s.sun === 150, s);
  await page.evaluate(() => window.PVZ.end(false));
  await sleep(150);
  check('G3 失败状态与界面', (await gs()).state === 'lost', (await gs()).state);
  await page.keyboard.press('r');
  await sleep(120);
  check('G4 失败界面按 R 重开', (await gs()).state === 'playing', await gs());
  await page.evaluate(() => window.PVZ.end(false));
  await sleep(120);
  await clickLogical(L.endMenu.x, L.endMenu.y);
  check('G5 失败界面「返回标题」', (await gs()).state === 'menu', await gs());
}

/* ============================================================ H. 多窗口尺寸坐标映射 */
{
  const viewports = [
    { w: 1440, h: 900 },
    { w: 1920, h: 1080 },
    { w: 1024, h: 768 },
    { w: 900, h: 600 }
  ];
  for (let i = 0; i < viewports.length; i++) {
    const vp = viewports[i];
    // 第一组沿用默认 1440x900；其余通过 setViewport 触发真实 resize
    if (i > 0) await page.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 1 });
    await load();
    const r = await rectOf();
    const fit = Math.min(vp.w / L.W, vp.h / L.H);
    const expW = Math.floor(L.W * fit), expH = Math.floor(L.H * fit);
    const centered = Math.abs(r.left - (vp.w - r.width) / 2) < 1.01 && Math.abs(r.top - (vp.h - r.height) / 2) < 1.01;
    check(`H${i + 1}a ${vp.w}x${vp.h} 画布尺寸/居中断言`, Math.abs(r.width - expW) < 1.01 && Math.abs(r.height - expH) < 1.01 && centered, { r, expW, expH });
    check(`H${i + 1}b ${vp.w}x${vp.h} 无横向拉伸（宽高比 16:9）`, Math.abs(r.width / r.height - 16 / 9) < 0.006, r.width / r.height);

    // 真实鼠标点击开始 + 三种植物（不同格子）
    await clickLogical(L.start.x, L.start.y);
    await page.evaluate(() => window.PVZ.addSun(2000));
    const plan = [['sunflower', 0, 0], ['peashooter', 4, 2], ['wallnut', 8, 4]];
    const cardIndex = { sunflower: 0, peashooter: 1, wallnut: 2 };
    for (const [type, col, row] of plan) {
      const c = L.card(cardIndex[type]);
      await clickLogical(c.x, c.y);
      await clickLogical(L.cell(col, row).x, L.cell(col, row).y);
    }
    const planted = await page.evaluate(() => window.PVZ.game.plants.map((p) => `${p.type}@${p.col},${p.row}`).sort());
    check(`H${i + 1}c ${vp.w}x${vp.h} 点击映射种植结果正确`, JSON.stringify(planted) === JSON.stringify(['peashooter@4,2', 'sunflower@0,0', 'wallnut@8,4']), planted);
    const sunLeft = await sunNow();
    check(`H${i + 1}d ${vp.w}x${vp.h} 阳光扣除正确`, sunLeft === 150 + 2000 - 50 - 100 - 50, sunLeft);

    // 点击画布外（黑边）无副作用
    if (r.top > 2 || r.left > 2) {
      const x = r.left > 2 ? 2 : r.left + r.width / 2;
      const y = r.top > 2 ? 2 : r.top + r.height / 2;
      const before = await gs();
      await clickClient(x, y);
      const after = await gs();
      check(`H${i + 1}e ${vp.w}x${vp.h} 点击黑边无副作用`, before.state === after.state && before.plants === after.plants, { before: before.state, after: after.state });
    }
  }
  // 恢复默认视口
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
}

/* ============================================================ I. 控制台 */
check('I1 控制台零报错（pageerror/console.error）', errors.length === 0, errors.slice(0, 10));

const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n===== 功能测试汇总：${pass} 通过 / ${fail} 失败 / 共 ${results.length} =====`);
if (fail) console.log('失败用例：\n' + results.filter((r) => !r.ok).map((r) => ' - ' + r.name + ' :: ' + JSON.stringify(r.detail)).join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);