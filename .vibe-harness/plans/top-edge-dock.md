# 主面板顶部吸附自动隐藏（top-edge-dock）

给主面板加「拖到屏幕顶部 → 松手自动收起 → 鼠标划上去自动滑出」的吸附行为，交互模仿 Windows 任务栏自动隐藏 / QQ 吸边。

## 结论：可行

现成条件都在：主窗口已经是 `frame: false` + `transparent` + `alwaysOnTop`（`src/main/main.ts:72-91`），拖动靠 CSS `-webkit-app-region: drag`（`src/renderer/src/styles/main.css:13`），位置已持久化到 `config.window`。收起/滑出只需要主进程按帧 `setBounds` 改 y，把窗口大部分推到屏幕上边界之外（Windows 允许负 y）。

hover 检测**不走 renderer 的 `mouseenter`**：收起后只剩几像素可见，透明窗口边缘的 DOM 事件不可靠。改用主进程 `screen.getCursorScreenPoint()` 轮询（只在 docked 状态开启），和 `positionTrayHover` 已有的 cursor 兜底思路一致。

## 交互与参数

状态机：`free` → （拖到顶部松手）→ `docked-collapsed` ⇄（hover / 离开）⇄ `docked-expanded` → （拖离顶部）→ `free`

| 参数 | 值 | 含义 |
|---|---|---|
| `SNAP_THRESHOLD` | 10px | 窗口顶边距 workArea 顶边 ≤ 此值 → 吸附 |
| `PEEK` | 5px | 收起后留在屏内的高度（触发带） |
| `COLLAPSE_DELAY` | 500ms | 松手后延迟收起，给用户反应时间 |
| `EXPAND_HOVER_DELAY` | 120ms | 光标在触发带内连续停留才滑出，防误触 |
| `COLLAPSE_AFTER_LEAVE` | 600ms | 光标离开窗口后延迟收起 |
| `POLL_INTERVAL` | 120ms | cursor 轮询周期（仅 docked 时运行） |
| `ANIM_MS` | 180ms | 收/放动画时长，~16ms 一帧，easeOutCubic |

「松手」的判定：`mainWindow.on('move')` debounce 300ms（Windows 上 `moved` 也会在拖动过程中连发，不能单独依赖）。动画期间用 `isAnimating` 标记忽略自己触发的 move。

收起时不收起的例外：设置窗口 / QR 窗口正在显示，或主窗口 `isFocused()` —— 避免用户正在面板里操作时被抽走。

## 实施步骤

### 1. 新增 `src/main/edge-dock.ts`（核心状态机，不 import electron）

导出 `class TopEdgeDock`，构造函数接收注入的适配器，便于单测：

```ts
interface DockHost {
  getBounds(): Rect;
  setBounds(r: Rect): void;
  getWorkArea(center: Point): Rect;   // screen.getDisplayNearestPoint(...).workArea
  getCursor(): Point;
  isBusy(): boolean;                  // 主窗口 focused 或 设置/QR 窗口开着
  onStateChange(s: DockState): void;  // 通知持久化 + renderer
}
```

对外方法：`handleMoveSettled()`、`start(initialDocked)`、`stop()`、`get state()`。内部：`collapse()` / `expand()` 各自跑一次 `setInterval` 动画（`wa.y` ⇄ `wa.y - h + PEEK`），`tick()` 做轮询判定：

- collapsed：cursor 落在 `[x-4, x+w+4] × [wa.y, wa.y+PEEK+2]` 连续 ≥ `EXPAND_HOVER_DELAY` → `expand()`
- expanded：cursor 不在窗口矩形（+8px 容差）且 `!isBusy()` 连续 ≥ `COLLAPSE_AFTER_LEAVE` → `collapse()`

多屏：每次判定都用窗口中心点重新取 `workArea`。

### 2. `src/main/edge-dock.test.ts`（Vitest，与源码同目录，符合项目约定）

用假 host + `vi.useFakeTimers()` 覆盖：
- 松手时 `y - wa.y <= 10` → 进入 docked 并在延迟后收起到 `wa.y - h + PEEK`
- 松手时超出阈值 → 保持 free，不启动轮询
- docked 后拖离顶部 → `undock()`，轮询停止，y 不再被改写
- 触发带命中/未命中（x 越界、y 越界）
- expanded 状态下 `isBusy() === true` 时不收起

### 3. 配置：`window.dockedTop`

- `src/shared/types/config.ts`：`WindowConfig` 加 `dockedTop: boolean`
- `src/main/config.ts`：`DEFAULTS.window` 加 `dockedTop: false`（`_load` / `update` 的 `window` 浅合并已自动覆盖）
- 重启恢复：`createWindow` 的 `ready-to-show` 里若 `dockedTop === true`，直接 `dock` 并**无动画**收起

### 4. `src/main/main.ts` 接线

- `createWindow()` 内构造 `TopEdgeDock`，host 适配到 `mainWindow` / `screen` / `settingsWindow` / `qrWindow`
- 现有 `mainWindow.on('move', scheduleSave)` 改为：先喂给 dock 的 debounce，再决定是否存 bounds
- **关键**：动画/收起状态下必须屏蔽 `saveBounds`（加 `suppressSave` 标记），否则收起态的负 y 被写进 config，重启时 `isRectVisible` 判定失败、窗口位置丢失
- `hide` / `minimize` 时 `dock.stop()`，`show` / `restore` 时若 `dockedTop` 则 `dock.start(true)`
- `before-quit` 清理定时器

### 5. 可视线索（收起后要看得见才能划出来）

收起后屏内只有 5px，主面板顶部正好是 TitleBar 的深色背景，本身可见但没有「可以拉出来」的暗示。所以：

- `src/shared/types/ipc.ts`：加 `WINDOW_DOCK_STATE: 'window:dock-state'` 通道 + `ElectronAPI.onDockStateChange`
- `src/main/preload.ts`：`contextBridge` 暴露 `onDockStateChange`
- `src/renderer/src/App.vue`：收到状态后给根容器加 `app--docked-collapsed`
- `src/renderer/src/styles/main.css`：该 class 下在顶部画一条 3px 高、居中约 40px 宽的亮色 handle（半透明白），提示可 hover 拉出

### 6. 验证

- `npm run typecheck`、`npm test`（新增 dock 单测应通过）
- `npm run build:main && npm run dev` 手动过一遍：拖到顶部松手收起 → hover 滑出 → 移开收起 → 从展开态拖离顶部退出吸附 → 重启后仍是收起态 → 收起态下 config.json 里 `window.y` 仍是展开态的值
- 若有副屏：把面板拖到副屏顶部重复一次

### 7. 收尾（AGENTS.md 约定）

- 计划写入 `.vibe-harness/plans/top-edge-dock.md`
- 改动摘要写入 `.vibe-harness/history/top-edge-dock.md`，并在 `.vibe-harness/index.md` 追加索引条目

## 不做的事

- 不做左/右边吸附（本次只要顶部；状态机留了 `getWorkArea` 抽象，以后扩展不难）
- 不加设置开关：吸附靠拖到顶部触发、拖离取消，本身就是显式操作，多一个开关是噪音
- 不动悬浮球（`focusable: false` 的小球做吸附收起没有意义）
