# tray-hover-usage-popup

## 目标
鼠标 hover 在系统托盘图标上时，在托盘旁边弹出一个"简易用量"悬浮层（Kimi / MiniMax / Copilot / Codex + DeepSeek 余额），hover 离开后自动关闭。

## 现状
- `src/main/main.ts:createTray()` 只用了 `tray.setToolTip('AI助手状态监控')` + 右键菜单 + `tray.on('click', toggleWindow)`，没有任何 hover 行为
- 已有 `src/renderer/src/FloatingBall.vue`（140×104，4 个 provider mini bar），可作为参考样式
- `useUsageState` composable 已经把 WS 推送封装好了，悬浮层复用即可
- vite 多入口：`main` / `settings` / `floating-ball`，需要新增第 4 个

## 设计
- 新建独立 BrowserWindow（不与悬浮球复用），首次 hover 时创建并 show，再 hover 显示/隐藏（不重建）
- 通过 `tray.getBounds()` + `screen.getDisplayNearestPoint` 定位：Windows 任务栏在底 → 弹窗在图标上方；macOS 菜单栏在顶 → 弹窗在图标下方；越界自动 fallback
- 显示/隐藏有 debounce：mouse-enter 后 180ms 才显示（避免快速划过闪烁）；mouse-leave 后 280ms 才关闭（允许鼠标移到弹窗上）
- 弹窗上 `mouseenter` 取消关闭 timer，`mouseleave` 触发关闭 timer
- 弹窗 `focusable: false`（不抢当前 IDE 焦点）、`skipTaskbar: true`、`alwaysOnTop: true`
- 弹窗内容：复用 `useUsageState`，4 行 mini bar（Kimi 5h / MiniMax 5h / Copilot premium / Codex primary）+ DeepSeek 余额 + 顶部最后更新时间

## 待改/新增文件

### 新增
- `src/renderer/src/tray-hover.html` — Vue 入口 HTML
- `src/renderer/src/tray-hover.ts` — Vue 启动
- `src/renderer/src/TrayHover.vue` — 弹窗 UI（复用 useUsageState）
- `src/renderer/src/styles/tray-hover.css` — 样式（参考 floating-ball.css，但用全名 label）

### 改动
- `src/main/main.ts`：
  - 加 `trayHoverWindow` / `trayHoverShowTimer` / `trayHoverHideTimer` 全局状态
  - 新增 `createTrayHoverWindow()` / `showTrayHover()` / `hideTrayHover()` / `positionTrayHover()` 4 个函数
  - `createTray()` 里加 `tray.on('mouse-enter')` 和 `tray.on('mouse-leave')`
- `vite.config.ts`：rollupOptions.input 加 `'tray-hover': resolve(RENDERER_SRC, 'tray-hover.html')`

## 不改
- `server.ts` / `useUsageState.ts` / `preload.ts` / `useWebSocket.ts` / IPC channels — 弹窗走和悬浮球一样的 WS 流（同一端口 3456），无需新通道
- 现有 tooltip 保留（hover 时 OS 也会显示），但弹窗是更详细的内容

## 自测
- 鼠标移到托盘图标上 → 弹窗在图标附近弹出，显示各家用量
- 鼠标移出托盘图标和弹窗 → 弹窗在 ~280ms 后自动关闭
- 鼠标移到弹窗上 → 不会因为 leave tray 而关闭
- 鼠标移到托盘图标上点击右键弹菜单 → 不影响弹窗逻辑
- 多屏：托盘在副屏时，弹窗定位在副屏托盘上方，不溢出主屏
- 无任何 provider 配置时：弹窗不报错，显示「无用量数据」