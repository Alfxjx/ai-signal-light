# desktop-pet

## 改动摘要
新增**桌面宠物**功能（对标 `bfjnbvf/kimi-code-monitor` 的通用 Codex 桌面宠物），与悬浮球**独立开关、可共存**：
- **素材导入与参考项目完全一致**：粘贴画廊安装命令（awesome-codex-pet slug / codex-pets.net zip / petdex.dev），只下载 `pet.json` + `spritesheet.webp`，安全 unzip，`Image` 校验图集尺寸（1536 宽 × 208 整数倍高 ≥9 行），不执行任何脚本
- **宠物窗口**：透明、无边框、置顶、`focusable:false`，尺寸 = `192×scale/100 × 208×scale/100`；自绘拖动，位置持久化到 `config.pet.x/y`
- **交互**：左键单击 → 打开本地 Kimi Code Web（`http://127.0.0.1:<port>`，浏览器对相同 URL 自动聚焦已有标签，不重复开新标签；服务未启动弹系统通知）；左键长按 600ms → 弹原下拉窗口（复用现有 Dropdown，锚定宠物）；右键 → 原生菜单（打开 Kimi Web / 打开设置 / 隐藏宠物）；拖拽移动
- **动画**：播放器按官方 Codex 图集 9 行动作表（idle/running-*/waving/jumping/failed/waiting/running/review）逐帧播放，跟随 Kimi 聚合状态：thinking/editing→running、approval→waiting、idle→idle、offline→failed（灰显定格），busy→idle 播一遍 review
- 设置新增「桌面宠物」section：开关、素材库（当前/切换/移除）、安装输入、大小 −/重置/＋（50–150% 即时生效）

## 改动文件

### 新增
- **`src/main/pet-store.ts`** — 主进程磁盘素材库（`userData/pets/<id>.json`，原子写），`list/get/add/remove`；非法 id 直接忽略防路径注入
- **`src/main/pet-store.test.ts`** — Vitest：add/get/list/remove/排序/坏文件/空素材/非法 id
- **`src/renderer/src/pet/pet-install.ts`** — port `install.js`：`parseInput`（三种画廊）/`parsePetdexScript`/`unzip`（安全 zip，32MB 总/16MB 单文件、拒 `..`/绝对/空字节路径）/`fetchPet`（下载 + `Image` 校验尺寸 → base64 dataUrl）
- **`src/renderer/src/pet/pet-install.test.ts`** — 镜像参考 `tests/pet-install.test.js`（14 例）
- **`src/renderer/src/pet/pet-sprites.ts`** — 播放器（port `sprites.js`，去掉页面内定位/环视）：`createPet` 返回 `{ el, setStatus, setDragging, dragDirection, onDragMove, playChain, destroy }`
- **`src/renderer/src/PetView.vue`** — 宠物窗口组件：加载活动宠物→播放器；`useUsageState().kimiState` 驱动 `setStatus`；三态交互（单击/长按/拖动）+ 右键；监听 `pet.onChanged` 重建；占位提示点击进设置
- **`src/renderer/src/pet.ts` / `pet.html` / `pet.css`** — 宠物窗口入口（viewport `device-width`，CSS px = 窗口 px）

### 改动
- **`src/shared/types/config.ts`** — 新增 `PetConfig { enabled, activePetId, scale, x, y, isVisible }`，`AppConfig.pet` + `ConfigPartial.pet`
- **`src/shared/types/ipc.ts`** — 新增 `PetMeta/PetRecord/PetInstallInput/PetGetResult/PetOpenWebResult`；`ElectronAPI.pet` 命名空间（get/list/install/setActive/remove/toggle/openWeb/toggleDropdown/moveBy/showMenu/setScale/onChanged）；`IPC_CHANNELS` 加 12 个 `PET_*`；`SettingsPayload/SavePayload` 加 `pet.enabled`
- **`src/main/config.ts`** — `DEFAULTS.pet`、`_load` 合并（enabled/activePetId/scale 50-150/x/y/isVisible）、`update` pet 分支
- **`src/main/kimi-monitor.ts`** — 新增 `getWebUrl(): string | null`（`http://127.0.0.1:<port>`）
- **`src/main/main.ts`** — 新增 `petWindow`/`petStore`；`createPetWindow/togglePet/hidePet/syncPetFromConfig/notifyPetChanged/openPetWeb/showPetMenu`；`PET_*` IPC handlers（install/setActive/remove 后 sync+notify；setScale 重设窗口 bounds）；`positionFloatingBallDropdown/toggleFloatingBallDropdown` 泛化锚点（默认悬浮球，宠物长按传 petWindow）；`whenReady` 恢复 + 托盘菜单加「显示/隐藏宠物」；`SETTINGS_GET/SAVE` 带 `pet.enabled`
- **`src/main/preload.ts`** — 暴露 `pet` 命名空间 + `pet.onChanged`
- **`src/renderer/src/types/electron.d.ts`** — 再导出 pet 类型
- **`src/renderer/src/Settings.vue`** — 「桌面宠物」section（开关/素材库/安装/大小）
- **`src/renderer/src/styles/settings.css`** — `.pet-row/.pet-name/.pet-badge/.btn-tiny/.settings-spacer`
- **`vite.config.ts`** — `rollupOptions.input` 加 `pet: pet.html`

## 影响范围
- **功能新增**：独立于悬浮球的新窗口；不破坏悬浮球/下拉/托盘现有行为（下拉锚点泛化，默认仍锚悬浮球）
- **IPC 新增 12 条**：`pet:*`（invoke × 10 + send × 1 + event × 1），另有 1 条 `pet:changed` 主进程→宠物窗口
- **依赖**：零新增（zip 用 `DecompressionStream`，播放用 CSS background-position）
- **状态**：`KimiStatus` 不含 URL，靠 `KimiMonitor.getWebUrl()` 取端口拼 URL
- **未做**：v2 图集环视（rows 9-10 转头）需主进程全局光标轮询，留待后续

## 自测
- ✅ `npm run typecheck` 通过（vue-tsc + tsc -p tsconfig.main.json --noEmit）
- ✅ `npm test` 111 通过（含新增 pet-install 14 例 + pet-store 5 例）
- ✅ `npm run build:main` / `npm run build:renderer` 通过，`pet.html` + `pet-*.js/css` 正常产出
- ✅ `npm run build`（electron-builder portable exe）打包成功
- ⏸ 端到端（安装画廊宠物/点击开 Kimi Web/长按下拉/右键菜单）需在用户桌面跑 `npm run dev` 手工验证（无法在本会话 GUI 内自动断言）

## 不需要改
- `server.ts`（Kimi 状态仍走 WS，宠物窗口复用 `useUsageState`）
- `useWebSocket.ts`（无新需求）
- electron-builder `files`（`dist/main/**`、`dist/renderer/**` 自动覆盖新产物）
