# top-edge-dock — 改动记录

主面板新增「拖到屏幕顶部 → 松手自动收起 → 鼠标划到顶部触发带自动滑出」的吸附行为。

## 新增文件

- `src/main/edge-dock.ts` — `TopEdgeDock` 状态机。**刻意不 import electron**，平台能力通过 `DockHost`
  注入（`getBounds` / `setBounds` / `getWorkArea` / `getCursor` / `isBusy` / `onStateChange`），
  所以能在 node 环境下单测。状态：`free` / `collapsed` / `expanded`。
  对外：`start(initialDocked)`、`stop()`、`handleMoveSettled()`、`undock()`、`reapply()`、
  getter `state` / `docked` / `animating`。
- `src/main/edge-dock.test.ts` — 10 个 case，fake timers + 假 host。

## 改动文件

- `src/shared/types/config.ts` — `WindowConfig` 加 `dockedTop: boolean`
- `src/main/config.ts` — `DEFAULTS.window.dockedTop = false`（`_load` / `update` 的 window 浅合并自动覆盖）
- `src/main/main.ts`
  - 全局 `let dock: TopEdgeDock | null`
  - `createTopEdgeDock()` 把 electron 能力适配成 `DockHost`；`isBusy` = 主面板聚焦 or 设置/QR 窗口可见
  - `createWindow()`：`ready-to-show` 里若 `cfgWin.dockedTop` 则 `dock.start(true)`（无动画恢复收起）
  - `move` 事件拆成两条链：`scheduleMoveSettled`（300ms debounce → `handleMoveSettled`）+ 原有 `scheduleSave`
  - `saveBounds` 在 `dock.docked` 时**保留 config 里旧的 x/y**，只存 width/height —— 否则收起态的负 y 会被写进 config，重启时 `isRectVisible` 判定失败导致窗口位置丢失
  - `hide` / `minimize` → `dock.stop()`；`show` → 按 `dockedTop` 恢复；`closed` / `before-quit` → `stop()`
  - `WINDOW_RESIZE` handler 末尾加 `dock.reapply()`（简略/完整模式切换改高度后重新摆位）
- `src/shared/types/ipc.ts` — 加 `WINDOW_DOCK_STATE` 通道、`DockStateName` 类型、`ElectronAPI.onDockStateChange`
- `src/main/preload.ts` — 暴露 `onDockStateChange`
- `src/renderer/src/App.vue` — `dockState` ref，`onMounted` 订阅，根节点 `.app--docked`
- `src/renderer/src/styles/main.css` — `.app` 加 `position: relative`；`.app--docked::after` 在**底边**画 40×3 把手

## 关键约束（后续改动别踩）

1. **收起是把窗口往上推**（`y = workArea.y - height + PEEK`），所以屏内可见的是面板**底边**，
   不是标题栏。把手 CSS 必须挂在底部。
2. **吸附态下 bounds 由 dock 托管**，任何持久化窗口位置的代码都要先看 `dock.docked`，
   不能无脑存 `getBounds()`。
3. **hover 检测走主进程 cursor 轮询**（`POLL_INTERVAL = 120ms`，仅 docked 时运行），
   不能改成 renderer 的 `mouseenter` —— 收起后只剩 5px，透明窗口边缘的 DOM 事件不可靠。
4. **`animating` 期间必须忽略 move 事件**，否则动画自己触发的 move 会被当成用户拖动。
5. 「松手」只能靠 move 的 debounce 判定：Windows 上 `moved` 事件在拖动过程中也连发。
6. 单测里 tick 相关的时间推进要留 `POLL_INTERVAL` 余量，否则判定还没轮到就断言。

## 参数（`edge-dock.ts` 顶部常量，可调）

`SNAP_THRESHOLD=10` / `PEEK=5` / `COLLAPSE_DELAY=500` / `EXPAND_HOVER_DELAY=120` /
`COLLAPSE_AFTER_LEAVE=600` / `POLL_INTERVAL=120` / `ANIM_MS=180`

## 坑：setBounds 的 conversion failure（已修）

真机运行崩 `BrowserWindow.setBounds` → `Error processing argument at index 0`，发生在动画帧。
electron 对传 NaN/undefined 就是报这个错。修复：
- `src/main/main.ts` 的 `host.setBounds` 先 `Number.isFinite` 校验 4 个字段，非法就 `console.error` 并 return，不再崩
- `src/main/edge-dock.ts` 收敛所有改 y 的入口到 `setY()`（也做有限性兜底）
- `start()` 的 `wa.y` 用 `finiteOr(wa.y, b.y)` 兜底

若再次出现该错，看控制台 `[dock] setBounds 收到非法值` 日志定位。

## 方案A：动画改渲染层 CSS transform（2.3 迭代）

原实现主进程 `setInterval(16ms)` 逐帧 `setBounds` 搬 OS 窗口，因透明+`backdrop-filter: blur` 窗口每帧触发 DWM 重合成，卡顿。改为：
- `edge-dock.ts` 不再做逐帧动画。`animateTo` 只做：先置 `_animating` → `setY(targetY)` **瞬移**窗口 → `host.animate(compensationY)` 把 `起点y-目标y` 补偿值发给渲染层 → `setTimeout(ANIM_MS+40)` 清 `_animating`。删掉 `ANIM_FRAME`、`easeOutCubic`。
- `DockHost` 增 `animate(compensationY)`；`clearTimers`/`stop` 处理 `animEndTimer`。
- IPC 增 `WINDOW_DOCK_ANIM` + `ElectronAPI.onDockAnim`；`preload` 透传。
- `App.vue` `runDockAnim`：`.app` 收补偿值，强制 reflow 后 CSS `transform translateY(补偿)→0`（180ms ease-out），加 `.app--dock-animating`（期间关 blur 防错位）。
- `main.css`：`.app` 加 `will-change: transform`；`.app--dock-animating { backdrop-filter: none }`。

**时序关键**：瞬移触发 move 事件，`scheduleMoveSettled` 靠 `dock.animating` 抑制——因此 `animateTo` 必须**先置 `_animating` 再 `setY`**，否则瞬移会被当成「拖离顶部」触发 `undock()`。

## 验证状态

- `npm run typecheck` 通过
- `npm test` 75 passed（含新增 10 个 dock 单测）
- **仍需真机复测**：首次真机 run 在旧动画实现（逐帧 setBounds）崩过一次；已重建并用方案A 重写动画。请用户重启 dev 验证：拖拽/收起/滑出是否顺滑且不再崩。`onDockAnim` 到的补偿值 collapse=+545、expand=-545 是预期（数值随 PEEK/高度/wa.y 变）。
