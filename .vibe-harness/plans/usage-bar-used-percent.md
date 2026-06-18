# 统一进度条/百分比为「已用」语义

## Context

Kimi 接口返回的 `totalQuota.used=59, remaining=41, limit=100`，但当前 Kimi 卡片的进度条填充宽度 = `remaining %`（41% 宽），文字也是 `41%`。Copilot 同样把「剩余 %」当作进度条填充，文字则是 `41/100`。

用户的需求：**进度条实体显示已用，百分比显示已用比例**——三家供应商（Kimi、MiniMax、Copilot）行为必须一致。

排查后确认：
- **Kimi**：bar 和文字都是「剩余 %」 → **需要翻**
- **MiniMax**：渲染层用 `100 - remaining` 已经是「已用 %」 → **维持不变**
- **Copilot**：bar 是「剩余 %」，文字是 `剩余/总数`（用户选择改成「已用 %」） → **需要翻 + 改文字**
- 颜色阈值 `barClass` 当前按「剩余 < 20 = danger」分级——翻转后必须改成「已用 > 80 = danger」

## 核心策略

在 main 进程把 Kimi 和 Copilot 的 `percent` 字段统一翻成「已用 %」。
MiniMax 的 `MinimaxUsageData.fiveHourPercent` / `weeklyPercent` 字段名直接含「remaining」语义，所以保留渲染端的 `100 - x` 翻转，不动 main 端字段。

## 编辑清单

### 1. `src/main/usage-monitor.ts`
- Line 194: Kimi totalQuota `percent: calcPercent(used, limit)`
- Line 210: Kimi codingWeekly 同
- Line 218: Kimi codingFiveHour 同
- Line 313: Copilot premium `percent: calcPercent(limit - remaining, limit)`
- Line 334: `calcPercent(used, limit)` 参数重命名

### 2. `src/renderer/src/utils/time.ts`
- Lines 23-28: `barClass(usedPercent)`: `> 80 = danger`, `> 50 = warn`

### 3. `src/renderer/src/components/UsageCard.vue`
- Line 73: 注释 → "已用 %"
- Lines 106: 注释更新
- Line 114: Copilot 文字 `${p.percent}%`

### 4. `src/renderer/src/composables/useUsageState.ts`
- Line 128: 注释 → "已用 %"
- Lines 175-182: `remainingPct` → `usedPct` + 注释

### 5. `CLAUDE.md`
- Line 82: 文档同步 → used %

## 验证

`npm run dev` 跑起来后：
- Kimi 当前样本 `used=59` → bar 填 59%、标签 `59%`、黄色
- MiniMax 渲染无回归
- Copilot bar 从 41% → 59%，文字从 `41/100` → `59%`，绿 → 黄
- FloatingBall 顺带修复 Kimi/Copilot 显示

`npm run typecheck` + `npm test` 通过。
