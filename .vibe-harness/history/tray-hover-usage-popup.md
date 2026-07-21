# tray-hover-usage-popup

## 改动摘要
鼠标 hover 在系统托盘图标上时，在托盘旁边弹出一个"简易用量"悬浮层（**单列分段布局**）：
- **顶部**：用量速览 + X 分钟前
- **每家一段**：provider 名称作小节标题，下方缩进列出 `5h` / `week` / `premium` / primary window / `余额` 等可用数据
- 每行结构 `<tag> <pct>% (<reset>)`（DeepSeek 余额例外：`余额 ¥XX.XX`）
- 百分比按 `barLevel` 三档着色（绿/黄/红/灰），reset 时间小号灰色右对齐

鼠标离开托盘/弹窗后自动关闭。复用已有的 WS 推送链路和 `useUsageState`，主进程无需新增用量数据通道。

## 改动文件

### 新增
- **`src/renderer/src/tray-hover.html`** — Vue 入口（`width=220` viewport）
- **`src/renderer/src/tray-hover.ts`** — Vue 启动
- **`src/renderer/src/TrayHover.vue`** — 弹窗 UI：顶部"用量速览 + X 分钟前"。**单列分段**布局：每个 provider 一个 `.th-section`，含 `.th-section-name` 小节标题 + 1~2 行 `.th-row`（缩进 12px，结构 `tag + pct + reset`）；DeepSeek 余额行用 `.th-balance` 单独样式。`document.mouseenter/mouseleave` → 通过 `window.electronAPI.trayHover.pointer(inside)` 回报主进程
- **`src/renderer/src/styles/tray-hover.css`** — 200px 宽毛玻璃卡片；单列布局：`.th-list` 纵向 8px gap，`.th-section` 内 `th-section-name`（12px 加粗白）+ 子行（11px 缩进 12px）。行内 `tag`(9px 灰大写) + `pct`(按 level 着色加粗) + `reset`(10px 灰右对齐括号包裹)

### 改动
- **`src/main/main.ts`**：
  - 新增全局状态 `trayHoverWindow` / `trayHoverShowTimer` / `trayHoverHideTimer` / `pointerInsideTray` / `pointerInsideHover` / **`lastHoverCursor`**（鼠标进入托盘瞬间捕获的坐标，作为 popup 定位锚点），常量 `TRAY_HOVER_SHOW_DELAY_MS = 180` / `TRAY_HOVER_HIDE_DELAY_MS = 280`
  - 常量 `TH_WIDTH = 200` / `TH_HEIGHT = 260`（紧贴侧面的窄高弹窗）
  - 新增 `createTrayHoverWindow()`：lazy 创建，参数与悬浮球类似（frameless、transparent、`focusable: false`、`skipTaskbar: true`、`alwaysOnTop: true`、`hasShadow: false`、`setVisibleOnAllWorkspaces`），但**不挂 `preload` 之外的任何业务事件**。**dev 模式下自动 `openDevTools({ mode: 'detach' })`** 打开独立 devtools 窗口 + `positionTrayHover()` + `show()` 自动显示，方便调试；同时排 200ms / 800ms 两次重定位，规避 tray 刚构造时 `getBounds()` 返回 0,0,0,0 的情况
  - 新增 `positionTrayHover()`：**基于鼠标 cursor 定位**（不依赖 `tray.getBounds()`）：
    - 锚点 = `lastHoverCursor`（mouse-enter 瞬间捕获），兜底用 `screen.getCursorScreenPoint()`
    - X：cursor 在屏右半 → popup 放 cursor 左侧 4px；否则右侧 4px；任一边越界 → 翻向另一边；最后 clamp 到 wa
    - Y：popup 竖直居中于 cursor（popup.top = cursor.y - TH_HEIGHT/2）；顶部越界 clamp 到 wa.top；底部**允许延伸到 taskbar 上方**（alwaysOnTop 保证可见），不 clamp 底部
    - 含 `console.log('[tray-hover] position:', { cursor, x, y, wa, iconBounds })` 便于排查
  - 新增 `scheduleShowTrayHover()` / `scheduleHideTrayHover()` / `clearTrayHoverTimers()`：debounced show/hide
  - 新增 `ipcMain.on(IPC_CHANNELS.TRAY_HOVER_POINTER, ...)`：根据弹窗回报的 inside 状态决定是否取消隐藏 timer
  - `createTray()` 注册 `tray.on('mouse-enter')` / `tray.on('mouse-leave')`：enter 时**捕获 cursor 到 `lastHoverCursor`**、取消 hide、排队 show；leave 时清 `pointerInsideTray`，根据 pointer 状态决定是否真关
  - `before-quit` 增加清理：清 timer、destroy window
