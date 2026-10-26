/* 植物大战僵尸 · 音频模块（纯 WebAudio 合成，零外部音频文件）
 * 契约见 docs/CONTRACT.md 第 3 节。
 *
 * 结构：
 *   1. 合成器辅助函数：env / osc / noise（含包络、滤波、颤音、节点回收）
 *   2. 音效表 SYNTHS：契约要求的全部音效（19 个主名字 + 少量兼容别名）
 *   3. 播控层：init / play（限流、静音、可见性、降级）/ setMuted / toggleMuted
 *   4. 循环 BGM：小调琶音 + 低音脉冲 + 轻噪声，无缝调度，音量很低
 *
 * 设计原则：所有一次性声部在 onended 时 stop/disconnect，不留节点；
 * 任何异常都在内部吞掉，绝不向页面抛错。
 */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext || null;

  // ---------- 可调参数 ----------
  var MASTER_VOL = 0.85;      // 总音量（克制，留足动态余量）
  var SFX_BUS_VOL = 0.9;      // 音效总线
  var MUSIC_BUS_VOL = 0.5;    // BGM 总线（轻）
  var MAX_VOICES = 48;        // 同时作响的声部上限，防节点爆炸
  var MAX_PER_SEC = 12;       // 同名音效每秒最多触发次数（契约要求）
  var THROTTLE_MS = 1000 / MAX_PER_SEC;

  // ---------- 运行期状态 ----------
  var ctx = null;
  var master = null;
  var comp = null;
  var sfxBus = null;
  var musicBus = null;
  var initTried = false;
  var visibilityBound = false;
  var activeVoices = 0;
  var startedVoices = 0;
  var acceptedPlays = 0;
  var lastPlayAt = Object.create(null);
  var noiseBuffers = new WeakMap();

  // BGM 调度状态
  var musicOn = false;
  var musicTimer = null;
  var musicStep = 0;
  var nextNoteTime = 0;

  // ---------- 小工具 ----------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function num(v, dflt) {
    return (typeof v === 'number' && isFinite(v)) ? v : dflt;
  }

  function nowMs() {
    try {
      if (typeof performance !== 'undefined' && performance.now) return performance.now();
    } catch (e) { /* ignore */ }
    return Date.now();
  }

  function isHidden() {
    try { return typeof document !== 'undefined' && !!document.hidden; }
    catch (e) { return false; }
  }

  function audible() { return !SFX.muted && !isHidden(); }

  // ---------- 噪声缓冲（每个 AudioContext 缓存一份） ----------
  function noiseBuffer(c) {
    var cached = noiseBuffers.get(c);
    if (cached) return cached;
    var len = Math.max(1, Math.ceil(c.sampleRate * 2));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    var seed = 0x1234567;
    for (var i = 0; i < len; i++) {
      // 轻量 xorshift，避免直接 Math.random 的偶发规律感，也不需要加密随机
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(c, buf);
    return buf;
  }

  // ---------- 包络：起音 -> 峰值 -> 指数衰减到近零 ----------
  function env(param, t0, peak, attack, dur) {
    var a = Math.max(0.001, attack);
    var end = Math.max(a + 0.012, dur);
    param.cancelScheduledValues(t0);
    param.setValueAtTime(0.0001, t0);
    param.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    param.exponentialRampToValueAtTime(0.0001, t0 + end);
  }

  // ---------- 声部登记：onended 时统一 disconnect，避免长跑节点泄漏 ----------
  function register(sources, nodes, offline) {
    var track = !offline;
    if (track) {
      activeVoices++;
      startedVoices++;
    }
    var pending = sources.length;
    var disposed = false;

    function done() {
      if (disposed) return;
      if (--pending > 0) return;
      disposed = true;
      if (track) activeVoices = Math.max(0, activeVoices - 1);
      for (var i = 0; i < sources.length; i++) {
        try { sources[i].disconnect(); } catch (e) { /* ignore */ }
      }
      for (var j = 0; j < nodes.length; j++) {
        try { nodes[j].disconnect(); } catch (e) { /* ignore */ }
      }
    }

    for (var i = 0; i < sources.length; i++) {
      try { sources[i].onended = done; }
      catch (e) { done(); }
    }
  }

  // ---------- 振荡器声部 ----------
  // o = { t0, type, f0, f1, dur, vol, attack, detune, filter:{type,f0,f1,q}, vib:{rate,depth} }
  function osc(c, dest, o) {
    var t0 = o.t0;
    var dur = Math.max(0.02, num(o.dur, 0.15));
    var f0 = Math.max(20, num(o.f0, 440));
    var f1 = Math.max(20, num(o.f1, f0));
    var vol = Math.max(0.0001, num(o.vol, 0.08));
    var attack = num(o.attack, 0.004);

    var node = c.createOscillator();
    node.type = o.type || 'sine';
    node.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) node.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    if (o.detune) node.detune.value = o.detune;

    var tail = node;
    var extras = [];
    if (o.filter) {
      var flt = c.createBiquadFilter();
      flt.type = o.filter.type || 'lowpass';
      var ff0 = Math.max(20, num(o.filter.f0, 1200));
      var ff1 = Math.max(20, num(o.filter.f1, ff0));
      flt.frequency.setValueAtTime(ff0, t0);
      if (ff1 !== ff0) flt.frequency.exponentialRampToValueAtTime(ff1, t0 + dur);
      flt.Q.value = num(o.filter.q, 0.7);
      tail.connect(flt);
      tail = flt;
      extras.push(flt);
    }

    var gain = c.createGain();
    env(gain.gain, t0, vol, attack, dur);
    tail.connect(gain);
    gain.connect(dest);
    extras.push(gain);

    var sources = [node];
    if (o.vib) {
      var lfo = c.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = num(o.vib.rate, 5);
      var lfoGain = c.createGain();
      lfoGain.gain.value = num(o.vib.depth, 4);
      lfo.connect(lfoGain);
      lfoGain.connect(node.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
      sources.push(lfo);
      extras.push(lfoGain);
    }

    node.start(t0);
    node.stop(t0 + dur + 0.03);
    register(sources, extras, typeof c.startRendering === 'function');
  }

  // ---------- 噪声声部 ----------
  // o = { t0, dur, vol, attack, filter:{type,f0,f1,q} }
  function noise(c, dest, o) {
    var t0 = o.t0;
    var dur = Math.max(0.02, num(o.dur, 0.15));
    var vol = Math.max(0.0001, num(o.vol, 0.05));
    var attack = num(o.attack, 0.003);
    var f = o.filter || { type: 'lowpass', f0: 1200, q: 0.7 };

    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;

    var flt = c.createBiquadFilter();
    flt.type = f.type || 'lowpass';
    var ff0 = Math.max(20, num(f.f0, 1200));
    var ff1 = Math.max(20, num(f.f1, ff0));
    flt.frequency.setValueAtTime(ff0, t0);
    if (ff1 !== ff0) flt.frequency.exponentialRampToValueAtTime(ff1, t0 + dur);
    flt.Q.value = num(f.q, 0.7);

    var gain = c.createGain();
    env(gain.gain, t0, vol, attack, dur);

    src.connect(flt);
    flt.connect(gain);
    gain.connect(dest);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
    register([src], [flt, gain], typeof c.startRendering === 'function');
  }

  // ---------- 音效表 ----------
  // 每个合成器签名：(ctx, dest, t0, o)，o = { vol, rate, pan }
  var SYNTHS = Object.create(null);

  // 按钮轻点
  SYNTHS.click = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'triangle', f0: 1250 * r, f1: 900 * r, dur: 0.055, vol: 0.075 * v, attack: 0.002 });
    noise(c, d, { t0: t, dur: 0.025, vol: 0.016 * v, filter: { type: 'highpass', f0: 3200, q: 0.8 } });
  };

  // 选中种子卡：两粒上行木琴
  SYNTHS.seedSelect = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'triangle', f0: 620 * r, f1: 700 * r, dur: 0.09, vol: 0.055 * v, attack: 0.003 });
    osc(c, d, { t0: t + 0.055, type: 'triangle', f0: 940 * r, f1: 1040 * r, dur: 0.14, vol: 0.045 * v, attack: 0.003 });
  };

  // 阳光不足 / 操作失败：闷闷的低频蜂鸣
  SYNTHS.error = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'square', f0: 150 * r, f1: 118 * r, dur: 0.17, vol: 0.032 * v, attack: 0.004, filter: { type: 'lowpass', f0: 620, q: 0.6 } });
    osc(c, d, { t0: t, type: 'sawtooth', f0: 96 * r, dur: 0.19, vol: 0.026 * v, attack: 0.006, filter: { type: 'lowpass', f0: 360, q: 0.5 } });
  };

  // 种下植物：软土闷响 + 一声轻弹
  SYNTHS.plant = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'sine', f0: 210 * r, f1: 88 * r, dur: 0.18, vol: 0.1 * v, attack: 0.004 });
    osc(c, d, { t0: t + 0.012, type: 'triangle', f0: 330 * r, f1: 150 * r, dur: 0.1, vol: 0.026 * v, attack: 0.003 });
    noise(c, d, { t0: t, dur: 0.12, vol: 0.034 * v, filter: { type: 'lowpass', f0: 620, q: 0.7 } });
  };

  // 射豌豆：“啵”
  SYNTHS.shoot = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'sine', f0: 520 * r, f1: 170 * r, dur: 0.11, vol: 0.095 * v, attack: 0.003 });
    osc(c, d, { t0: t, type: 'triangle', f0: 262 * r, f1: 120 * r, dur: 0.09, vol: 0.032 * v, attack: 0.003 });
    noise(c, d, { t0: t, dur: 0.06, vol: 0.022 * v, filter: { type: 'bandpass', f0: 900, f1: 420, q: 1.1 } });
  };

  // 寒冰豌豆：“咻”——带通噪声扫频 + 下滑正弦
  SYNTHS.snowShoot = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    noise(c, d, { t0: t, dur: 0.26, vol: 0.05 * v, attack: 0.012, filter: { type: 'bandpass', f0: 3600 * r, f1: 820 * r, q: 1.2 } });
    osc(c, d, { t0: t, type: 'sine', f0: 1400 * r, f1: 480 * r, dur: 0.24, vol: 0.028 * v, attack: 0.008 });
    osc(c, d, { t0: t + 0.01, type: 'triangle', f0: 2200 * r, f1: 900 * r, dur: 0.12, vol: 0.011 * v, attack: 0.004 });
  };

  // 打中肉体：沉闷的“噗”
  SYNTHS.hitFlesh = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'sine', f0: 170 * r, f1: 64 * r, dur: 0.11, vol: 0.1 * v, attack: 0.003 });
    osc(c, d, { t0: t, type: 'triangle', f0: 92 * r, f1: 50 * r, dur: 0.12, vol: 0.038 * v, attack: 0.003 });
    noise(c, d, { t0: t, dur: 0.08, vol: 0.042 * v, filter: { type: 'lowpass', f0: 900, f1: 300, q: 0.6 } });
  };

  // 打中铁桶/路障：金属“叮”
  SYNTHS.hitArmor = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'triangle', f0: 1180 * r, dur: 0.13, vol: 0.026 * v, attack: 0.001 });
    osc(c, d, { t0: t, type: 'sine', f0: 1740 * r, dur: 0.17, vol: 0.017 * v, attack: 0.001 });
    noise(c, d, { t0: t, dur: 0.05, vol: 0.024 * v, filter: { type: 'highpass', f0: 2600, q: 0.8 } });
  };

  // 阳光生成：清亮的上行闪光
  SYNTHS.sunSpawn = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, { t0: t, type: 'sine', f0: 880 * r, dur: 0.1, vol: 0.033 * v, attack: 0.004 });
    osc(c, d, { t0: t + 0.06, type: 'sine', f0: 1174 * r, dur: 0.12, vol: 0.028 * v, attack: 0.004 });
    osc(c, d, { t0: t + 0.12, type: 'sine', f0: 1568 * r, dur: 0.18, vol: 0.02 * v, attack: 0.004 });
    noise(c, d, { t0: t + 0.1, dur: 0.12, vol: 0.007 * v, filter: { type: 'highpass', f0: 5000, q: 0.7 } });
  };

  // 收集阳光：三连上行铃音
  SYNTHS.sunCollect = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    var notes = [1046.5, 1318.5, 1568.0];
    for (var i = 0; i < notes.length; i++) {
      osc(c, d, {
        t0: t + i * 0.05,
        type: 'sine',
        f0: notes[i] * r,
        dur: i === 2 ? 0.28 : 0.11,
        vol: (i === 2 ? 0.03 : 0.038) * v,
        attack: 0.004
      });
    }
    osc(c, d, { t0: t, type: 'triangle', f0: 523.25 * r, dur: 0.2, vol: 0.012 * v, attack: 0.005 });
  };

  // 僵尸啃植物：“咔嚓”
  SYNTHS.chomp = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    noise(c, d, { t0: t, dur: 0.055, vol: 0.052 * v, filter: { type: 'lowpass', f0: 2200, f1: 700, q: 0.8 } });
    noise(c, d, { t0: t + 0.08, dur: 0.06, vol: 0.042 * v, filter: { type: 'lowpass', f0: 1800, f1: 500, q: 0.8 } });
    osc(c, d, { t0: t, type: 'sine', f0: 130 * r, f1: 58 * r, dur: 0.12, vol: 0.055 * v, attack: 0.003 });
  };

  // 僵尸低吼：低频锯齿 + 慢颤音
  SYNTHS.zombieGroan = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, {
      t0: t, type: 'sawtooth', f0: 92 * r, f1: 70 * r, dur: 0.78, vol: 0.026 * v,
      attack: 0.12, filter: { type: 'lowpass', f0: 480, f1: 260, q: 0.8 },
      vib: { rate: 4.5, depth: 5 }
    });
    osc(c, d, { t0: t, type: 'sawtooth', f0: 61 * r, f1: 44 * r, dur: 0.82, vol: 0.019 * v, attack: 0.18, detune: 8, filter: { type: 'lowpass', f0: 300, q: 0.6 } });
    noise(c, d, { t0: t + 0.05, dur: 0.65, vol: 0.01 * v, attack: 0.15, filter: { type: 'lowpass', f0: 340, q: 0.5 } });
  };

  // 僵尸倒下：吼声下滑 + 落地闷响
  SYNTHS.zombieDie = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, {
      t0: t, type: 'sawtooth', f0: 115 * r, f1: 44 * r, dur: 0.6, vol: 0.034 * v,
      attack: 0.01, filter: { type: 'lowpass', f0: 900, f1: 200, q: 0.8 },
      vib: { rate: 6, depth: 6 }
    });
    noise(c, d, { t0: t + 0.36, dur: 0.28, vol: 0.045 * v, filter: { type: 'lowpass', f0: 420, f1: 140, q: 0.6 } });
    osc(c, d, { t0: t + 0.38, type: 'sine', f0: 82 * r, f1: 36 * r, dur: 0.3, vol: 0.05 * v, attack: 0.004 });
  };

  // 爆炸：低频轰 + 噪声爆裂
  SYNTHS.explode = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    noise(c, d, { t0: t, dur: 0.6, vol: 0.13 * v, attack: 0.004, filter: { type: 'lowpass', f0: 1000 * r, f1: 120, q: 0.7 } });
    osc(c, d, { t0: t, type: 'sine', f0: 92 * r, f1: 32 * r, dur: 0.7, vol: 0.15 * v, attack: 0.005 });
    osc(c, d, { t0: t, type: 'triangle', f0: 56 * r, f1: 28 * r, dur: 0.55, vol: 0.075 * v, attack: 0.006 });
    noise(c, d, { t0: t, dur: 0.12, vol: 0.032 * v, attack: 0.002, filter: { type: 'highpass', f0: 2800, q: 0.7 } });
  };

  // 割草机：发动机低频突突声
  SYNTHS.mower = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, {
      t0: t, type: 'sawtooth', f0: 52 * r, f1: 58 * r, dur: 0.95, vol: 0.065 * v,
      attack: 0.02, filter: { type: 'lowpass', f0: 430, f1: 500, q: 0.7 },
      vib: { rate: 26, depth: 2.5 }
    });
    osc(c, d, { t0: t, type: 'sawtooth', f0: 104 * r, f1: 116 * r, dur: 0.9, vol: 0.02 * v, attack: 0.03, detune: -6, filter: { type: 'lowpass', f0: 760, q: 0.6 } });
    noise(c, d, { t0: t, dur: 0.9, vol: 0.015 * v, attack: 0.03, filter: { type: 'lowpass', f0: 300, q: 0.5 } });
  };

  // 铁锹铲除：金属刮擦 + 轻闷响
  SYNTHS.shovel = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    noise(c, d, { t0: t, dur: 0.14, vol: 0.048 * v, filter: { type: 'bandpass', f0: 1500 * r, f1: 700 * r, q: 1.4 } });
    osc(c, d, { t0: t, type: 'sine', f0: 260 * r, f1: 108 * r, dur: 0.12, vol: 0.052 * v, attack: 0.003 });
    noise(c, d, { t0: t + 0.02, dur: 0.05, vol: 0.018 * v, filter: { type: 'highpass', f0: 3200, q: 0.8 } });
  };

  // 波次号角：上行的老式警报
  SYNTHS.waveHorn = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    osc(c, d, {
      t0: t, type: 'sawtooth', f0: 196 * r, f1: 220 * r, dur: 0.9, vol: 0.038 * v,
      attack: 0.06, filter: { type: 'lowpass', f0: 1000, q: 0.8 }, vib: { rate: 5.5, depth: 3 }
    });
    osc(c, d, { t0: t, type: 'sawtooth', f0: 294 * r, f1: 330 * r, dur: 0.9, vol: 0.022 * v, attack: 0.08, detune: 5, filter: { type: 'lowpass', f0: 1200, q: 0.7 } });
    osc(c, d, { t0: t, type: 'sawtooth', f0: 147 * r, f1: 165 * r, dur: 0.9, vol: 0.018 * v, attack: 0.1, filter: { type: 'lowpass', f0: 600, q: 0.6 } });
  };

  // 胜利：小号角三连上行 + 收尾长音
  SYNTHS.win = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    var fanfare = [
      { f: 523.25, dt: 0.0, dur: 0.13, vol: 0.046 },
      { f: 659.25, dt: 0.12, dur: 0.13, vol: 0.046 },
      { f: 783.99, dt: 0.24, dur: 0.16, vol: 0.05 },
      { f: 1046.5, dt: 0.38, dur: 0.5, vol: 0.055 }
    ];
    for (var i = 0; i < fanfare.length; i++) {
      var n = fanfare[i];
      osc(c, d, {
        t0: t + n.dt, type: 'triangle', f0: n.f * r, dur: n.dur, vol: n.vol * v,
        attack: 0.012, filter: { type: 'lowpass', f0: 2600, q: 0.6 }
      });
      osc(c, d, { t0: t + n.dt, type: 'sine', f0: n.f * 2 * r, dur: n.dur * 0.8, vol: n.vol * 0.3 * v, attack: 0.015 });
    }
    // 收尾和声
    osc(c, d, { t0: t + 0.38, type: 'triangle', f0: 783.99 * r, dur: 0.5, vol: 0.026 * v, attack: 0.02, filter: { type: 'lowpass', f0: 2400, q: 0.6 } });
    osc(c, d, { t0: t + 0.38, type: 'triangle', f0: 659.25 * r, dur: 0.5, vol: 0.022 * v, attack: 0.02, filter: { type: 'lowpass', f0: 2200, q: 0.6 } });
  };

  // 失败：下行小调长音
  SYNTHS.lose = function (c, d, t, o) {
    var r = o.rate, v = o.vol;
    var seq = [
      { f: 392.0, dt: 0.0, dur: 0.2, vol: 0.045 },
      { f: 349.23, dt: 0.18, dur: 0.2, vol: 0.045 },
      { f: 293.66, dt: 0.36, dur: 0.22, vol: 0.045 },
      { f: 220.0, dt: 0.58, dur: 0.75, vol: 0.05 }
    ];
    for (var i = 0; i < seq.length; i++) {
      var n = seq[i];
      osc(c, d, {
        t0: t + n.dt, type: 'triangle', f0: n.f * r, f1: n.f * 0.985 * r, dur: n.dur, vol: n.vol * v,
        attack: 0.02, filter: { type: 'lowpass', f0: 900, q: 0.7 }
      });
      osc(c, d, { t0: t + n.dt, type: 'sine', f0: n.f * 0.5 * r, dur: n.dur, vol: n.vol * 0.4 * v, attack: 0.03 });
    }
    osc(c, d, { t0: t + 0.58, type: 'sine', f0: 110 * r, dur: 0.8, vol: 0.03 * v, attack: 0.04, filter: { type: 'lowpass', f0: 400, q: 0.6 } });
  };

  // 兼容别名（引擎/旧代码若使用近义名字也能响；不认识的名字仍静默忽略）
  var ALIASES = {
    bite: 'chomp',
    zombieBite: 'chomp',
    groan: 'zombieGroan',
    die: 'zombieDie',
    sun: 'sunCollect',
    mowerStart: 'mower',
    select: 'seedSelect',
    seed: 'seedSelect',
    shootPea: 'shoot',
    freeze: 'snowShoot'
  };

  // ---------- BGM：小调琶音 + 低音脉冲 + 轻噪声 ----------
  var MUSIC = {
    step: (60 / 104) / 2, // 104 BPM 的八分音符
    arpPattern: [0, 2, 1, 3, 2, 4, 3, 1],
    bars: [
      { bass: 110.00, arp: [220.00, 261.63, 329.63, 440.00, 523.25] }, // Am
      { bass: 87.31, arp: [174.61, 220.00, 261.63, 349.23, 440.00] },  // F
      { bass: 98.00, arp: [196.00, 246.94, 293.66, 392.00, 493.88] },  // G
      { bass: 82.41, arp: [164.81, 196.00, 246.94, 329.63, 392.00] }   // Em
    ]
  };

  function playMusicStep(i, t) {
    if (!ctx || !musicBus) return;
    var bar = MUSIC.bars[Math.floor(i / 8) % MUSIC.bars.length];
    var k = i % 8;
    var note = bar.arp[MUSIC.arpPattern[k]];

    // 琶音主声部
    if (note) {
      osc(ctx, musicBus, {
        t0: t, type: 'triangle', f0: note, dur: MUSIC.step * 0.9, vol: 0.05,
        attack: 0.008, filter: { type: 'lowpass', f0: 2200, q: 0.5 }
      });
      // 轻微失谐的幽灵声部，制造“诡异”感
      if (k % 2 === 0) {
        osc(ctx, musicBus, { t0: t, type: 'sine', f0: note * 1.006, dur: MUSIC.step * 0.8, vol: 0.016, attack: 0.012 });
      }
    }

    // 低音脉冲：每小节第 1、3 拍
    if (k === 0 || k === 4) {
      osc(ctx, musicBus, {
        t0: t, type: 'triangle', f0: bar.bass, dur: MUSIC.step * 1.9, vol: 0.08,
        attack: 0.01, filter: { type: 'lowpass', f0: 320, q: 0.6 }
      });
    }

    // 轻沙锤：反拍
    if (k % 2 === 1) {
      noise(ctx, musicBus, { t0: t, dur: 0.05, vol: 0.007, filter: { type: 'bandpass', f0: 6000, q: 1.2 } });
    }

    // 每小节末尾一声很轻的高音“叹气”
    if (k === 7 && (Math.floor(i / 8) % 2 === 1)) {
      osc(ctx, musicBus, { t0: t + MUSIC.step * 0.5, type: 'sine', f0: bar.arp[4] * 2, dur: MUSIC.step * 1.4, vol: 0.01, attack: 0.02 });
    }
  }

  function scheduleMusic() {
    if (!ctx || !musicOn || !audible()) return;
    var horizon = ctx.currentTime + 0.35;
    // 防止后台节流后一次补太多
    if (nextNoteTime < ctx.currentTime - 1) nextNoteTime = ctx.currentTime + 0.05;
    var guard = 0;
    while (nextNoteTime < horizon && guard < 16) {
      playMusicStep(musicStep, nextNoteTime);
      nextNoteTime += MUSIC.step;
      musicStep = (musicStep + 1) % 32;
      guard++;
    }
  }

  function setMusicBus(target, glide) {
    if (!musicBus) return;
    var t = ctx ? ctx.currentTime : 0;
    try {
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), t);
      musicBus.gain.linearRampToValueAtTime(target, t + (glide || 0.08));
    } catch (e) {
      try { musicBus.gain.value = target; } catch (e2) { /* ignore */ }
    }
  }

  function pauseMusicScheduling() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    setMusicBus(0.0001, 0.05);
  }

  function resumeMusicScheduling() {
    if (!ctx || !musicOn || !audible() || musicTimer) return;
    setMusicBus(MUSIC_BUS_VOL, 0.15);
    nextNoteTime = ctx.currentTime + 0.06;
    scheduleMusic();
    musicTimer = setInterval(scheduleMusic, 120);
  }

  // ---------- 页面可见性 ----------
  function setMasterTarget(target) {
    if (!master || !ctx) return;
    try {
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(target, t + 0.04);
    } catch (e) { /* ignore */ }
  }

  function onVisibilityChange() {
    if (isHidden()) {
      setMasterTarget(0.0001);
      pauseMusicScheduling();
    } else {
      setMasterTarget(SFX.muted ? 0.0001 : MASTER_VOL);
      if (musicOn) resumeMusicScheduling();
    }
  }

  function bindVisibility() {
    if (visibilityBound) return;
    visibilityBound = true;
    try {
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
    } catch (e) { /* ignore */ }
  }

  // ---------- 上下文 / 恢复 ----------
  function ensureRunning() {
    if (!ctx) return;
    try {
      if (ctx.state !== 'running' && ctx.state !== 'closed' && typeof ctx.resume === 'function') {
        var p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(function () { /* 需用户手势，静默等待 */ });
      }
    } catch (e) { /* ignore */ }
  }

  function initContext() {
    if (ctx) { ensureRunning(); return ctx; }
    if (initTried) return null;
    initTried = true;
    if (!AC) return null; // 浏览器不支持 WebAudio：降级为静默
    try {
      ctx = new AC();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 20;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;

      master = ctx.createGain();
      master.gain.value = audible() ? MASTER_VOL : 0.0001;

      sfxBus = ctx.createGain();
      sfxBus.gain.value = SFX_BUS_VOL;

      musicBus = ctx.createGain();
      musicBus.gain.value = 0.0001;

      sfxBus.connect(master);
      musicBus.connect(master);
      master.connect(comp);
      comp.connect(ctx.destination);

      ensureRunning();
    } catch (e) {
      ctx = null;
      master = comp = sfxBus = musicBus = null;
    }
    return ctx;
  }

  // ---------- 单次播放的输出链（含声像） ----------
  function makeOutput(pan) {
    var out = ctx.createGain();
    out.gain.value = 1;
    var node = out;
    var panner = null;
    if (pan && Math.abs(pan) > 0.001) {
      try {
        if (typeof ctx.createStereoPanner === 'function') {
          panner = ctx.createStereoPanner();
          panner.pan.value = pan;
          out.connect(panner);
          node = panner;
        }
      } catch (e) { panner = null; }
    }
    node.connect(sfxBus);
    // 3 秒后断开这条临时链（声音本身最长约 1.2s，留足余量）
    try {
      setTimeout(function () {
        try { out.disconnect(); } catch (e) { /* ignore */ }
        if (panner) { try { panner.disconnect(); } catch (e2) { /* ignore */ } }
      }, 3000);
    } catch (e) { /* ignore */ }
    return out;
  }

  function throttled(name) {
    var t = nowMs();
    var last = lastPlayAt[name];
    if (typeof last === 'number' && t - last < THROTTLE_MS) return true;
    lastPlayAt[name] = t;
    return false;
  }

  // ---------- 离线渲染（供 tests/audio-check.mjs 验证真的出声） ----------
  function renderOffline(name, seconds) {
    var key = ALIASES[name] || name;
    var synth = SYNTHS[key];
    if (!synth) return Promise.reject(new Error('unknown sfx: ' + name));
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) return Promise.reject(new Error('OfflineAudioContext unavailable'));
    var dur = clamp(num(seconds, 1), 0.2, 4);
    try {
      var oc = new Offline(2, Math.ceil(44100 * dur), 44100);
      var out = oc.createGain();
      out.gain.value = 1;
      out.connect(oc.destination);
      synth(oc, out, 0, { vol: 1, rate: 1, pan: 0 });
      return oc.startRendering().then(function (buf) {
        var peak = 0;
        var sum = 0;
        var n = 0;
        for (var ch = 0; ch < buf.numberOfChannels; ch++) {
          var data = buf.getChannelData(ch);
          for (var i = 0; i < data.length; i++) {
            var a = data[i] < 0 ? -data[i] : data[i];
            if (a > peak) peak = a;
            sum += data[i] * data[i];
            n++;
          }
        }
        return {
          name: name,
          peak: peak,
          rms: Math.sqrt(sum / Math.max(1, n)),
          seconds: dur,
          sampleRate: buf.sampleRate,
          channels: buf.numberOfChannels
        };
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // ---------- 对外接口 ----------
  var SFX = {
    muted: false,
    ready: false,

    // 幂等；首次调用创建 AudioContext（suspended 时自动 resume）
    init: function () {
      bindVisibility();
      var c = initContext();
      this.ready = !!c;
      return c;
    },

    // opts: { vol: 0..1, rate: 0.7..1.4, pan: -1..1 }
    play: function (name, opts) {
      try {
        if (typeof name !== 'string' || !name) return false;
        var key = ALIASES[name] || name;
        var synth = SYNTHS[key];
        if (!synth) return false;             // 未知名字：静默忽略
        if (!audible()) return false;         // 静音 / 页面不可见：不出声
        if (!this.init()) return false;       // 无 WebAudio：降级静默
        ensureRunning();
        if (throttled(key)) return false;     // 同名高频触发限流
        if (activeVoices >= MAX_VOICES) return false;

        opts = opts || {};
        var o = {
          vol: clamp(num(opts.vol, 1), 0, 1),
          rate: clamp(num(opts.rate, 1), 0.7, 1.4),
          pan: clamp(num(opts.pan, 0), -1, 1)
        };
        var dest = makeOutput(o.pan);
        acceptedPlays++;
        synth(ctx, dest, ctx.currentTime + 0.005, o);
        return true;
      } catch (e) {
        return false; // 任何异常都不向页面抛出
      }
    },

    // 轻量循环 BGM（低音量，无缝调度）
    startMusic: function () {
      try {
        bindVisibility();
        musicOn = true;
        if (!audible()) return false;
        if (!this.init()) return false;
        ensureRunning();
        if (musicTimer) return true;
        setMusicBus(MUSIC_BUS_VOL, 0.2);
        nextNoteTime = ctx.currentTime + 0.08;
        scheduleMusic();
        musicTimer = setInterval(scheduleMusic, 120);
        return true;
      } catch (e) {
        return false;
      }
    },

    stopMusic: function () {
      try {
        musicOn = false;
        if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
        if (musicBus) setMusicBus(0.0001, 0.18);
      } catch (e) { /* ignore */ }
    },

    setMuted: function (v) {
      try {
        this.muted = !!v;
        if (master) setMasterTarget(this.muted ? 0.0001 : MASTER_VOL);
        if (this.muted) {
          pauseMusicScheduling();
        } else if (musicOn) {
          resumeMusicScheduling();
        }
      } catch (e) { /* ignore */ }
      return this.muted;
    },

    toggleMuted: function () {
      return this.setMuted(!this.muted);
    }
  };

  // 仅测试/调试用内部钩子（不属于契约接口，不影响正常使用）
  SFX._debug = {
    getContext: function () { return ctx; },
    voiceCount: function () { return activeVoices; },
    startedCount: function () { return startedVoices; },
    acceptedCount: function () { return acceptedPlays; },
    musicActive: function () { return musicOn; },
    musicBusy: function () { return !!musicTimer; },
    renderOffline: renderOffline,
    synthNames: function () {
      var names = Object.keys(SYNTHS);
      var aliases = Object.keys(ALIASES);
      return names.concat(aliases);
    }
  };

  window.SFX = SFX;
})();