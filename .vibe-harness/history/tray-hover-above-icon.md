# tray-hover-above-icon

## 改动摘要
1. 托盘 hover 弹窗定位从「光标侧边、竖直居中于光标」改为「**托盘图标正上方、水平居中于图标、底部贴任务栏**」。
2. 每次 hover 显示弹窗时，通过新增 IPC `tray-hover:shown` 通知渲染层，渲染层立即向服务端 WS 发送 `{ type: 'refresh' }`，强制刷新一次用量数据。

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

### hover 刷新
- **`src/shared/types/ipc.ts`**：新增 `TRAY_HOVER_SHOWN = 'tray-hover:shown'`；`ElectronAPI.trayHover` 新增 `onShown(cb: () => void)`
- **`src/main/preload.ts`**：暴露 `trayHover.onShown`，内部 `ipcRenderer.on(TRAY_HOVER_SHOWN, ...)`
- **`src/main/main.ts`**：
  - `scheduleShowTrayHover()` 在 `win.show()` 后发送 `TRAY_HOVER_SHOWN`
  - dev 模式自动显示弹窗的分支也发送 `TRAY_HOVER_SHOWN`，方便调试
- **`src/renderer/src/composables/useUsageState.ts`**：从 `useWebSocket` 取出 `send` 并暴露给消费方
- **`src/renderer/src/TrayHover.vue`**：
  - 解构 `isConnected` / `send`
  - 监听 `tray-hover:shown`，调用 `requestRefresh()`
  - 若收到 shown 时 WS 尚未连接，则置 `pendingRefresh = true`，等 `watch(isConnected)` 触发后再发送 `{ type: 'refresh' }`

## 影响范围
- 定位逻辑仅影响 tray hover 弹窗；悬浮球、主窗口、设置窗口均不动
- 新增 1 条 IPC（main → renderer）和复用 1 条 WS 消息（renderer → server），无新增主进程接口
- 自动隐藏任务栏（workArea == bounds）走默认底部分支，行为正确
- 多屏：用 `getDisplayNearestPoint(图标中心)` 定位到托盘所在屏

## 发布
- 版本：`2.1.1`
- 命令：`npm run release -- --release-as patch`
- 提交：`dd46f04 chore(release): 2.1.1`
- 标签：`v2.1.1`
- 已 push：`git push --follow-tags origin main`（`main` 从 `f10ba36` 推进到 `dd46f04`）
- 产物：`dist/AI状态监控 2.1.1.exe`（portable）

## 自测
- ✅ `npm run typecheck` 通过
- ✅ `npm run build:main` 通过
- ✅ `npm run dev` 自动显示弹窗并触发 refresh：日志出现 `[Server] user requested refresh`，随后各 provider 重新拉取数据
- ✅ `npm run build` 成功产出 `dist/AI状态监控 2.1.1.exe`
- ✅ 运行打包后的 exe：进程可正常启动（taskkill 能找到 PID 并终止）
- ⏸ 真实鼠标 hover 托盘图标的位置与刷新效果需用户手动确认
