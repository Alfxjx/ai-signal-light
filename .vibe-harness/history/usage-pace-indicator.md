# usage-pace-indicator

## 改动摘要
在主界面 UsageCard 上为带 5h / 周限额的用量条增加"消耗节奏"提示：根据重置时间计算期望平均消耗，并与当前实际已用 % 比较，显示"快 ↑ / 慢 ↓ / 均 —"。

## 实现细节
- 新增纯函数 `src/renderer/src/utils/usage.ts`：`calcUsagePace(usedPercent, resetTimeMs, windowMs, nowMs)`：
  - `expectedPercent = (windowMs - remainingMs) / windowMs * 100`
  - delta > 5% 为 fast，delta < -5% 为 slow，否则 average
- 新增 `src/renderer/src/utils/usage.test.ts`，覆盖缺失 reset、已重置、5h/周快慢平均、自定义阈值等场景
- `useUsageState.ts`：扩展 `FiveHourSlot` 增加 `pace` / `paceDelta` / `expectedPercent`；为 Kimi 5h/周、MiniMax 5h/周、Codex 5h/周窗口计算 pace；Copilot 按月重置、Codex day 窗口保持 null
- `UsageCard.vue`：在 5h/周条目的百分比右侧渲染 pace 标签，带 tooltip（如"比平均消耗快 +12.3%"）；在进度条内用竖线标记期望平均消耗位置；Kimi all plan 显示 `total.resetTime` 并同样渲染 pace 标签与标记
- `usage.ts`：新增 `inferAllPlanWindowMs`，根据 Kimi all plan 剩余重置时间推断月度（30 天）或年度（365 天）窗口
- `main.css`：添加 `.usage-pace` 样式与 `.usage-bar-marker` 竖线标记
- 修复测试环境：`vitest` 从 `^4.1.8` 降级到 `^3.0.0`，并加 `overrides` 固定 `std-env@^3.0.0`，解决 vitest 4 与 std-env 4 ESM/CJS 不兼容导致 `npm test` 无法启动的问题

## 影响范围
- 仅渲染层 UI，主进程逻辑与 WS 协议不变
- 新增文件：`src/renderer/src/utils/usage.ts`、`.vibe-harness/plans/usage-pace-indicator.md`、`.vibe-harness/history/usage-pace-indicator.md`
- 修改文件：`src/renderer/src/composables/useUsageState.ts`、`src/renderer/src/components/UsageCard.vue`、`src/renderer/src/styles/main.css`、`package.json`、`package-lock.json`

## 验证
- `npm run typecheck` 通过
- `npm test` 全部 60 个测试通过（含新增 8 个）
