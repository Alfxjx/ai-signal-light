# tray-hover-above-icon

## 需求
1. 托盘 hover 弹窗定位改为：**托盘图标正上方、水平居中于图标、底部贴着任务栏**（当前是放在光标侧边、竖直居中于光标）。
2. 每次 hover 显示弹窗时，主动请求服务端刷新一次用量数据。

## 改动
### 定位
仅 `src/main/main.ts` 的 `positionTrayHover()`：

1. 锚点：优先 `tray.getBounds()`（hover 时已过构造期，bounds 有效；构造期 0,0,0,0 的问题只影响 dev 自动展示，已有 200/800ms 重定位兜底），无效时退化为 `lastHoverCursor`。
2. 任务栏方位由 `display.workArea` 与 `display.bounds` 的差边推断：
   - **底部（默认）**：`x = 图标中心x - TH_WIDTH/2`，`y = wa.bottom - TH_HEIGHT`（底部贴任务栏上沿）
   - 顶部：水平居中，`y = wa.top`（顶部贴任务栏下沿）
   - 左/右：贴任务栏内侧边，竖直居中于图标，clamp 到 wa
3. 水平 clamp 到 workArea；删除不再使用的 `GAP` 常量。
4. 更新函数上方注释，console.log 内容同步调整。

### hover 刷新
- `src/shared/types/ipc.ts`：新增 `TRAY_HOVER_SHOWN` 通道、`trayHover.onShown` API
- `src/main/preload.ts`：暴露 `trayHover.onShown`
- `src/main/main.ts`：`scheduleShowTrayHover()` 在 `win.show()` 后发送 `tray-hover:shown`
- `src/renderer/src/composables/useUsageState.ts`：暴露 `send`
- `src/renderer/src/TrayHover.vue`：收到 `shown` 后通过 WS 发送 `{ type: 'refresh' }`；若 WS 尚未连接则等 `isConnected` 变 true 再发

## 验证
- `npm run typecheck` + `npm run build:main`
- `npm run dev` 手动 hover 托盘确认位置，并观察主进程日志收到 refresh 请求

## 发布
- `npm run release` 发 patch（2.1.1）
- `git push --follow-tags origin main`
- `npm run build` 打包 exe 并运行

## 写回
完成后写 `.vibe-harness/history/tray-hover-above-icon.md`，更新 `index.md`。
