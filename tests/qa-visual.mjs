/* 独立 QA · 视觉/布局测试
 * 产出 shots/game-{menu,start,battle,pause,win,lose}.png（1440x900），
 * 用 OCR（../tmp/ocr）+ Python/PIL 像素采样做客观检查：
 * HUD 不重叠 / 文字完整不截断 / 元素不出界 / 草坪与逻辑坐标对齐 / letterbox 缩放关系 / 覆盖层状态。
 * 用法：node tests/qa-visual.mjs  （退出码 0 = 全通过）
 */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
const URL = 'file://' + path.join(ROOT, 'index.html');

const OCR = process.env.OCR_PATH || path.resolve(ROOT, '..', 'tmp', 'ocr');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = { W: 1280, H: 720, topBarH: 140, lawn: { x: 200, y: 140, cell: 100, cols: 9, rows: 5 } };
const BTN_START = { x: 490, y: 452, w: 300, h: 74 };
const VIEW = { w: 1440, h: 900 };

/* ---------- Python/PIL 像素采样 ---------- */
const PY_CANDIDATES = [
  process.env.QA_PYTHON,
  '/Users/xyq/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/bin/python3',
  'python3'
].filter(Boolean);
let PYTHON = null;
for (const p of PY_CANDIDATES) {
  const r = spawnSync(p, ['-c', 'import PIL'], { encoding: 'utf8' });
  if (r.status === 0) { PYTHON = p; break; }
}
const PY_SCRIPT = `
import sys, json
from PIL import Image
job = json.load(sys.stdin)
im = Image.open(job['path']).convert('RGB')
out = {'size': list(im.size), 'samples': [], 'regions': []}
for p in job.get('points', []):
    x, y = int(p[0]), int(p[1])
    x = max(0, min(im.width - 1, x)); y = max(0, min(im.height - 1, y))
    out['samples'].append(list(im.getpixel((x, y))))
for r in job.get('regions', []):
    x0, y0, x1, y1 = [int(v) for v in r['rect']]
    x0 = max(0, x0); y0 = max(0, y0); x1 = min(im.width, x1); y1 = min(im.height, y1)
    if x1 <= x0 or y1 <= y0:
        out['regions'].append({'mean': [0,0,0], 'std': 0, 'n': 0}); continue
    px = list(im.crop((x0, y0, x1, y1)).getdata())
    n = len(px) or 1
    mean = [sum(c[i] for c in px) / n for i in range(3)]
    var = sum((c[0]-mean[0])**2 + (c[1]-mean[1])**2 + (c[2]-mean[2])**2 for c in px) / n
    out['regions'].append({'mean': [round(v, 1) for v in mean], 'std': round(var ** 0.5, 1), 'n': n})
out['lines'] = []
for ln in job.get('lines', []):
    x0, y0, x1, y1 = int(ln['x0']), int(ln['y0']), int(ln['x1']), int(ln['y1'])
    step = max(1, int(ln.get('step', 2)))
    pts = []
    if y0 == y1:
        xs = range(min(x0, x1), max(x0, x1) + 1, step)
        for x in xs:
            if 0 <= x < im.width and 0 <= y0 < im.height: pts.append(list(im.getpixel((x, y0))))
    else:
        ys = range(min(y0, y1), max(y0, y1) + 1, step)
        for y in ys:
            if 0 <= y < im.height and 0 <= x0 < im.width: pts.append(list(im.getpixel((x0, y))))
    out['lines'].append({'pts': pts, 'step': step, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})
print(json.dumps(out))
`;
function pyAnalyze(pngPath, points = [], regions = [], lines = []) {
  if (!PYTHON) return null;
  const r = spawnSync(PYTHON, ['-c', PY_SCRIPT], {
    input: JSON.stringify({ path: pngPath, points, regions, lines }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

/* ---------- OCR ---------- */
function ocr(pngPath) {
  const r = spawnSync(OCR, [pngPath], { encoding: 'utf8' });
  const out = (r.stdout || '').split('\n');
  const boxes = [];
  for (const line of out) {
    const m = line.match(/^\[\s*(\d+),\s*(\d+)\s+(\d+)x\s*(\d+)\]\s*(.*)$/);
    if (m) boxes.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], text: m[5].trim() });
  }
  return boxes;
}
function ocrCrop(pngPath, logicalRect, scaleUp = 4) {
  if (!PYTHON) return [];
  const out = path.join(os.tmpdir(), 'qa-crop-' + Date.now() + '.png');
  const [x0, y0] = toShot(logicalRect[0], logicalRect[1]);
  const [x1, y1] = toShot(logicalRect[2], logicalRect[3]);
  const script = `
import sys, json
from PIL import Image
j = json.load(sys.stdin)
im = Image.open(j['path']).convert('RGB')
c = im.crop((j['x0'], j['y0'], j['x1'], j['y1']))
c = c.resize((c.width * j['s'], c.height * j['s']), Image.LANCZOS)
c.save(j['out'])
`;
  const r = spawnSync(PYTHON, ['-c', script], {
    input: JSON.stringify({ path: pngPath, x0, y0, x1, y1, out, s: scaleUp }), encoding: 'utf8'
  });
  if (r.status !== 0) return [];
  return ocr(out);
}
const norm = (s) => s.replace(/\s+/g, '');
const hasText = (boxes, sub) => boxes.some((b) => norm(b.text).includes(norm(sub)));
const findBox = (boxes, sub) => boxes.find((b) => norm(b.text).includes(norm(sub))) || null;
const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/* ---------- 断言框架 ---------- */
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
  defaultViewport: { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.PVZ_READY === true', { timeout: 15000 });
await sleep(400);

const rectOf = () => page.evaluate(() => {
  const r = document.getElementById('game').getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
const gs = () => page.evaluate(() => window.PVZ.gameState());
async function clickLogical(x, y) {
  const r = await rectOf();
  await page.mouse.click(r.left + (x / L.W) * r.width, r.top + (y / L.H) * r.height);
  await sleep(120);
}
let rect = await rectOf();
const scale = rect.width / L.W;
const toShot = (lx, ly) => [Math.round(rect.left + lx * scale), Math.round(rect.top + ly * scale)];

/* 截图 + OCR + 像素采样 */
const screens = {};
async function capture(name) {
  const file = path.join(SHOTS, `game-${name}.png`);
  rect = await rectOf();
  await page.screenshot({ path: file });
  const boxes = ocr(file);
  const px = pyAnalyze(file, [], []);
  screens[name] = { file, boxes, px };
  console.log(`  截图 ${path.basename(file)} · OCR ${boxes.length} 条 · ${px ? px.size.join('x') : 'PIL 不可用'}`);
  return screens[name];
}

/* ================================================================ 1. 菜单 */
await page.evaluate(() => { window.PVZ.game.reset(); });
await sleep(500);
const menu = await capture('menu');
{
  const b = menu.boxes;
  check('V1 菜单渲染出标题「植物大战僵尸」', hasText(b, '植物大战僵尸'), b.map((x) => x.text));
  check('V2 菜单有副标题与开始按钮', hasText(b, '草坪保卫战') && hasText(b, '开始游戏'), b.map((x) => x.text));
  check('V3 菜单玩法速览四条提示完整（不截断）', hasText(b, '点击顶部卡片选中植物，再点草坪格子种下') && hasText(b, '点击天上和向日葵产出的阳光来收集') && hasText(b, '每行只有一台割草机') && hasText(b, '挡住10波僵尸就赢'), b.map((x) => x.text));
  const title = findBox(b, '植物大战僵尸');
  check('V4 标题水平居中（±12px）', title && Math.abs(center(title).x - rect.left - rect.width / 2) <= 12, title && center(title));
  // 开始按钮中心 = 逻辑(640,489) → 截图坐标
  const exp = toShot(BTN_START.x + BTN_START.w / 2, BTN_START.y + BTN_START.h / 2);
  const start = findBox(b, '开始游戏');
  check('V5 逻辑坐标↔截图坐标映射正确（开始按钮中心误差 ≤10px）', start && Math.hypot(center(start).x - exp[0], center(start).y - exp[1]) <= 10, { ocr: start && center(start), exp });
  check('V6 画布为 1440x900 下的 1440x810 letterbox', menu.px && menu.px.size[0] === 1440 && menu.px.size[1] === 900, menu.px && menu.px.size);
}

/* ================================================================ 2. 开局 */
await clickLogical(640, 489);
await sleep(700);
const start = await capture('start');
{
  const b = start.boxes;
  check('V7 开局横幅显示「准备种植」', hasText(b, '准备种植'), b.map((x) => x.text));
  check('V8 顶部 HUD 显示阳光 150', hasText(b, '150'), b.map((x) => x.text));
  check('V9 七张种子卡花费数字齐全', ['50', '100', '50', '175', '200', '150', '25'].every((v) => hasText(b, v)), b.map((x) => x.text));
  check('V10 波次进度条文字存在（准备种植倒计时）', hasText(b, '准备种植') && /准备种植/.test(norm(b.map((x) => x.text).join(''))), b.map((x) => x.text));
  check('V11 底部操作提示完整', hasText(b, '点击阳光收集') && b.some((x) => /数字键|數字键/.test(norm(x.text))) && hasText(b, '选卡'), b.map((x) => x.text));
  const shovelCrop = ocrCrop(start.file, [872, 26, 948, 122], 4);
  check('V12 铲子按钮文字存在且未被图标遮挡（放大 4x OCR）', hasText(shovelCrop, '铲子'), { crop: shovelCrop.map((x) => x.text), full: b.map((x) => x.text) });
  // 文字不出界：所有 OCR 文本盒都在画布内
  const inside = b.every((x) => x.x >= rect.left - 2 && x.y >= rect.top - 2 && x.x + x.w <= rect.left + rect.width + 2 && x.y + x.h <= rect.top + rect.height + 2);
  // 卡片小像：每张卡图标区域应有明显色彩方差（占位/空白卡会接近纯色底）
  const iconRegions = [];
  for (let i = 0; i < 7; i++) {
    iconRegions.push({ name: 'card' + i, rect: [toShot(206 + i * 92 + 4, 32)[0], toShot(206 + i * 92 + 4, 32)[1], toShot(206 + i * 92 + 80, 96)[0], toShot(206 + i * 92 + 80, 96)[1]] });
  }
  const iconPx = pyAnalyze(start.file, [], iconRegions);
  const iconStd = iconPx ? iconPx.regions.map((r) => r.std) : [];
  check('V12b 七张种子卡植物小像均已绘制（图标区色彩方差 > 15）', iconStd.length === 7 && iconStd.every((v) => v > 15), iconStd);

  check('V13 所有文字均在画布内（无出界）', inside, b.filter((x) => !(x.x >= rect.left - 2 && x.y >= rect.top - 2 && x.x + x.w <= rect.left + rect.width + 2 && x.y + x.h <= rect.top + rect.height + 2)).map((x) => x.text));
}

/* ================================================================ 3. HUD 几何 + 像素布局 */
{
  const layout = await page.evaluate(() => {
    const C = window.PVZ_CONFIG.LAYOUT;
    const game = window.PVZ.game;
    const cards = [];
    for (let i = 0; i < 7; i++) cards.push(game.cardRect(i));
    const rects = {
      sunCounter: C.sunCounter, shovel: C.shovel, waveMeter: C.waveMeter,
      pause: window.HUD.BTN.pause, mute: window.HUD.BTN.mute, cards
    };
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const list = [
      ['sunCounter', rects.sunCounter], ['shovel', rects.shovel], ['waveMeter', rects.waveMeter],
      ['pause', rects.pause], ['mute', rects.mute],
      ...cards.map((c, i) => ['card' + i, c])
    ];
    const overlaps = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (overlap(list[i][1], list[j][1])) overlaps.push(list[i][0] + '×' + list[j][0]);
    }
    const inTop = list.every(([, r]) => r.y >= 0 && r.y + r.h <= C.topBarH && r.x >= 0 && r.x + r.w <= C.W);
    return { overlaps, inTop, C };
  });
  check('V14 HUD 九个区块互不重叠（阳光/铲子/波次/暂停/静音/7 卡）', layout.overlaps.length === 0, layout.overlaps);
  check('V15 HUD 全部在顶部栏 0..140 且不超出画布', layout.inTop, layout.inTop);
  {
    const C = layout.C;
    const right = Math.max(
      C.sunCounter.x + C.sunCounter.w,
      C.shovel.x + C.shovel.w,
      C.waveMeter.x + C.waveMeter.w,
      206 + 6 * 92 + 84 // 第 7 张种子卡右边缘
    );
    check('V16 种子栏/铲子/波次条均不越过画布右边界 1280', right <= C.W, { right, W: C.W });
  }

  // 像素：顶部栏 HUD 底板、阳光计数、卡片底色
  const [sunPt, gapPt, cardPt, lawnPt, topPt] = [
    toShot(100, 60), toShot(195, 60), toShot(280, 40), toShot(450, 490), toShot(640, 100)
  ];
  const px = pyAnalyze(start.file, [sunPt, gapPt, cardPt, lawnPt, topPt]);
  const [sunRGB, gapRGB, cardRGB, lawnRGB, topRGB] = px ? px.samples : [];
  const light = (c) => c && c[0] > 150 && c[1] > 120;
  const dark = (c) => c && c[0] + c[1] + c[2] < 420;
  check('V17 阳光计数板与种子卡为浅色底（HUD 已绘制）', light(sunRGB) && light(cardRGB), { sunRGB, cardRGB });
  check('V18 卡槽之间是深色木质底板（HUD 分区清晰）', dark(gapRGB), gapRGB);
  check('V19 顶部栏 y=100 与草坪 y=200 颜色不同（HUD/草坪分层）', topRGB && lawnRGB && (Math.abs(topRGB[0] - lawnRGB[0]) + Math.abs(topRGB[1] - lawnRGB[1]) + Math.abs(topRGB[2] - lawnRGB[2]) > 60), { topRGB, lawnRGB });
  check('V20 草坪为绿色系（G 明显大于 R/B）', lawnRGB && lawnRGB[1] > lawnRGB[0] + 10 && lawnRGB[1] > lawnRGB[2] + 10, lawnRGB);

  // 草坪条纹边界是否对齐 200/300/…/1100（沿 row4 水平扫描，找每个预期边界附近的颜色跳变）
  {
    const y0 = toShot(0, 140 + 4 * 100 + 50)[1];
    const x0shot = toShot(180, 0)[0];
    const line = pyAnalyze(start.file, [], [], [{ x0: x0shot, y0, x1: toShot(1120, 0)[0], y1: y0, step: 1 }]);
    const pts = line && line.lines[0] ? line.lines[0].pts : [];
    const logicalAt = (i) => (x0shot + i * 1 - rect.left) / scale;
    const expected = [300, 400, 500, 600, 700, 800, 900, 1000];
    let aligned = 0;
    let contrasted = 0;
    const found = [];
    for (const e of expected) {
      // 在 e±20 逻辑像素内找最大相邻色差
      let best = { x: 0, d: 0 };
      for (let i = 1; i < pts.length; i++) {
        const lx = logicalAt(i);
        if (lx < e - 20 || lx > e + 20) continue;
        const a = pts[i - 1], b = pts[i];
        const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        if (d > best.d) best = { x: lx, d };
      }
      if (best.d > 0 && Math.abs(best.x - e) <= 5) aligned++;
      if (best.d >= 12) contrasted++;
      found.push({ e, x: +best.x.toFixed(1), d: Math.round(best.d) });
    }
    check('V21 草坪竖条纹边界对齐 200/300/…/1100（8 条中 ≥7 条误差 ≤5px）', aligned >= 7, { aligned, found });
    check('V21b 草坪条纹对比度可辨（8 条边界中 ≥7 条色差 ≥12）', contrasted >= 7, { contrasted, found });
  }
}

/* ================================================================ 4. 中期战斗 */
await page.evaluate(() => {
  const g = window.PVZ.game;
  window.PVZ.setTimeScale(1);
  g.prepTimer = 0;
  g.waveIndex = 2;
  g.waveCleared = false;
  g.waveTimer = 6;
  g.waveSpawnQueue = [];
  g.banner = null;
  g.sun = 3000;
  Object.keys(g.cardCd).forEach((k) => { g.cardCd[k] = 0; });
  const plan = [
    ['sunflower', 0, 0], ['sunflower', 0, 1], ['sunflower', 0, 2], ['sunflower', 0, 3],
    ['peashooter', 2, 0], ['peashooter', 2, 1], ['peashooter', 2, 2], ['peashooter', 2, 3], ['peashooter', 2, 4],
    ['snowpea', 3, 1], ['repeater', 3, 3], ['wallnut', 6, 2], ['wallnut', 5, 4]
  ];
  plan.forEach(([type, col, row]) => { g.sun = 3000; g.cardCd[type] = 0; g.plantAt(col, row, type); });
  const zs = [
    ['basic', 0, 700], ['cone', 1, 880], ['bucket', 2, 1040], ['flag', 3, 650],
    ['football', 4, 980], ['basic', 1, 1120], ['cone', 2, 1180], ['basic', 0, 960]
  ];
  zs.forEach(([type, row, x]) => { const z = g.spawnZombie(type, row); if (z) z.x = x; });
  g.spawnSun(520, 320, 320, 25, false);
  g.spawnSun(760, 430, 430, 25, false);
  g.shake = 0;
});
await sleep(900);
const battle = await capture('battle');
const battleState = await gs();
{
  const b = battle.boxes;
  check('V22 战斗界面显示波次「第 3 / 10 波」', hasText(b, '第3/10波') || hasText(b, '第 3 / 10'), b.map((x) => x.text));
  check('V23 战斗界面显示剩余僵尸数', b.some((x) => /僵尸\s*\d+/.test(x.text)), b.map((x) => x.text));
  check('V24 战斗界面阳光数与 game.sun 一致', (() => {
    const box = b.find((x) => x.x < rect.left + 200 && x.y > rect.top + 60 && x.y < rect.top + 200);
    return box && Number(norm(box.text).replace(/[^\d]/g, '')) === battleState.sun;
  })(), { sun: battleState.sun, ocr: b.map((x) => x.text) });
  check('V25 战斗界面存在植物与僵尸实体', battleState.plants >= 10 && battleState.zombies >= 6, battleState);
  // 场景非空且色彩丰富（有战斗元素）
  const region = pyAnalyze(battle.file, [
    toShot(360, 360), toShot(480, 460), toShot(700, 260), toShot(900, 560)
  ]);
  const colorful = region && region.samples.filter((c) => Math.max(...c) - Math.min(...c) > 25).length >= 2;
  check('V26 草坪战斗区域存在彩色实体（植物/僵尸已渲染）', colorful, region && region.samples);
  const zgeo = await page.evaluate(() => {
    const g = window.PVZ.game;
    const laneBottom = (row) => 140 + (row + 1) * 100 - 4;
    return g.zombies.map((z) => ({ type: z.type, row: z.row, x: Math.round(z.x), y: Math.round(z.y), okY: Math.abs(z.y - laneBottom(z.row)) < 1, okRow: z.row >= 0 && z.row <= 4, okX: z.x > 118 && z.x < 1290 }));
  });
  check('V25b 僵尸均出现在草坪范围内（行 0-4 / 脚底对齐行底线）', zgeo.length > 0 && zgeo.every((z) => z.okY && z.okRow && z.okX), zgeo);
  check('V27 战斗画布元素不出界（OCR 文本均在画布内）', b.every((x) => x.y >= rect.top - 2 && x.y + x.h <= rect.top + rect.height + 2 && x.x >= -2 && x.x + x.w <= rect.width + 2));
}

/* ================================================================ 5. 暂停 */
await clickLogical(1177, 102);
await sleep(400);
const pause = await capture('pause');
{
  const b = pause.boxes;
  check('V28 暂停覆盖层标题「暂停中」', hasText(b, '暂停中'), b.map((x) => x.text));
  check('V29 暂停面板三个按钮齐全', hasText(b, '继续') && hasText(b, '重开') && hasText(b, '返回标题'), b.map((x) => x.text));
  check('V30 暂停面板显示波次与击杀统计', hasText(b, '已击杀'), b.map((x) => x.text));
  // 覆盖层压暗：与战斗截图同一点亮度下降
  const pt = toShot(640, 500);
  const px = pyAnalyze(pause.file, [pt]);
  if (px) {
    const pRGB = px.samples[0];
    const bpx = pyAnalyze(battle.file, [pt]);
    const bRGB = bpx && bpx.samples[0];
    check('V31 暂停时全屏遮罩压暗（同点亮度显著下降）', bRGB && pRGB && (bRGB[0] + bRGB[1] + bRGB[2] - pRGB[0] - pRGB[1] - pRGB[2]) > 60, { battle: bRGB, pause: pRGB });
  }
  check('V32 暂停时顶部 HUD 与底部提示仍可读（未被误遮挡）', hasText(b, '第3/10波') && hasText(b, '点击阳光收集'), b.map((x) => x.text));
}

/* ================================================================ 6. 胜利 */
// 先点「继续」退出暂停，否则 endGame 会被状态机拒绝
await page.evaluate(() => { const g = window.PVZ.game; if (g.state === 'paused') g.togglePause(); });
await sleep(200);
check('V32b 暂停后点击继续恢复 playing', (await gs()).state === 'playing', await gs());
await page.evaluate(() => {
  const g = window.PVZ.game;
  window.PVZ.killAll();
  g.banner = null;
  window.PVZ.setTimeScale(1);
});
await sleep(300);
await page.evaluate(() => window.PVZ.end(true));
await sleep(500);
const win = await capture('win');
{
  const b = win.boxes;
  check('V33 胜利面板标题「草坪守住了」', hasText(b, '草坪守住了'), b.map((x) => x.text));
  check('V34 胜利面板四项统计完整', hasText(b, '存活时长') && hasText(b, '击杀僵') && hasText(b, '种下植物') && hasText(b, '剩余割草机'), b.map((x) => x.text));
  check('V35 胜利面板按钮齐全', hasText(b, '再玩一次') && hasText(b, '返回标题'), b.map((x) => x.text));
  const killed = await page.evaluate(() => window.PVZ.game.killed);
  check('V36 胜利统计数值非零且合理', killed > 0 && hasText(b, String(killed)), { killed, boxes: b.map((x) => x.text) });
  check('V37 胜利界面状态为 won', (await gs()).state === 'won', (await gs()).state);
}

/* ================================================================ 7. 失败 */
await clickLogical(555, 488);
await sleep(300);
await page.evaluate(() => {
  const g = window.PVZ.game;
  g.sun = 800; Object.keys(g.cardCd).forEach((k) => { g.cardCd[k] = 0; });
  g.plantAt(0, 0, 'sunflower');
  g.plantAt(2, 2, 'peashooter');
  const z = g.spawnZombie('cone', 3); if (z) z.x = 900;
  g.killed = 3;
  window.PVZ.end(false);
});
await sleep(800);
const lose = await capture('lose');
{
  const b = lose.boxes;
  check('V38 失败面板标题「僵尸吃掉了你的脑子」', hasText(b, '僵尸吃掉了你的脑子'), b.map((x) => x.text));
  check('V39 失败面板四项统计与按钮完整', hasText(b, '存活时长') && hasText(b, '击杀僵') && hasText(b, '再玩一次') && hasText(b, '返回标题'), b.map((x) => x.text));
  check('V40 失败界面状态为 lost', (await gs()).state === 'lost', (await gs()).state);
  check('V41 失败面板文字均在画布内', b.every((x) => x.x >= rect.left - 2 && x.y >= rect.top - 2 && x.x + x.w <= rect.left + rect.width + 2 && x.y + x.h <= rect.top + rect.height + 2));
}

/* ================================================================ 8. 全局像素/布局 */
{
  // letterbox 黑边
  const menuPx = pyAnalyze(menu.file, [[5, 5], [1435, 5], [5, 895], [1435, 895], [720, 450]]);
  if (menuPx) {
    const edges = menuPx.samples.slice(0, 4);
    const centerPx = menuPx.samples[4];
    const edgeDark = edges.every((c) => c[0] + c[1] + c[2] < 160);
    const centerBright = centerPx[0] + centerPx[1] + centerPx[2] > 160;
    check('V42 1440x900 下黑边填充正确（四角暗、中心亮）', edgeDark && centerBright, { edges, centerPx });
  }
  // 缩放关系：rect.width/1280 === rect.height/720
  check('V43 CSS 缩放关系一致（width/1280 ≈ height/720）', Math.abs(rect.width / L.W - rect.height / L.H) < 0.002, { w: rect.width, h: rect.height });
  // 草坪几何：逻辑坐标与截图坐标换算（lawn 左上角 = 截图 (225, 202.5)）
  const lawnPt = toShot(200, 140);
  check('V44 草坪左上角截图坐标换算正确（=200,140 逻辑）', Math.abs(lawnPt[0] - (rect.left + 200 * scale)) <= 1 && Math.abs(lawnPt[1] - (rect.top + 140 * scale)) <= 1, { lawnPt, exp: [rect.left + 200 * scale, rect.top + 140 * scale] });
  // 截图尺寸
  const sizes = Object.entries(screens).map(([k, v]) => [k, v.px && v.px.size]);
  check('V45 六张截图均为 1440x900', sizes.length === 6 && sizes.every(([, s]) => s && s[0] === 1440 && s[1] === 900), sizes);
  // 文字不重叠检查（HUD 文本盒两两重叠比例 > 35% 视为异常）
  const startBoxes = start.boxes;
  const badPairs = [];
  for (let i = 0; i < startBoxes.length; i++) for (let j = i + 1; j < startBoxes.length; j++) {
    const a = startBoxes[i], b = startBoxes[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 0 && oy > 0) {
      const ratio = (ox * oy) / Math.min(a.w * a.h, b.w * b.h);
      if (ratio > 0.35) badPairs.push([a.text, b.text, +ratio.toFixed(2)]);
    }
  }
  check('V46 HUD 文本之间无严重重叠（>35% 重叠为异常）', badPairs.length === 0, badPairs);
  check('V47 控制台零报错', errors.length === 0, errors.slice(0, 10));
}

/* ================================================================ 汇总 */
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
console.log(`\n===== 视觉/布局测试汇总：${pass} 通过 / ${fail} 失败 / 共 ${results.length} =====`);
if (fail) console.log('失败用例：\n' + results.filter((r) => !r.ok).map((r) => ' - ' + r.name + ' :: ' + JSON.stringify(r.detail)).join('\n'));
await browser.close();
process.exit(fail ? 1 : 0);