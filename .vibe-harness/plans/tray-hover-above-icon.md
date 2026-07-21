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

### hover 刷新（v2.1.2 改为手动）
- ~~自动刷新方案已废弃~~（v2.1.1 的 `tray-hover:shown` IPC 已移除）
- `src/shared/types/ipc.ts` / `src/main/preload.ts` / `src/main/main.ts`：移除 `TRAY_HOVER_SHOWN` 通道与所有发送点
- `src/renderer/src/composables/useUsageState.ts`：保留 `send` 暴露
- `src/renderer/src/TrayHover.vue`：标题旁加 `↻` 刷新按钮，点击时 `send({ type: 'refresh' })` 并转圈 1s（与主面板 `.btn-refresh` 同模式）
- `src/renderer/src/styles/tray-hover.css`：新增 `.th-header-left` / `.th-refresh` / `.th-refresh.spinning` 样式

## 验证
- `npm run typecheck` + `npm run build:main`
- `npm run dev` 手动 hover 托盘确认位置，并观察主进程日志收到 refresh 请求

## 发布
- v2.1.1：定位 + hover 自动刷新（后被 v2.1.2 替代）
- v2.1.2：改为手动刷新按钮 — `npm run release -- --release-as patch`
- `git push --follow-tags origin main`
- `npm run build` 打包 exe 并运行

## 写回
完成后写 `.vibe-harness/history/tray-hover-above-icon.md`，更新 `index.md`。
