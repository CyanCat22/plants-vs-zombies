/* ART 预览截图：node tests/art-shot.mjs [序号]
 * 打开 tests/art-gallery.html，截全图到 shots/art-gallery-<n>.png，并输出控制台错误。
 */
import { puppeteer, CHROME } from './_puppeteer.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'shots');
if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
const n = process.argv[2] || String(1);
const out = path.join(SHOTS, `art-gallery-${n}.png`);


const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1600, height: 1280 }
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto('file://' + path.join(ROOT, 'tests', 'art-gallery.html'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__ready === true', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: out, fullPage: false });
await browser.close();

// 简易非空检查：统计非背景像素比例
import { execFileSync } from 'node:child_process';
let stats = '';
try {
  stats = execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(out)}).convert('RGB')
w,h = im.size
px = im.load()
bg = (27,26,20)
n = 0
for y in range(0,h,4):
    for x in range(0,w,4):
        r,g,b = px[x,y]
        if abs(r-bg[0])+abs(g-bg[1])+abs(b-bg[2]) > 30:
            n += 1
print(f"{w}x{h} 非背景像素占比 {n/((w//4)*(h//4))*100:.1f}%")
`], { encoding: 'utf8' });
} catch (e) {
  stats = '（像素统计不可用：' + (e.message || e) + '）';
}
console.log(JSON.stringify({ out, errors, stats: stats.trim() }, null, 2));