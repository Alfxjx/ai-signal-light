# 桌面宠物功能（支持 Codex 宠物素材导入 + 点击打开 Kimi Web）

## 目标

在 AI状态监控（Electron）里新增**桌面宠物**，对标参考项目 `bfjnbvf/kimi-code-monitor` 的通用 Codex 桌面宠物：

1. **导入方式完全一致**：从宠物画廊（codexpet.top / petdex.dev / awesome-codex-pet）复制安装命令，粘贴即可安装，零转换直接用官方素材。
2. **替代悬浮球的显示**（经用户确认：悬浮球与宠物**独立开关**，可共存）。
3. **点击打开本地 Kimi Code Web**：单击宠物 → 默认浏览器打开 `http://127.0.0.1:<port>`；已打开时浏览器按相同 URL 自动聚焦已有标签页，不重复开新标签。
4. 交互（经用户确认）：
   - 左键**单击** → 打开 Kimi Web
   - 左键**长按**（约 600ms）→ 弹出原下拉窗口（最近项目 + Kimi 用量，复用现有 Dropdown）
   - **右键** → 原生菜单：打开 Kimi Web / 打开设置 / 隐藏宠物
   - **拖拽**移动宠物，位置持久化
5. 宠物动画跟随 Kimi 聚合状态：thinking/editing→`running`、approval→`waiting`、idle→`idle`、offline→`failed`（灰显定格），busy→idle 播一遍 `review`。

## 参考实现要点（已读源码 /tmp/kimi-code-monitor-ref）

- `src/pet/install.js`：`parseInput`（三种画廊格式）+ `fetchPet`（下载 pet.json + spritesheet.webp）+ 安全 unzip + 图集尺寸校验（宽必须 1536 = 192×8 列，高为 208 整数倍且 ≥ 9 行）。
- `src/pet/sprites.js`：`CodexRoamPet.create` —— 单 div + `background-position` 逐帧播放，无 canvas；9 行动作表：idle/running-right/running-left/waving/jumping/failed/waiting/running/review；状态映射 idle→idle、thinking/executing/replying/subagent→running、ratelimit/offline/unauthorized→failed（灰显定格）；hover 停留起跳、拖拽方向动画；`prefers-reduced-motion` 静态。
- `src/pet/store.js`：IndexedDB 素材库（扩展专用）。Electron 里改为**主进程磁盘存储**。
- 画廊命令三种：awesome-codex-pet slug（`<pet-slug>--<author-slug>`，默认 rawBase 可带 `--raw-base`）、codex-pets.net zip URL、petdex.dev install URL/命令。

## 设计决策

1. **素材存储在主进程**：`userData/pets/<id>.json`（整条记录含 base64 dataUrl + name/author/source/addedAt），原子写。新增 `src/main/pet-store.ts`。活动宠物 id 存 `config.pet.activePetId`。
2. **安装下载/解析放渲染层（Settings 窗口）**：浏览器 `fetch` / `DecompressionStream` / `Image` 校验图集尺寸，天然可用，避免 Node 端写 WebP 头解析。Settings 里 `fetchPet` 拿到 dataUrl 后经 IPC `pet:install` 交给主进程持久化并设为活动。
3. **宠物窗口 = 独立 BrowserWindow**：透明、无边框、置顶、`focusable:false`、自绘拖动（复用悬浮球模式），尺寸 = `192×scale/100 × 208×scale/100`。新增 renderer 入口 `pet.html` + `PetView.vue`。
4. **打开 Kimi Web 去重**：`KimiMonitor` 新增 `getWebUrl(): string | null`（`http://127.0.0.1:<port>`，port 是 `~/.kimi-code/server/instances/*.json` 自报或探测到的）。单击 → `shell.openExternal(url)`。Chrome/Edge/Firefox 对**完全相同的 URL** 打开时会聚焦已有标签页而非新开标签，即"已打开不重复开、浏览器显示出来"。服务不可达（port 为 null）→ 系统通知提示，不打开。
5. **状态映射**（KimiAggregateState → 宠物动作）：
   | Kimi 状态 | 宠物动作 |
   |---|---|
   | offline | failed（灰显定格） |
   | approval | waiting |
   | editing | running |
   | thinking | running |
   | idle | idle |
   | busy→idle | 播一遍 review 回 idle |
6. **下拉窗口复用**：`positionFloatingBallDropdown`/`toggleFloatingBallDropdown` 泛化为可传锚点窗口（默认悬浮球；宠物长按传宠物窗口）。Dropdown.vue 及其 `floatingBall.toggleDropdown()` 关闭逻辑不变（共用一个共享下拉窗口）。
7. **v2 环视（rows 9-10 转头）暂不做**：需要主进程全局光标轮询，属增强项，记为后续；v1/v2 图集都能正常播放核心动作。

