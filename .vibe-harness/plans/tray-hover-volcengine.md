# 托盘「用量速览」补上火山 + 弹窗高度动态化

## 问题

托盘 hover 弹窗（`src/renderer/src/TrayHover.vue`，标题「用量速览」）里没有火山 Ark Coding Plan。

既有缺失，不是回归：TrayHover 只渲染 Kimi / MiniMax / Copilot / Codex / DeepSeek / MiMo。
Volcengine 只加进了主面板 `UsageCard.vue` 与安卓端，`useUsageState` 也没导出它。

## 顺带发现的设计债

弹窗是固定 200×260 的窗口（`main.ts` 注释写"header + 5 个 provider section"），
但 provider 只增不减（MiMo 就是后加的，现在已经 7 个 section）。写死高度必然对不上。

## 计划

1. `useUsageState` 导出 `volcengine` ref + `volcengineSlots`（三档窗口）
2. `TrayHover.vue` 加「Ark Coding Plan」section
3. 高度动态化：渲染层 `ResizeObserver` 量 `scrollHeight` → IPC → 主进程改窗口高度
4. typecheck + 测试 + 文档

## 已定决策

- 三档全显示（用户确认）
- 高度按内容动态计算（用户确认），并夹在 120~900 防异常上报
- 只在高度真变化且窗口可见时重定位，避免抖动
