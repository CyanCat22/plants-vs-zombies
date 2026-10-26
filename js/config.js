/* 植物大战僵尸 · 配置与数值表
 * 纯数据模块，不依赖 DOM。所有坐标基于 1280×720 逻辑画布。
 */
(function () {
  'use strict';

  const LAYOUT = {
    W: 1280,
    H: 720,
    topBarH: 140,
    lawn: { x: 200, y: 140, cell: 100, cols: 9, rows: 5 },
    seed: { x: 206, y: 26, w: 84, h: 96, gap: 8, count: 7 },
    sunCounter: { x: 24, y: 26, w: 160, h: 96 },
    shovel: { x: 872, y: 26, w: 76, h: 96 },
    waveMeter: { x: 980, y: 30, w: 276, h: 52 },
    mowerX: 140,
    zombieSpawnX: 1218,
    loseX: 118
  };

  const PLANTS = {
    sunflower: {
      name: '向日葵',
      cost: 50,
      hp: 300,
      cooldown: 5,
      kind: 'producer',
      sunEvery: 23,
      firstSun: 6.5,
      desc: '产阳光，经济核心'
    },
    peashooter: {
      name: '豌豆射手',
      cost: 100,
      hp: 300,
      cooldown: 5,
      kind: 'shooter',
      damage: 20,
      interval: 1.4,
      speed: 380,
      desc: '本行基础输出'
    },
    wallnut: {
      name: '坚果墙',
      cost: 50,
      hp: 4000,
      cooldown: 20,
      kind: 'wall',
      desc: '厚血肉盾，拖延时间'
    },
    snowpea: {
      name: '寒冰射手',
      cost: 175,
      hp: 300,
      cooldown: 8,
      kind: 'shooter',
      damage: 20,
      interval: 1.5,
      speed: 380,
      slow: 3.2,
      desc: '冰豌豆减速僵尸'
    },
    repeater: {
      name: '双发射手',
      cost: 200,
      hp: 300,
      cooldown: 8,
      kind: 'shooter',
      damage: 20,
      interval: 1.45,
      speed: 400,
      double: true,
      desc: '一次两颗豌豆'
    },
    cherrybomb: {
      name: '樱桃炸弹',
      cost: 150,
      hp: 9999,
      cooldown: 35,
      kind: 'bomb',
      fuse: 1.15,
      damage: 1800,
      radius: 150,
      desc: '炸飞周围一圈僵尸'
    },
    potatomine: {
      name: '土豆地雷',
      cost: 25,
      hp: 300,
      cooldown: 25,
      kind: 'mine',
      armTime: 11,
      damage: 1800,
      radius: 62,
      desc: '埋伏后踩中即爆'
    }
  };

  const CARD_ORDER = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'repeater', 'cherrybomb', 'potatomine'];

  const ZOMBIES = {
    basic: { name: '普通僵尸', hp: 200, speed: 26, eatDps: 80, score: 10 },
    cone: { name: '路障僵尸', hp: 560, speed: 24, eatDps: 80, score: 20, armorAt: 360 },
    bucket: { name: '铁桶僵尸', hp: 1100, speed: 21, eatDps: 80, score: 35, armorAt: 800 },
    flag: { name: '旗帜僵尸', hp: 250, speed: 44, eatDps: 80, score: 15 },
    football: { name: '橄榄球僵尸', hp: 1400, speed: 52, eatDps: 110, score: 50, armorAt: 900 }
  };

  // 每一波的僵尸配额；引擎会把它们均匀撒在 dur 秒内。
  const WAVES = [
    { dur: 22, gap: 12, pool: { basic: 3 } },
    { dur: 24, gap: 12, pool: { basic: 4, cone: 1 } },
    { dur: 26, gap: 12, pool: { basic: 4, cone: 2 } },
    { dur: 28, gap: 14, pool: { basic: 4, cone: 2, bucket: 1 } },
    { dur: 30, gap: 14, banner: '一大波僵尸正在接近！', pool: { basic: 6, cone: 3, bucket: 2, flag: 1 } },
    { dur: 28, gap: 14, pool: { basic: 5, cone: 3, bucket: 2, football: 1 } },
    { dur: 30, gap: 14, pool: { basic: 5, cone: 3, bucket: 2, football: 1 } },
    { dur: 32, gap: 14, pool: { basic: 5, cone: 3, bucket: 3, football: 2 } },
    { dur: 34, gap: 16, pool: { basic: 6, cone: 4, bucket: 3, football: 2 } },
    { dur: 38, gap: 0, final: true, banner: '最后一波！守住草坪！', pool: { basic: 8, cone: 5, bucket: 4, football: 3, flag: 1 } }
  ];

  const TUNING = {
    startSun: 150,
    sunValue: 25,
    maxSun: 9999,
    skySunFirst: 6,
    skySunEvery: [8, 12],
    zombieBiteEvery: 0.45,
    plantPopTime: 0.32,
    zombieDeathTime: 0.9,
    sunLife: 13,
    sunFallSpeed: 46,
    mowerSpeed: 620,
    mowerDamage: 9999,
    flagHpBonus: 0
  };

  window.PVZ_CONFIG = { LAYOUT, PLANTS, CARD_ORDER, ZOMBIES, WAVES, TUNING };
})();