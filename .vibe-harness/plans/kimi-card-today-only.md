# 主面板 Kimi 列表只显示当日

## 问题
主面板「Kimi Code (web)」卡把所有会话目录都列出来，攒久了列表很长，噪音多。
悬浮球下拉早就有裁剪（`filterRecentProjects`，3 天窗口），主面板没接。

## 方案
新增 `filterTodayProjects`（`src/renderer/src/utils/kimiFilter.ts`）：

- `state !== 'idle'` 或 `pending` → 强留（正在跑/等确认的会话不能因为时间戳旧就消失）
- `lastResponse >= startOfDay(now)` → 保留（本地自然日，不是滚动 24h）
- 其余隐藏

`KimiCard.vue` 用它算 `projects`；列表为空时按「有原始数据但被过滤光」区分文案：
`今日无活动` vs `No sessions`。顺序沿用主进程 `buildProjects` 的 `lastResponse` 倒序，不额外排序。

## 影响范围
- `src/renderer/src/utils/kimiFilter.ts`（新增 `startOfDay` / `filterTodayProjects`）
- `src/renderer/src/utils/kimiFilter.test.ts`（新增 7 条用例）
- `src/renderer/src/components/KimiCard.vue`
- `AGENTS.md`（State Model 补充两套裁剪规则）

## 不做
- 悬浮球下拉维持 3 天窗口（用户没提，且窗口更短会更快丢上下文）
- 不加"显示更多"展开开关：主面板高度有限，当日口径已够

## 预估
人工开发约 0.5 人日（含确认口径、纯函数 + 单测、UI 文案）。
