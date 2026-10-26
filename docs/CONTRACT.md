# 植物大战僵尸 · 模块契约（唯一事实来源）

本文件规定各模块的接口、坐标系与视觉规范。改动接口必须先改本文件并通知队友。
所有模块是**经典脚本**（非 ES Module），通过 `<script>` 按顺序加载，挂载到 `window`。
禁止使用网络资源 / 外部图片 / 字体文件；所有图像用 Canvas 2D 矢量绘制，所有声音用 WebAudio 合成。

加载顺序（index.html 已固定）：
```
js/config.js → js/art.js → js/audio.js → js/game.js → js/hud.js → js/main.js
```

## 全局对象

```js
window.PVZ_CONFIG = { LAYOUT, PLANTS, ZOMBIES, WAVES, ... }  // 引擎写，art/audio 可读
window.ART = { ... }        // 美术模块（art.js）提供
window.SFX = { ... }        // 音频模块（audio.js）提供
window.PVZ = { game, ... }  // 运行期调试入口（game.js/main.js 提供，QA 使用）
```

---

## 1. LAYOUT（逻辑坐标系，1280 × 720）

```js
LAYOUT = {
  W: 1280, H: 720,
  lawn: { x: 200, y: 140, cell: 100, cols: 9, rows: 5 }, // 草坪 900×500
  topBarH: 140,
  seed: { x: 206, y: 26, w: 84, h: 96, gap: 8, count: 7 }, // 种子卡
  sunCounter: { x: 24, y: 26, w: 160, h: 96 },
  shovel: { x: 872, y: 26, w: 76, h: 96 },
  waveMeter: { x: 980, y: 30, w: 276, h: 52 }
}
```
- 草坪单元格 `(col,row)` 的中心 = `lawn.x + col*cell + cell/2`, `lawn.y + row*cell + cell/2`。
- 草坪底部（植物/僵尸脚底）= `lawn.y + (row+1)*cell`。
- 僵尸从右侧 `x = 1210` 进入，向左走；越过 `x < lawn.x - 70` 即判负（除非该行有割草机）。
- 割草机停在 `x = lawn.x - 60`，行中心 y。
- 画布整体按 `min(innerWidth/1280, innerHeight/720)` 等比缩放并居中，多余区域填黑。

**视觉分层**：房子/围栏/草坪背景 → 割草机 → 植物 → 僵尸（按 y 排序）→ 子弹 → 阳光/粒子 → 顶部 HUD → 覆盖层（开始/暂停/胜利/失败）。

---

## 2. 美术模块 ART（owner: art 队友，文件 js/art.js）

**通用规则**
1. 所有函数**内部**必须 `ctx.save() ... ctx.restore()`，不得残留变换、alpha、shadow、lineWidth、字体。
2. 原点 `(0,0)` = 物体**脚底中心**，物体在 `y ∈ [-h, 0]`，左右大致对称；引擎负责 translate/scale。
3. 只依赖 `(ctx, opts)`，不得读写游戏状态、不得创建 DOM、不得用随机数（用 `opts.t` 做确定性动画）。
4. 画风：卡通手绘、粗深色描边（`#2c2417`，lineWidth 3）、亮丽平涂 + 简单高光；参考《植物大战僵尸》的憨厚可爱感，**不要写实**。
5. 尺寸基准（scale=1）：植物高约 86–96px；僵尸高约 120–140px；割草机 76×54；阳光直径 76；豌豆直径 22。允许轻微溢出，但居中保持。
6. 所有美术必须在 `devicePixelRatio` 放大后仍清晰（纯矢量，无位图）。

### 2.1 背景

```js
ART.drawBackground(ctx, geom, t, scene)
// geom = { W, H, lawn:{x,y,cell,cols,rows}, topBarH }   (即 PVZ_CONFIG.LAYOUT)
// scene: 'day' | 'night'（本作只用 day；night 预留，可略）
```
绘制顺序建议：天空/远景渐变（左上暖阳）、左侧房屋（屋顶、墙、门、窗）、草坪（深浅交替的竖直条纹、边缘泥土/栅栏）、右侧远处树林/墓地门、以及草地上的小装饰（石子、花）。**不要**画顶部 HUD 面板（hud.js 负责），但可以画 HUD 下方的木纹底板？——不需要，HUD 自绘。
背景必须覆盖整个 1280×720，且草坪区域严格对齐 `geom.lawn`。