## 改动清单

### A. shared 类型与通道

- `src/shared/types/config.ts`：新增
  ```ts
  export interface PetConfig {
    enabled: boolean;          // 桌面宠物开关（独立于悬浮球）
    activePetId: string | null;
    scale: number;             // 显示缩放 %（50–150，默认 100）
    x: number | null; y: number | null;
    isVisible: boolean;
  }
  ```
  `AppConfig` 加 `pet: PetConfig`；`ConfigPartial` 加 `pet?: Partial<PetConfig>`。
- `src/shared/types/ipc.ts`：
  - 新增类型 `PetMeta { id; name; author; source; addedAt }`、`PetRecord extends PetMeta { dataUrl }`、`PetInstallInput { name; author; source; dataUrl }`、`PetGetResult { pet: PetRecord | null; scale: number }`、`PetOpenWebResult { ok; error?; url? }`。
  - `ElectronAPI` 加 `pet` 命名空间：`get/list/install/setActive/remove/toggle/openWeb/toggleDropdown/moveBy/showMenu/setScale/onChanged`。
  - `IPC_CHANNELS` 加：`PET_GET / PET_LIST / PET_INSTALL / PET_SET_ACTIVE / PET_REMOVE / PET_TOGGLE / PET_OPEN_WEB / PET_TOGGLE_DROPDOWN / PET_MOVE / PET_SHOW_MENU / PET_SET_SCALE / PET_CHANGED`。
  - `SettingsPayload`/`SettingsSavePayload` 加 `pet: { enabled: boolean }`。

### B. 主进程

- `src/main/config.ts`：`DEFAULTS` 加 `pet: { enabled:false, activePetId:null, scale:100, x:null, y:null, isVisible:false }`；`_load` 合并 pet 各字段；`update` 加 pet 分支（enabled 布尔、activePetId string|null、scale 钳到 50–150、x/y finite|null、isVisible 布尔）。
- `src/main/pet-store.ts`（新）：`PetStore` 类 —— 构造收 pets 目录；`list()` / `get(id)` / `add(input)` / `remove(id)` / `setActive 由调用方写 config`；`<id>.json.tmp` + rename 原子写；id = `pet-<ts36>-<rand>`。
- `src/main/kimi-monitor.ts`：加 `getWebUrl(): string | null`（返回 `this.port ? 'http://127.0.0.1:' + this.port : null`）。
- `src/main/main.ts`：
  - 宠物窗口：`createPetWindow()`（尺寸随 scale；位置用 `isRectVisible` 校验 + 光标屏右下角兜底；加载 `${RENDERER_BASE}/pet.html`；`moved` debounce 400ms 存 `config.pet.x/y`；close preventDefault 隐藏）、`togglePet()`、`hidePet()`、`syncPetFromConfig()`（enabled && isVisible && 有 activePetId 才显示）；`app.whenReady` 里恢复。
  - IPC handlers：`PET_GET`（PetStore.get(activePetId)+scale）、`PET_LIST`、`PET_INSTALL`（store.add + update activePetId + 通知宠物窗口 + sync）、`PET_SET_ACTIVE`、`PET_REMOVE`（删活动宠物则回退到第一只或空）、`PET_TOGGLE`、`PET_OPEN_WEB`、`PET_TOGGLE_DROPDOWN`（锚定宠物窗口）、`PET_MOVE`（同悬浮球增量移动）、`PET_SET_SCALE`（update + 重设窗口 bounds + 通知）、`PET_CHANGED` 事件推给宠物窗口 webContents。
  - `showPetMenu()`：`Menu.buildFromTemplate([{打开 Kimi Web},{打开设置},{隐藏宠物}])`，`Menu.popup({ window: petWindow, x: cursor.x, y: cursor.y })`（`screen.getCursorScreenPoint()`）。
  - `openPetWeb()`：`url = kimiMonitor?.getWebUrl()`；null → `new Notification` 提示"Kimi Code Web 服务未启动"；否则 `await shell.openExternal(url)`。
  - 下拉锚点泛化：`positionFloatingBallDropdown(anchor?: BrowserWindow)` / `toggleFloatingBallDropdown(anchor?)`，默认用悬浮球窗口。
- `src/main/preload.ts`：暴露 `pet` 命名空间 + `onPetChanged`（ipcRenderer.on PET_CHANGED）。

### C. 渲染进程

