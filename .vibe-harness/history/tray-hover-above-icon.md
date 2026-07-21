# tray-hover-above-icon

## 改动摘要
1. 托盘 hover 弹窗定位从「光标侧边、竖直居中于光标」改为「**托盘图标正上方、水平居中于图标、底部贴任务栏**」。
2. hover 刷新策略：v2.1.1 为 hover 自动刷新（`tray-hover:shown` IPC），v2.1.2 **撤回自动刷新**，改为标题旁 `↻` 刷新按钮手动触发（与主面板 `.btn-refresh` 同模式）。

## 改动文件
### 定位
- **`src/main/main.ts`** `positionTrayHover()`：
  - 锚点改为优先 `tray.getBounds()`（hover 时已过构造期，bounds 有效；`iconValid` 校验 width/height > 0），无效时退化为 `lastHoverCursor` / 当前 cursor，取图标中心 `centerX/centerY`
  - 任务栏方位由 `display.workArea` 相对 `display.bounds` 的缩进边推断：
    - **底部（默认）**：`x = centerX - TH_WIDTH/2`，`y = wa.bottom - TH_HEIGHT`（弹窗底部贴任务栏上沿）
    - 顶部：水平居中，`y = wa.top`（贴任务栏下沿，弹窗在图标下方）
    - 左/右：贴任务栏内侧边，竖直居中于图标，竖直 clamp 到 wa
  - 水平 clamp 到 workArea；删除不再使用的 `GAP` 常量
  - `console.log` 改为输出 `{ icon, centerX, centerY, x, y, wa }`

### hover 刷新（v2.1.1 → v2.1.2 演进）
- **v2.1.1（自动刷新，已废弃）**：`ipc.ts` / `preload.ts` 新增 `TRAY_HOVER_SHOWN`；`main.ts` 在 show 后发送；`TrayHover.vue` 收到后 WS 发 refresh
- **v2.1.2（手动刷新按钮，当前方案）**：
  - `src/shared/types/ipc.ts` / `src/main/preload.ts` / `src/main/main.ts`：**移除** `TRAY_HOVER_SHOWN` 通道与全部发送点
  - `src/renderer/src/composables/useUsageState.ts`：保留 `send` 暴露（按钮复用）
  - `src/renderer/src/TrayHover.vue`：标题旁新增 `↻` 刷新按钮，`onRefresh()` 中 `isConnected && send({ type: 'refresh' })` 后置 `isRefreshing` 转圈 1s；header 结构改为 `th-header-left`（title + button）+ `th-updated`
  - `src/renderer/src/styles/tray-hover.css`：新增 `.th-header-left` / `.th-refresh` / `.th-refresh:hover` / `.th-refresh.spinning` + `@keyframes th-spin`

## 影响范围
- 定位逻辑仅影响 tray hover 弹窗；悬浮球、主窗口、设置窗口均不动
- 复用 1 条既有 WS 消息（renderer → server `{ type: 'refresh' }`），无新增主进程接口；IPC 无净新增（v2.1.1 的 shown 通道已随 v2.1.2 移除）
- 自动隐藏任务栏（workArea == bounds）走默认底部分支，行为正确
- 多屏：用 `getDisplayNearestPoint(图标中心)` 定位到托盘所在屏

## 发布
- **v2.1.1**：定位 + hover 自动刷新（commit `dd46f04`，tag `v2.1.1`，产物 `dist/AI状态监控 2.1.1.exe`）
- **v2.1.2（当前）**：撤回自动刷新，改手动刷新按钮
  - 提交：`e8f73b6 feat: 托盘 hover 弹窗改为手动刷新用量数据` + `97c35ae chore(release): 2.1.2`
  - 标签：`v2.1.2`，已 `git push --follow-tags origin main`
  - 产物：`dist/AI状态监控 2.1.2.exe`（portable）

## 自测
- ✅ `npm run typecheck` / `build:main` / `vite build` 通过
- ✅ v2.1.2 `npm run dev`：弹窗正常显示且定位正确，日志**不再出现** `[Server] user requested refresh`（确认 hover 不再自动刷新）
- ✅ `npm run build` 成功产出 `dist/AI状态监控 2.1.2.exe`；运行后进程可正常启动（PID 可 taskkill）
- ⏸ 按钮点击触发 refresh 的实际交互效果需用户手动确认（WS refresh 链路在 v2.1.1 已验证，按钮复用同一 `send` 调用）