```js
ART.drawTopBar(ctx, geom, t)
// 顶部 HUD 的木质/做旧底板 + 边框，仅画装饰底，文字与卡片由 hud.js 绘制在之上。
```
建议：深棕木纹横板（y 8..132），带铆钉与阴影，给种子卡留出凹槽。

### 2.2 植物

```js
ART.drawPlant(ctx, type, opts)
// type: 'sunflower' | 'peashooter' | 'wallnut' | 'snowpea' | 'repeater' | 'cherrybomb' | 'potatomine'
// opts = {
//   t: 秒（全局时间，用于摇曳/呼吸动画）
//   scale: 默认 1
//   hpRatio: 0..1（植物受伤时逐渐枯萎/掉叶；wallnut 按血量裂纹，其余可做耷拉表情）
//   state: 'idle' | 'shoot'（开火瞬间，0.15s，豌豆射手张嘴/后坐） | 'armed' | 'explode'
//   age: 种下后秒数（<0.35s 播放弹出动画，可用 opts.pop 0..1 代替）
//   flash: 0..1（受击白闪，叠加白色高光）
//   facing: 1 默认朝右
// }
```
每个植物都是**一个完整卡通角色**（脸、眼睛、嘴、叶子/花盆底座），要有辨识度：
- sunflower：黄花瓣 + 橙心笑脸，左右两片绿叶。
- peashooter：绿色豆荚头 + 圆管炮口朝右，茎 + 两片叶。
- wallnut：褐色坚果、呆萌脸；hpRatio<0.66 出现裂纹，<0.33 更多裂纹+惊恐表情。
- snowpea：蓝白配色豌豆射手，炮口有雪花/冷气粒子（静态画即可）。
- repeater：深绿双管炮口，比 peashooter 更壮。
- cherrybomb：两颗红樱桃并排、引线、愤怒脸；state='explode' 时可膨胀发白。
- potatomine：土黄色土豆半埋土堆，未武装时只露土豆头（state='armed' 时露出红色指示灯/天线）。

### 2.3 僵尸

```js
ART.drawZombie(ctx, type, opts)
// type: 'basic' | 'cone' | 'bucket' | 'flag' | 'football'
// opts = {
//   t, scale, phase: 0..1 行走周期, state: 'walk' | 'eat' | 'die',
//   hpRatio: 0..1, flash: 0..1, slow: 0..1（蓝白冰冻叠色强度）
// }
```
- 统一灰绿肤色、破西装、领带、驼背、双臂前伸、摇晃步态（phase 驱动腿/臂/身体倾斜）。
- basic：秃头呆滞脸，缺牙。
- cone：头顶橙色路障；hpRatio<0.5 路障歪斜/破损。
- bucket：铁桶罩头，锈迹；低血量时桶凹陷。
- flag：手持破旗（旗上画个僵尸头/叶子）；跑动步态更大。
- football：橄榄球头盔+护肩，体型更壮，速度感。
- 'eat'：身体前倾、下巴开合、双臂抓挠；'die'：向后倒/瘫软、透明度下降（不要自己改 globalAlpha 之外留下状态）。
- 僵尸**面朝左**（向 -x 走），占领 x∈[-30,30]，高约 128。

### 2.4 其他精灵

```js
ART.drawSun(ctx, { t, r, glow })          // 原点中心，发光太阳，直径 2r（默认 r=38）；glow 0..1 可加光晕
ART.drawPea(ctx, { t, kind, r })          // kind: 'pea' | 'snow' | 'fire'；原点中心
ART.drawMower(ctx, { t, active, x })      // 原点脚底中心，宽 76 高 54；active 时轮子转动、冒火花
ART.drawShovel(ctx, { t, size })          // 原点中心，铁锹图标（种子栏用）
ART.drawExplosion(ctx, { t, age, r })     // 原点中心，age 0..1 的爆炸烟雾/火球（cherrybomb / 地雷）
ART.drawSplat(ctx, { t, age, kind })      // 原点中心，kind:'pea'|'snow'；击中溅射
ART.drawZombieHead(ctx, { t })            // 原点中心，掉落的僵尸头（可选装饰）
```

