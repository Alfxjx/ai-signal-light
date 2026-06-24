# floating-ball-dismiss-indicator

## 目标
悬浮球右上角的"通知指示灯"（`.fb-dot--active`）在亮起时，点击即可"灭灯"，同步清除主进程的 `pendingByCwd`，主窗口和悬浮球的指示灯会同步熄灭。

## 现状（不需要改的部分）
- IPC 链已通：`window.electronAPI.floatingBall.notifyCleared(cwd)` → preload → main → `server.clearPendingByCwd` → WS 广播 `pendingChanged` → 两窗口的 `pendingByCwd` 同步更新
- 主窗口 `App.vue` 已经在用 `notifyCleared`（`clearPending` 函数），悬浮球没接而已

## 待改文件

### `src/renderer/src/FloatingBall.vue`
1. 给 `.fb-dot` 加点击交互：仅当 `pendingCount > 0`（亮灯状态）可点击
2. 仿照父容器 `mousedown/mouseup` 短按-拖拽判定，自己维护一套 dot 的 downX/Y/Ts，避免和"短按打开主窗口"逻辑互相干扰
3. 点击命中后遍历 `Object.keys(pendingByCwd)`，对每个 cwd 调一次 `notifyCleared`
4. `.stop` 修饰符阻止事件冒泡到 `.fb`，否则父级的 `onClickBar`（打开主窗口）会被误触发

### `src/renderer/src/styles/floating-ball.css`
- 新增 `.fb-dot--clickable { cursor: pointer; }`：亮灯时鼠标手型，提示可点击

## 不改
- preload / main / server / types：现有 API 已够用
- 主窗口 `App.vue` 已有 `clearPending` 走相同通道，无需变化

## 自测
- 有 pending 时：点击 dot → 指示灯立即熄灭；后台再收到 hook 仍能重新亮起
- 拖动 dot 移动窗口位置：不会被误判为点击，指示灯状态不变
- 无 pending 时：dot 是灰色，hover 不出现手型，点击无副作用