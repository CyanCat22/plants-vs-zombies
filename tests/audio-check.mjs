#!/usr/bin/env node
/**
 * 植物大战僵尸 · 音频模块自查（tests/audio-check.mjs）
 *
 * 用 headless Chrome 打开（file://）项目 index.html，直接调用 window.SFX：
 *   1) init 幂等、接口齐全、ctx 状态正常
 *   2) 逐个播放全部音效名（间隔 60ms），无 pageerror / console error
 *   3) 未知名字 / 异常参数静默忽略、不抛错
 *   4) 静音后播放不再产生声部；页面隐藏时不出声
 *   5) 同名高频触发限流（≤12 次/秒）
 *   6) startMusic / stopMusic 正常，BGM 确实在调度声部
 *   7) OfflineAudioContext 离线渲染若干音效，验证峰值/RMS > 0 且不削波
 *
 * 用法：node tests/audio-check.mjs
 * 说明：引擎脚本（game.js/hud.js/main.js）可能仍在开发中，缺失时浏览器会报
 *       “Failed to load resource”，本脚本只忽略这些引擎脚本的加载失败，
 *       其它 console error 一律判失败。
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { puppeteer, CHROME as CHROME_PATH } from './_puppeteer.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;

const SOUND_NAMES = [
  'click', 'seedSelect', 'error', 'plant', 'shoot', 'snowShoot',
  'hitFlesh', 'hitArmor', 'sunSpawn', 'sunCollect', 'chomp',
  'zombieGroan', 'zombieDie', 'explode', 'mower', 'shovel',
  'waveHorn', 'win', 'lose'
];

const REQUIRED_API = ['init', 'play', 'startMusic', 'stopMusic', 'setMuted', 'toggleMuted'];

// 引擎未交付时允许忽略的脚本加载错误
const IGNORABLE_MISSING = ['js/game.js', 'js/hud.js', 'js/main.js', 'favicon.ico'];

function isIgnorableConsoleError(entry) {
  const text = String(entry.text || '');
  const url = String(entry.url || '');
  const looksLikeMissing =
    /Failed to load resource|ERR_FILE_NOT_FOUND|net::ERR_FILE_NOT_FOUND|Not allowed to load local resource/i.test(text);
  if (!looksLikeMissing) return false;
  return IGNORABLE_MISSING.some((p) => url.includes(p) || text.includes(p));
}

const failures = [];
const passes = [];

function check(cond, label, detail) {
  if (cond) {
    passes.push(label);
    console.log(`  ✅ ${label}`);
  } else {
    failures.push({ label, detail });
    console.log(`  ❌ ${label}${detail !== undefined ? ' → ' + JSON.stringify(detail) : ''}`);
  }
}

async function main() {
  console.log('音效自查 · headless Chrome');
  console.log('  页面：' + INDEX_URL);
  console.log('  浏览器：' + CHROME_PATH);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--hide-scrollbars'
    ]
  });

  const pageErrors = [];
  const consoleErrors = [];
  const ignoredConsoleErrors = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const entry = { text: msg.text(), url: (msg.location && msg.location().url) || '' };
      if (isIgnorableConsoleError(entry)) ignoredConsoleErrors.push(entry);
      else consoleErrors.push(entry);
    });

    await page.goto(INDEX_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction('window.SFX && typeof window.SFX.play === "function"', { timeout: 8000 });

    const report = await page.evaluate(async (names) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const SFX = window.SFX;
      const dbg = SFX && SFX._debug;

      const out = {
        hasCanvas: !!document.getElementById('game'),
        hasSFX: !!SFX,
        apiMissing: [],
        initSameContext: false,
        ctxState: null,
        playFailed: [],
        playThrew: [],
        unknownThrew: [],
        extremeThrew: [],
        muted: null,
        mutedSilent: null,
        unmutedAudible: null,
        toggleOk: null,
        hiddenSilent: null,
        throttle: null,
        music: null,
        offline: {},
        debugAvailable: !!dbg,
        errors: []
      };

      if (!SFX) return out;

      for (const k of ['init', 'play', 'startMusic', 'stopMusic', 'setMuted', 'toggleMuted']) {
        if (typeof SFX[k] !== 'function') out.apiMissing.push(k);
      }
      if (typeof SFX.muted !== 'boolean') out.apiMissing.push('muted');

      // ---- init 幂等 ----
      try {
        const c1 = SFX.init();
        const c2 = SFX.init();
        out.initSameContext = !!c1 && c1 === c2;
        out.ctxState = c1 ? c1.state : null;
      } catch (e) {
        out.errors.push('init: ' + e.message);
      }

      // ---- 逐个音效 ----
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        try {
          const ok = SFX.play(name, {
            vol: 0.8 + (i % 2) * 0.2,
            rate: 0.85 + (i % 5) * 0.08,
            pan: ((i % 3) - 1) * 0.5
          });
          if (!ok) out.playFailed.push(name);
        } catch (e) {
          out.playThrew.push(name + ': ' + e.message);
        }
        await sleep(60);
      }

      // ---- 未知名字 / 异常参数 ----
      for (const v of ['__no_such_sound__', '', null, undefined, 42, {}, []]) {
        try { SFX.play(v); } catch (e) { out.unknownThrew.push(String(v) + ': ' + e.message); }
      }
      try {
        SFX.play('shoot', { vol: 99, rate: 99, pan: 99 });
        SFX.play('hitFlesh', { vol: -5, rate: 0.01, pan: -99 });
        SFX.play('click', null);
      } catch (e) {
        out.extremeThrew.push(e.message);
      }

      if (!dbg) return out;

      // ---- 静音 ----
      SFX.setMuted(false);
      await sleep(180);
      const on0 = dbg.startedCount();
      SFX.play('explode');
      await sleep(110);
      const on1 = dbg.startedCount();
      out.unmutedAudible = on1 > on0;

      SFX.setMuted(true);
      await sleep(110);
      const mute0 = dbg.startedCount();
      SFX.play('explode');
      SFX.play('shoot');
      SFX.play('chomp');
      await sleep(120);
      const mute1 = dbg.startedCount();
      out.muted = SFX.muted === true;
      out.mutedSilent = mute1 === mute0;

      const tog1 = SFX.toggleMuted(); // true -> false
      const tog2 = SFX.toggleMuted(); // false -> true
      out.toggleOk = tog1 === false && tog2 === true && SFX.muted === true;
      SFX.setMuted(false);
      await sleep(120);

      // ---- 页面隐藏 ----
      try {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        await sleep(140);
        const h0 = dbg.startedCount();
        SFX.play('hitFlesh');
        SFX.play('waveHorn');
        await sleep(120);
        const h1 = dbg.startedCount();
        out.hiddenSilent = h1 === h0;
      } catch (e) {
        out.errors.push('hidden: ' + e.message);
      } finally {
        try { delete document.hidden; } catch (e) { /* ignore */ }
        document.dispatchEvent(new Event('visibilitychange'));
        await sleep(140);
      }

      // ---- 同名限流（<= 12 次/秒）----
      await sleep(180);
      // 1) 同一 tick 内 40 次：只能放过 1 次
      const b0 = dbg.acceptedCount();
      for (let i = 0; i < 40; i++) SFX.play('shoot');
      const b1 = dbg.acceptedCount();
      // 2) 1 秒内每 25ms 尝试一次：按 83ms 最小间隔，最多约 12~13 次
      const p0 = dbg.acceptedCount();
      const tStart = performance.now();
      for (let i = 0; i < 40; i++) {
        SFX.play('shoot');
        await sleep(25);
      }
      const elapsedMs = performance.now() - tStart;
      const p1 = dbg.acceptedCount();
      out.throttle = {
        burstAccepted: b1 - b0,
        pacedAccepted: p1 - p0,
        elapsedMs: Math.round(elapsedMs),
        limitOk: b1 - b0 <= 1 && p1 - p0 <= 13
      };

      // ---- BGM ----
      const m0 = dbg.startedCount();
      const musicStart1 = SFX.startMusic();
      const musicStart2 = SFX.startMusic();
      await sleep(560);
      const m1 = dbg.startedCount();
      SFX.stopMusic();
      SFX.stopMusic();
      await sleep(120);
      out.music = {
        startReturned: [musicStart1, musicStart2],
        voices: m1 - m0,
        busyAfterStop: dbg.musicBusy(),
        activeAfterStop: dbg.musicActive(),
        ok: (m1 - m0) >= 3
      };

      // 停止 BGM 并等待所有一次性声部自然结束后，活动声部应回到 0（节点已回收）
      await sleep(1300);
      out.leak = { activeVoices: dbg.voiceCount(), ok: dbg.voiceCount() === 0 };

      // ---- OfflineAudioContext 真出声验证（逐个渲染全部音效）----
      if (typeof dbg.renderOffline === 'function') {
        const LONG = ['zombieGroan', 'zombieDie', 'explode', 'mower', 'waveHorn', 'win', 'lose'];
        for (const name of names) {
          const dur = LONG.includes(name) ? 1.3 : 0.7;
          try {
            out.offline[name] = await dbg.renderOffline(name, dur);
          } catch (e) {
            out.offline[name] = { error: String((e && e.message) || e) };
          }
        }
      }

      return out;
    }, SOUND_NAMES);

    // ---- 模拟“无 WebAudio”环境（第二个页面，在脚本执行前抹掉 AudioContext）----
    let degraded = null;
    try {
      const noAudioPage = await browser.newPage();
      await noAudioPage.evaluateOnNewDocument(() => {
        try { Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined }); } catch (e) { /* ignore */ }
        try { Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined }); } catch (e) { /* ignore */ }
      });
      const degPageErrors = [];
      noAudioPage.on('pageerror', (e) => degPageErrors.push(String(e)));
      await noAudioPage.goto(INDEX_URL, { waitUntil: 'load', timeout: 30000 });
      await noAudioPage.waitForFunction('window.SFX', { timeout: 8000 });
      degraded = await noAudioPage.evaluate(() => {
        const out = {
          hasAC: !!(window.AudioContext || window.webkitAudioContext),
          threw: null, initRet: 'unset', playRet: 'unset', unknownRet: 'unset',
          startStop: false, ready: null
        };
        try {
          out.initRet = window.SFX.init();
          out.playRet = window.SFX.play('explode');
          out.unknownRet = window.SFX.play('__nope__');
          out.startStop = (window.SFX.startMusic(), window.SFX.stopMusic(), true);
          out.ready = window.SFX.ready;
        } catch (e) {
          out.threw = String(e);
        }
        return out;
      });
      degraded.pageErrors = degPageErrors;
      await noAudioPage.close();
    } catch (e) {
      degraded = { error: String(e) };
    }

    // ================= 断言 =================
    console.log('\n[1/7] 页面与接口');
    check(report.hasCanvas === true, '页面存在 #game canvas');
    check(report.hasSFX === true, 'window.SFX 存在');
    check(report.apiMissing.length === 0, 'SFX 接口齐全（init/play/startMusic/stopMusic/setMuted/toggleMuted/muted）', report.apiMissing);
    check(report.initSameContext === true, 'init() 幂等，重复调用返回同一 AudioContext');
    check(report.ctxState === 'running' || report.ctxState === 'suspended', 'AudioContext 状态正常', report.ctxState);

    console.log('\n[2/7] 全音效逐个触发');
    check(report.playFailed.length === 0, `全部 ${SOUND_NAMES.length} 个音效 play 返回 true`, report.playFailed);
    check(report.playThrew.length === 0, '逐个播放无异常', report.playThrew);
    if (!report.debugAvailable) console.log('  ⚠️ 未发现 _debug 钩子，深度检查将跳过');

    console.log('\n[3/7] 未知名字 / 异常参数 / 无 WebAudio 降级');
    check(report.unknownThrew.length === 0, '未知/非法音效名静默忽略、不抛错', report.unknownThrew);
    check(report.extremeThrew.length === 0, 'vol/rate/pan 越界值被钳制、不抛错', report.extremeThrew);
    check(degraded && degraded.hasAC === false, '模拟环境成功抹除 AudioContext', degraded);
    check(
      degraded && degraded.threw === null && degraded.initRet === null && degraded.playRet === false &&
        degraded.unknownRet === false && degraded.startStop === true && (degraded.pageErrors || []).length === 0,
      '无 WebAudio 时 init/play/startMusic/stopMusic 静默降级、不抛错',
      degraded
    );

    console.log('\n[4/7] 静音与可见性');
    check(report.muted === true, 'setMuted(true) 后 muted === true');
    check(report.unmutedAudible === true, '未静音时 play 会产生声部（对照组）');
    check(report.mutedSilent === true, '静音后 play 不再产生任何声部（无声）');
    check(report.toggleOk === true, 'toggleMuted() 正确翻转并返回布尔值');
    check(report.hiddenSilent === true, '页面隐藏时 play 不出声');

    console.log('\n[5/7] 同名限流');
    check(report.throttle && report.throttle.limitOk === true, '同名 40 次同 tick 仅放过 1 次，且 1 秒内 ≤13 次（约 12 次/秒）', report.throttle);

    console.log('\n[6/7] BGM');
    const music = report.music || {};
    check(Array.isArray(music.startReturned) && music.startReturned.every(Boolean), 'startMusic() 返回正常且重复调用安全', music.startReturned);
    check(music.ok === true, 'BGM 在 0.56s 内实际调度了声部', music.voices);
    check(music.busyAfterStop === false && music.activeAfterStop === false, 'stopMusic() 停止调度并清理定时器', music);

    const leak = report.leak || {};
    check(leak.ok === true, `所有一次性声部结束后活动节点归零（activeVoices=${leak.activeVoices}）`, leak);

    console.log('\n[7/7] OfflineAudioContext 非静音 / 不削波');
    const offline = report.offline || {};
    const offlineNames = Object.keys(offline);
    check(offlineNames.length >= SOUND_NAMES.length, `离线渲染了全部 ${SOUND_NAMES.length} 个音效`, offlineNames.length);
    for (const name of offlineNames) {
      const r = offline[name] || {};
      if (r.error) {
        check(false, `${name} 离线渲染成功`, r.error);
        continue;
      }
      check(
        r.peak > 0.003 && r.rms > 0.0003,
        `${name} 确实出声（peak=${Number(r.peak).toFixed(4)}, rms=${Number(r.rms).toFixed(5)}）`
      );
      check(r.peak < 0.99, `${name} 峰值未削波（peak=${Number(r.peak).toFixed(4)} < 0.99）`, r.peak);
    }

    console.log('\n[附加] 运行期错误');
    check(pageErrors.length === 0, '无 pageerror', pageErrors);
    check(consoleErrors.length === 0, '无 console error', consoleErrors);
    if (ignoredConsoleErrors.length) {
      console.log(`  ℹ️ 已忽略 ${ignoredConsoleErrors.length} 条引擎脚本缺失导致的资源加载错误（game.js/hud.js/main.js 尚未交付）`);
    }
    if (report.errors.length) console.log('  ℹ️ 页面内捕获：', report.errors);

    console.log(`\n========== 结果：${passes.length} 通过 / ${failures.length} 失败 ==========`);
    if (failures.length) {
      for (const f of failures) console.log(`  ❌ ${f.label}${f.detail !== undefined ? ' → ' + JSON.stringify(f.detail) : ''}`);
      process.exitCode = 1;
    } else {
      console.log('  🎉 音频模块自查全部通过');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('自查脚本异常：', err);
  process.exit(2);
});