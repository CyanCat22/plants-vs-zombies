/* 测试公共入口：定位 puppeteer-core 与 Chrome。
 * 可用环境变量覆盖：
 *   PUPPETEER_PATH  puppeteer-core 包目录或 ESM 入口文件
 *   CHROME_PATH     Chrome 可执行文件
 * 默认回退到 npm 安装的 puppeteer-core，再回退到本机开发路径。
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const candidates = [];
const envPath = process.env.PUPPETEER_PATH;
if (envPath) {
  candidates.push(envPath);
  candidates.push(path.join(envPath, 'lib/esm/puppeteer/puppeteer-core.js'));
  candidates.push(path.join(envPath, 'lib/cjs/puppeteer/puppeteer-core.js'));
}
candidates.push('puppeteer-core');
const localEsm = path.join(ROOT, 'node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js');
if (existsSync(localEsm)) candidates.push(localEsm);

let mod = null;
let lastErr = null;
for (const spec of candidates) {
  try {
    mod = await import(spec);
    break;
  } catch (err) {
    lastErr = err;
  }
}
if (!mod) {
  throw new Error(
    '找不到 puppeteer-core。请在项目里执行 `npm install`（会安装 devDependencies），' +
    '或设置 PUPPETEER_PATH 指向 puppeteer-core 包目录。最后错误：' + (lastErr && lastErr.message)
  );
}

export const puppeteer = mod.default || mod;
export const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