### 2.5 预览页（交付物）

`tests/art-gallery.html`：独立页面，按网格画出全部植物（各状态）、全部僵尸（walk/eat/die）、阳光、豌豆、割草机、铁锹、爆炸、背景。用于队友自查截图。
可用 puppeteer 截图到 `shots/art-*.png`，确认无报错、无越界、辨识度好。

---

## 3. 音频模块 SFX（owner: audio 队友，文件 js/audio.js）

纯 WebAudio 合成，**零外部音频文件**。

```js
SFX.init()                    // 幂等；在首次用户手势时调用，内部创建 AudioContext（可延迟到 play）
SFX.play(name, opts = {})     // opts: { vol: 0..1, rate: 0.7..1.4, pan: -1..1 }
SFX.startMusic()              // 轻松诡异的小循环 BGM（可合成，音量低）
SFX.stopMusic()
SFX.setMuted(bool) / SFX.toggleMuted() -> bool / SFX.muted
```
必须实现的音效名（`play` 不认识的名字应静默忽略，不抛错）：
`click, seedSelect, error, plant, shoot, snowShoot, hitFlesh, hitArmor, sunSpawn, sunCollect, chomp, zombieGroan, zombieDie, explode, mower, shovel, waveHorn, win, lose`

要求：
- 每种音效有辨识度（射豌豆“啵”、冰冻“咻”、吃植物“咔嚓”、爆炸低频轰、割草机引擎、僵尸低吼），音量克制，不刺耳。
- 同名音效高频触发时要有防爆音/限流（例如炮击 ≤ 12 次/秒，避免叠爆）。
- 页面不可见或静音时不要出声；`AudioContext.state === 'suspended'` 时自动 resume。
- 不得产生未捕获异常；浏览器不支持 WebAudio 时降级为静默。
- 自查：`tests/audio-check.mjs` 用 puppeteer 打开页面，调用每个音效并检查 `pageerror`/console error 为空；可用 OfflineAudioContext 渲染一个音效验证非静音（可选）。

---

## 4. 引擎与 UI（owner: Lead，文件 js/config.js / js/game.js / js/hud.js / js/main.js）

公开调试接口（QA 依赖，必须保持稳定）：

```js
window.PVZ = {
  game,                                  // Game 实例
  ready,                                 // 资源/首帧就绪
  start(),                               // 从开始界面进入游戏
  addSun(n),
  spawn(type, row),                      // 立即生成僵尸
  setTimeScale(s),                       // 1 / 2 / 4 / 8
  gameState(),                           // { state, sun, waves, killed, plants, zombies, ... }
}
window.PVZ.game = {
  state, sun, waveIndex, totalWaves, time, plants, zombies, suns, projectiles, mowers,
  grid,                                  // 二维数组，grid[row][col] = plant|null
  plant(col,row,type), removePlant(col,row), spawnZombie(type,row), startWave(i),
  update(dt), draw(ctx), reset()
}
```
游戏状态：`'menu' | 'playing' | 'paused' | 'won' | 'lost'`。

---

## 5. 协作与写作用域

| 文件 | 负责人 |
|---|---|
| js/art.js, tests/art-gallery.html | art 队友 |
| js/audio.js, tests/audio-check.mjs | audio 队友 |
| js/config.js, js/game.js, js/hud.js, js/main.js, index.html, style.css, server.mjs | Lead |
| tests/qa-*.mjs（除 art/audio 自查文件）、shots/game-*.png、QA-REPORT.md | QA 队友 |

禁止跨域改文件；需要改别人文件时先在团队消息里说明。所有文件使用 UTF-8，注释与文案简体中文。