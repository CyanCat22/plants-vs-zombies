/* 美术客观分析：逐个精灵渲染到透明画布，测量包围盒、颜色丰富度、描边占比。
 * 用法：node tests/art-analyze.mjs
 */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  defaultViewport: { width: 800, height: 600 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.join(ROOT, 'index.html'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.PVZ_READY === true');

const report = await page.evaluate(() => {
  const ART = window.ART;
  const cases = [];
  const plants = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'repeater', 'cherrybomb', 'potatomine'];
  plants.forEach((type) => {
    cases.push({ name: 'plant:' + type, draw: (ctx) => ART.drawPlant(ctx, type, { t: 1.7, scale: 1, hpRatio: 1, state: type === 'potatomine' ? 'armed' : 'idle', pop: 1, flash: 0 }) });
  });
  cases.push({ name: 'plant:wallnut@40%', draw: (ctx) => ART.drawPlant(ctx, 'wallnut', { t: 1.7, scale: 1, hpRatio: 0.4, state: 'idle', pop: 1, flash: 0 }) });
  cases.push({ name: 'plant:peashooter-shoot', draw: (ctx) => ART.drawPlant(ctx, 'peashooter', { t: 1.7, scale: 1, hpRatio: 1, state: 'shoot', pop: 1, flash: 1 }) });
  const zombies = ['basic', 'cone', 'bucket', 'flag', 'football'];
  zombies.forEach((type) => {
    ['walk', 'eat', 'die'].forEach((state) => {
      cases.push({
        name: 'zombie:' + type + '/' + state,
        draw: (ctx) => ART.drawZombie(ctx, type, { t: 2.3, scale: 1, phase: 0.3, state, hpRatio: state === 'die' ? 0.2 : 1, flash: 0, slow: 0, deathT: 0.45 })
      });
    });
  });
  cases.push({ name: 'zombie:bucket-slow', draw: (ctx) => ART.drawZombie(ctx, 'bucket', { t: 2.3, scale: 1, phase: 0.3, state: 'walk', hpRatio: 0.6, flash: 0, slow: 1 }) });
  cases.push({ name: 'sun', draw: (ctx) => ART.drawSun(ctx, { t: 1.2, r: 38, glow: 0.8 }) });
  cases.push({ name: 'pea', draw: (ctx) => ART.drawPea(ctx, { t: 0, kind: 'pea', r: 11 }) });
  cases.push({ name: 'snowpea-pea', draw: (ctx) => ART.drawPea(ctx, { t: 0, kind: 'snow', r: 11 }) });
  cases.push({ name: 'mower', draw: (ctx) => ART.drawMower(ctx, { t: 1, active: false, x: 0 }) });
  cases.push({ name: 'mower-active', draw: (ctx) => ART.drawMower(ctx, { t: 1, active: true, x: 0 }) });
  cases.push({ name: 'shovel', draw: (ctx) => ART.drawShovel(ctx, { t: 1, size: 1 }) });
  cases.push({ name: 'explosion', draw: (ctx) => ART.drawExplosion(ctx, { t: 0, age: 0.45, r: 80 }) });
  cases.push({ name: 'splat', draw: (ctx) => ART.drawSplat(ctx, { t: 0, age: 0.4, kind: 'pea' }) });
  cases.push({ name: 'zombie-head', draw: (ctx) => ART.drawZombieHead(ctx, { t: 1 }) });

  const W = 520;
  const H = 480;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  return cases.map((c) => {
    const isChar = c.name.startsWith('plant:') || c.name.startsWith('zombie:') || c.name === 'zombie-head';
    const originY = isChar ? H - 60 : H / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(W / 2, originY);
    c.draw(ctx);
    const data = ctx.getImageData(0, 0, W, H).data;
    let minX = W, minY = H, maxX = -1, maxY = -1, count = 0, dark = 0;
    const colors = new Set();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const a = data[i + 3];
        if (a < 40) continue;
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < 70 && g < 65 && b < 55) dark++;
        colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
      }
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const originX = W / 2;
    const originY2 = originY;
    return {
      name: c.name,
      w: bw,
      h: bh,
      coverage: +(count / (W * H) * 100).toFixed(1),
      bboxFill: +(count / (bw * bh) * 100).toFixed(1),
      colors: colors.size,
      darkPct: +(dark / count * 100).toFixed(1),
      footY: maxY - originY2,
      centerDX: +(((minX + maxX) / 2) - originX).toFixed(1),
      overflow: minX < 4 || maxX > W - 4 || minY < 4 || maxY > H - 4
    };
  });
});

const problems = [];
report.forEach((r) => {
  const isPlant = r.name.startsWith('plant:');
  const isZombie = r.name.startsWith('zombie:');
  const isProp = !isPlant && !isZombie;
  if (r.overflow) problems.push(`${r.name}: 超出画布（测量区域不够或真越界）`);
  if (isPlant && (r.h < 55 || r.h > 135)) problems.push(`${r.name}: 高度异常 ${r.h}`);
  if (isPlant && r.colors < 40) problems.push(`${r.name}: 颜色过少 ${r.colors}`);
  if (isPlant && r.darkPct < 8) problems.push(`${r.name}: 描边像素偏少 ${r.darkPct}%`);
  if (isZombie && (r.h < 110 || r.h > 210)) problems.push(`${r.name}: 高度异常 ${r.h}`);
  if (isZombie && (r.w < 80 || r.w > 170)) problems.push(`${r.name}: 宽度异常 ${r.w}`);
  if (isZombie && r.colors < 60) problems.push(`${r.name}: 颜色过少 ${r.colors}`);
  if (isZombie && r.darkPct < 8) problems.push(`${r.name}: 描边像素偏少 ${r.darkPct}%`);
  const centered = /^(sun|pea|snowpea-pea|shovel|explosion|splat)/.test(r.name);
  if (centered && Math.abs(r.footY) > 80) problems.push(`${r.name}: 未居中 footY=${r.footY}`);
  if (isPlant && Math.abs(r.footY) > 8) problems.push(`${r.name}: 脚底不在原点 (footY=${r.footY})`);
  if (isZombie && !/die/.test(r.name) && Math.abs(r.footY) > 14) problems.push(`${r.name}: 脚底偏移 (footY=${r.footY})`);
});
console.log(JSON.stringify({ errors, problems, report }, null, 1));
await browser.close();
process.exit(problems.length || errors.length ? 1 : 0);
