# floating-ball-dismiss-indicator

## 改动摘要
悬浮球顶部通知指示灯（`.fb-dot--active`）亮起时支持点击灭灯：清空所有 pending cwd，主窗口与悬浮球的指示灯同步熄灭。

## 改动文件

### `src/renderer/src/FloatingBall.vue`
- 新增独立的状态机 `dotDownX/Y/Ts/Valid` 和 `onDotMouseDown/onDotMouseUp/onDotClick`，复用父容器的 `CLICK_DISTANCE = 4px` / `CLICK_DURATION = 300ms` 短按判定
- `onDotClick` 遍历 `Object.keys(pendingByCwd)`，对每个 cwd 调用 `window.electronAPI.floatingBall.notifyCleared(k)`
- 仅当 `pendingCount > 0` 时：`fb-dot` 增加 `fb-dot--clickable` class、设置 `title="点击熄灭指示灯"`、绑定 mousedown/mouseup；`.stop` 阻止冒泡到 `.fb`，避免被父级"短按打开主窗口"逻辑误吞
- 当 `pendingCount === 0`：dot 保持灰色静止状态，无任何交互

### `src/renderer/src/styles/floating-ball.css`
- 新增 `.fb-dot--clickable { cursor: pointer; }`：亮灯时鼠标手型，提示可点击

## 影响范围
- **功能新增**：仅影响悬浮球指示灯交互，不动主窗口（主窗口早就有相同 `notifyCleared` 通道）
- **IPC 复用**：沿用现有 `floating-ball:notify-cleared` 通道，主进程 `server.clearPendingByCwd` → WS `pendingChanged` 广播链路无需改动
- **样式增量**：仅新增一个 class，不影响其他样式

## 自测
- ✅ `npx vue-tsc --noEmit` 通过，无类型错误
- 有 pending 时：点击 dot → 指示灯立即熄灭；新 hook 到达仍能重新亮起
- 拖动 dot 移动窗口位置：不会被误判为点击
- 无 pending 时：dot 灰色，无 `cursor: pointer`，点击无副作用

## 不需要改
- `preload.ts` / `main.ts` / `server.ts` / `App.vue`：现有 `notifyCleared` 链路完整
- `useUsageState.ts`：悬浮球和主窗口各自消费同一份 WS 流，灭灯后 WS 广播自动同步两端状态