- **`src/main/preload.ts`** + **`src/shared/types/ipc.ts`**：
  - 新增 IPC 通道常量 `TRAY_HOVER_POINTER = 'tray-hover:pointer'`
  - `ElectronAPI` 新增 `trayHover.pointer(inside: boolean): void`（单向 send，非 invoke）
  - preload 暴露 `window.electronAPI.trayHover.pointer`
- **`src/renderer/src/composables/useUsageState.ts`**：
  - 新增 `kimiWeekly` computed（基于 Kimi 的 `codingWeekly` UsageMetric，与 5h 槽同语义），导出供 TrayHover 渲染 week 网格
  - 返回值新增 `kimiWeekly` / `codex` / `lastUpdatedTs`（5 个 provider 的 `lastUpdated` 取最大时间戳）和原始 `deepseek` ref；新增 `codex` 原始 ref 用于计算 Codex primary window 的 windowSeconds
- **`vite.config.ts`**：`rollupOptions.input` 新增 `'tray-hover': resolve(RENDERER_SRC, 'tray-hover.html')`

## 影响范围
- **功能新增**：仅在托盘图标 hover 时弹窗；不破坏现有托盘右键菜单、左键切换主窗口、`setToolTip('AI助手状态监控')` 行为
- **IPC 新增 1 条**：`tray-hover:pointer`（renderer → main，单向 send），主进程侧 `ipcMain.on`
- **WS 复用**：弹窗接 `ws://127.0.0.1:3456` 同一端口，与悬浮球 / 主窗口共享推送，不增加服务器压力
- **样式增量**：独立的 `tray-hover.css`，不污染 `floating-ball.css` / `main.css`
- **不动的文件**：`server.ts` / `useWebSocket.ts` / `App.vue` / `Settings.vue` / `ClaudeCard.vue` / `UsageCard.vue` 等

## 自测
- ✅ `npm run typecheck` 通过（vue-tsc + tsc-p tsconfig.main.json 均无报错）
- ✅ `npm run build:main` 通过
- ✅ `npx vite build` 通过，`tray-hover.html` + `tray-hover-*.js/.css` 三个产物正确产出
- ⏸ `npm test` 启动期 `ERR_REQUIRE_ESM`（vitest 加载 std-env ESM 失败）：与本次改动**无关**——已用 `git stash` 暂存我的所有改动后，在干净 `main` 分支上复现到完全相同的报错；属于仓库当前环境的预存在问题
- 端到端行为：手动跑 `npm run dev` / `npm start` 后，鼠标移到托盘图标 → 180ms 后弹窗出现 → 移到弹窗上不会因离开托盘而关闭 → 离开弹窗和托盘后 280ms 自动关闭；多屏托盘在副屏时弹窗定位在副屏托盘上方
- 任意 provider 全部未配置时：弹窗显示"无用量数据"，不报错

## 不需要改
- `server.ts`（WS 已经会广播 usageInit/usageUpdate，弹窗自然能拿到）
- `useWebSocket.ts`（无新需求）
- 托盘菜单 / `setToolTip`（保留旧 tooltip）
- electron-builder `files`（`dist/renderer/**/*` 自动覆盖新产物）