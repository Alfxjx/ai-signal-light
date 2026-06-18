# 统一进度条/百分比为「已用」语义

## 改动摘要

把所有 provider（Kimi/MiniMax/Copilot）的进度条填充宽度与百分比文字统一改成「已用 %」语义：
- bar 宽度 = used / limit
- 文字 = `已用%`
- 颜色：`<= 50%` 绿，`50%~80%` 黄，`> 80%` 红

修改前：
- Kimi: bar/文字都显示「剩余 %」（41% 宽，文字 `41%`）
- MiniMax: 已经是「已用 %」（渲染层 `100 - x` 翻转）
- Copilot: bar 是「剩余 %」，文字是 `41/100` 分数
- 颜色阈值: `剩余 < 20 = danger`

修改后：
- Kimi: `used=59 → 59% 宽 + 文字 59%`
- MiniMax: 渲染层翻转保持不变（行为未变）
- Copilot: bar 翻向，文字改为 `59%`
- 颜色阈值: `已用 > 80 = danger`

## 影响文件

| 文件 | 改动 |
|------|------|
| `src/main/usage-monitor.ts` | Kimi 3 处 + Copilot 1 处 `calcPercent` 翻向；`calcPercent` 参数 `remaining → used` 重命名 |
| `src/renderer/src/utils/time.ts` | `barClass` 阈值翻转：`< 20 danger / < 50 warn` → `> 80 danger / > 50 warn` |
| `src/renderer/src/components/UsageCard.vue` | Copilot 文字从 `${remaining}/${limit}` 改为 `${percent}%`；2 处注释更新 |
| `src/renderer/src/composables/useUsageState.ts` | Copilot `remainingPct → usedPct` 改名 + 2 处注释 |
| `src/renderer/src/utils/time.test.ts` | barClass 测试断言改成「已用 %」语义 |
| `CLAUDE.md` | State Model 段落同步描述 |

## 关键决策

1. **翻转点选 main 进程而非渲染层**：让 WS payload 的 `percent` 字段成为单一真值源（语义=已用 %），渲染层直接消费，避免散落的 `100 - x` 算式。
2. **MiniMax 维持渲染端翻转**：因为它的 `MinimaxUsageData.fiveHourPercent`/`weeklyPercent` 字段名直接含「remaining」语义（不是 `UsageMetric.percent`通用通道），改 main 端会破坏 type 直觉。
3. **顺带修复 FloatingBall**：浮动条之前 Kimi/Copilot 显示的也是「剩余 %」（main 端翻转后自动修好，无需改 FloatingBall.vue）。
4. **Copilot 文字格式**：用户选择改成 `${percent}%`（三家完全统一为百分比格式），放弃 `${remaining}/${limit}` 的绝对数信息密度。

## 验证

- ✅ `npm run typecheck` 通过
- ✅ `npm test` 37 个测试全过（包括新改的 barClass 阈值断言）
- 待人工验证：`npm run dev` 启动后视觉确认 Kimi/Copilot bar 与颜色

## 注意事项 / 后续

- WS payload `percent` 字段语义变化：从「剩余 %」→「已用 %」。目前只有 renderer 消费，无外部 consumer。若以后有第三方接入需特别说明。
- `calcPercent` 函数签名参数名 `remaining → used`，但调用点的形参语义已对齐，无回归。
