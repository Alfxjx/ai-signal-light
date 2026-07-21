# tray-hover-above-icon

## 改动摘要
托盘 hover 弹窗定位从「光标侧边、竖直居中于光标」改为「**托盘图标正上方、水平居中于图标、底部贴任务栏**」。

## 改动文件
- **`src/main/main.ts`** `positionTrayHover()`：
  - 锚点改为优先 `tray.getBounds()`（hover 时已过构造期，bounds 有效；`iconValid` 校验 width/height > 0），无效时退化为 `lastHoverCursor` / 当前 cursor，取图标中心 `centerX/centerY`
  - 任务栏方位由 `display.workArea` 相对 `display.bounds` 的缩进边推断：
    - **底部（默认）**：`x = centerX - TH_WIDTH/2`，`y = wa.bottom - TH_HEIGHT`（弹窗底部贴任务栏上沿）
    - 顶部：水平居中，`y = wa.top`（贴任务栏下沿，弹窗在图标下方）
    - 左/右：贴任务栏内侧边，竖直居中于图标，竖直 clamp 到 wa
  - 水平 clamp 到 workArea；删除不再使用的 `GAP` 常量
  - `console.log` 改为输出 `{ icon, centerX, centerY, x, y, wa }`

## 影响范围
- 仅定位逻辑变化；弹窗创建、show/hide debounce、IPC pointer 回报、WS 数据链路均不动
- 自动隐藏任务栏（workArea == bounds）走默认底部分支，行为正确
- 多屏：用 `getDisplayNearestPoint(图标中心)` 定位到托盘所在屏

## 自测
- ✅ `npm run typecheck` 通过
- ✅ `npm run build:main` 通过
- ⏸ 端到端 hover 效果需手动跑 `npm run dev` 确认