- `src/renderer/src/pet/pet-sprites.ts`（新，port sprites.js→TS）：导出 `createPet(opts: { imageUrl; scale?; onPositionChange?; zIndex? }) => Promise<{ el; setStatus; destroy }>` 与 `PET_STATES`。含：idle/running-left/running-right/waving/jumping/failed/waiting/running/review 九行；hover 停留 300ms 起跳（4s 冷却）；拖拽方向动画（左右→running-*，上→waving，下→jumping，12px 磁滞）；failed 灰显定格（`codex-roam-pet-dim`）；`prefers-reduced-motion` 静态首帧。**不做环视**。
- `src/renderer/src/pet/pet-install.ts`（新，port install.js→TS）：`parseInput` / `parsePetdexScript` / `unzip`（安全 zip，限制 32MB 总/16MB 单文件、拒绝 `..`/绝对/空字节路径）/ `fetchBytes` / `fetchPet`（下载 pet.json + spritesheet.webp → `Image` 校验尺寸 1536 宽 ×208 整数倍高 ≥9 行 → 返回 `{ dataUrl, info }`）。
- `src/renderer/src/pet/pet-install.test.ts`（新）：镜像参考 `tests/pet-install.test.js`（parseInput 三种格式、parsePetdexScript 提取/报错、unzip 解压与安全校验），Vitest node 环境。
- `src/renderer/src/PetView.vue`（新）：`pet.get()` 加载活动宠物 → `createPet` 渲染；`useUsageState()` 的 `kimiState` → 映射 → `pet.setStatus`；监听 `pet.onChanged` 重建播放器；三态交互（mousedown 记录 + 600ms 长按 timer；移动超 4px 取消长按转 `moveBy` 拖动；mouseup 未移动且 <600ms → `pet.openWeb()`；`@contextmenu.prevent` → `pet.showMenu()`）。未装宠物时显示占位提示。
- `src/renderer/src/pet.ts` + `pet.html` + `pet.css`（新入口，样式含 `.codex-roam-pet` 类 + 灰显类）。
- `src/renderer/src/Settings.vue`：新增"桌面宠物" section —— 开关 `pet.enabled`；素材库列表（名称 by 作者 + 当前/切换/移除）；安装区（"＋ 安装新宠物"展开输入框 → 粘贴命令 → 安装按钮 → `pet.install`，状态文案：下载中…/安装成功，已切换/失败原因）；大小控制（− / 重置 / +，步进 10%，50–150%，调 `pet.setScale` 即时生效）；说明 hint（从 codexpet.top / petdex.dev 复制命令；单击开 Kimi Web、长按看用量、右键菜单）。`getSettings`/`onSave` 带上 `pet.enabled`。
- `vite.config.ts`：`rollupOptions.input` 加 `pet: resolve(RENDERER_SRC, 'pet.html')`。

### D. 测试与验证

- 新增 `pet-install.test.ts`（C）、可选 `src/main/pet-store.test.ts`（临时目录测 add/list/get/remove/原子写）。
- `npm test` 全绿；`npm run typecheck` 通过。
- `npm run dev` 手工验证（见验收清单）。
- 按 AGENTS.md 约定，把本计划另存到 `AI代码/徐剑祥/`（实施第一步完成）。

## 验收清单

- [ ] 设置开启"桌面宠物"，粘贴画廊命令安装成功后宠物窗口出现并播放 idle。
- [ ] Kimi 思考/编辑时宠物跑动动画（running），待审核时 waiting，空闲 idle，离线灰显定格。
- [ ] 拖拽宠物移动，重启应用位置保留（config.pet.x/y）。
- [ ] 单击宠物 → 默认浏览器打开 Kimi Web（127.0.0.1:<port>）；再次单击不重复开新标签、聚焦已有标签；服务未启动时系统通知。
- [ ] 左键长按弹出原下拉（最近项目 + Kimi 用量）；右键弹菜单（打开 Kimi Web/打开设置/隐藏宠物）。
- [ ] 悬浮球与宠物可同时开启、互不影响。
- [ ] 多只宠物可收藏/一键切换/移除；删活动宠物回退到剩余第一只。
- [ ] `npm run build` 打包后（portable exe）宠物功能正常（素材落在 userData/pets/）。

## 预估人日

纯人工开发约 **6.5 人日**（素材导入与安全 unzip 1.5 + 播放器与交互 1.5 + Electron 窗口/拖拽/右键 1 + 设置 UI 与 config/IPC 1 + 打开 Kimi Web 与去重 0.5 + 测试回归打包 1）。AI 协同后预计 **1 天内完成**，节约约 **5.5 人日**。
