# 用量节奏指示器

## 目标
在主界面（UsageCard）上，为带有 5h / 周限额的模型增加"当前消耗比平均快/慢"的提示。

## 背景
Kimi、MiniMax、Codex 的某些窗口有明确的重置时间。用户希望根据"剩余时间占整个窗口的比例"，计算出一个期望平均消耗，并与当前实际已用 % 做对比。

## 方案
1. 新增纯函数 `calcUsagePace(usedPercent, resetTimeMs, windowMs, nowMs)`：
   - `remainingMs = resetTimeMs - nowMs`
   - `elapsedMs   = windowMs - remainingMs`
   - `expectedPercent = elapsedMs / windowMs * 100`
   - `delta = usedPercent - expectedPercent`
   - 阈值 ±5%：delta > 5 为 fast，delta < -5 为 slow，否则 average
2. 在 `useUsageState.ts` 的 `FiveHourSlot` 上扩展 `pace: 'fast' | 'slow' | 'average' | null` 与 `paceDelta: number | null`。
3. 为 Kimi（5h / week）、MiniMax（5h / week）、Codex primary 计算 pace。
4. 在 `UsageCard.vue` 每个 bar 的 value 旁显示小型标签：
   - 快 ↑（偏红/橙）
   - 慢 ↓（偏绿）
   - 均 —（灰）
5. 添加单元测试覆盖 `calcUsagePace` 的边界情况。

## 影响文件
- `src/renderer/src/utils/usage.ts`（新建 + 测试）
- `src/renderer/src/composables/useUsageState.ts`
- `src/renderer/src/components/UsageCard.vue`
- `src/renderer/src/styles/main.css`
