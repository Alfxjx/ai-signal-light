# 托盘「用量速览」补上火山 + 弹窗高度动态化

## 问题

用户发现托盘 hover 弹窗（标题「用量速览」，`src/renderer/src/TrayHover.vue`）里没有火山 Ark Coding Plan。

**不是回归，是既有缺失**：TrayHover 从来只渲染 Kimi / MiniMax / Copilot / Codex / DeepSeek / MiMo 六个 section。
Volcengine 当初只加进了主面板 `UsageCard.vue` 与安卓端，托盘漏了；`useUsageState` 也没导出它。

## 顺带发现的设计债

弹窗是固定 `TH_WIDTH=200 × TH_HEIGHT=260` 的窗口（`main.ts` 注释写"header + 5 个 provider section"），
但 provider 数量一直在变（MiMo 是后加的，已经有 7 个 section 了）。写死高度必然对不上，
这次再加火山三档只会更歪。

## 实际改动

| 文件 | 改动 |
|------|------|
| `src/renderer/src/composables/useUsageState.ts` | 新增 `volcengine` ref（接 init / usageInit / usageUpdate 三条路径）；新增 `volcengineSlots` computed（session=WINDOW_5H_MS / weekly=WINDOW_WEEK_MS / monthly=WINDOW_MONTH_MS）；`isProviderVisible` 联合类型加 `'volcengine'`；`lastUpdatedTs` 纳入 volcengine；导出 `volcengineSlots`；新增 `WINDOW_MONTH_MS` |
| `src/renderer/src/TrayHover.vue` | 新增「Ark Coding Plan」section（session / weekly / monthly 三行）；`anyVisible` 纳入 volcengine；根节点加 `ref`，用 `ResizeObserver` + `window.resize` 量 `scrollHeight` 上报主进程 |
| `src/shared/types/ipc.ts` | `ElectronAPI.trayHover` 加 `resize(height)`；新增 `TRAY_HOVER_RESIZE` 通道 |
| `src/main/preload.ts` | 透传 `resize`（注意：本文件的 `IPC_CHANNELS` 是**独立副本**，不 import shared，加通道要改两处） |
| `src/main/main.ts` | 新增 `trayHoverHeight` 可变高度 + `TRAY_HOVER_RESIZE` 处理（夹在 120~900，仅在窗口可见时重定位）；`positionTrayHover` 全部用 `trayHoverHeight` 取代写死的 `TH_HEIGHT` |

## 关键决策

- **动态高度而非改常量**：provider 只增不减，写死数字注定再次对不上。渲染层量内容高度上报，
  主进程只在高度真变了且窗口可见时才 `positionTrayHover()`
- **夹在 120~900**：防住渲染层异常上报把窗口撑爆
- **用 `scrollHeight` 而非 `getBoundingClientRect().height`**：窗口当前可能比内容矮，
  `offsetHeight` 量到的是被裁剪后的值
- **空档位不显示 reset 文本**：与 Kimi/MiniMax 现有 `v-if` 行为一致

## 验证

- `npm test` 148 passed / 12 files（无回归，本次未新增单测——纯渲染层 + IPC 透传）
- `npm run typecheck` 通过
- `npm run build` 通过（注意：这条会真的跑 electron-builder 重新生成 `dist/AI状态监控 2.6.0.exe`）
- 视觉效果需实机 hover 托盘确认，未目视验证

## 遗留

- 弹窗变高后靠近屏幕顶部/底部时的位置钳制只按 `workArea` 处理，section 再多可能需要滚动
- `preload.ts` 与 `shared/types/ipc.ts` 两份 `IPC_CHANNELS` 不同源，是既有隐患，建议后续合并
