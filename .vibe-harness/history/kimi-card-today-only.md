# 主面板 Kimi 列表只显示当日

- 时间：2026-09-28
- 范围：主面板「Kimi Code (web)」目录列表从"全量"改为"当日"，忙态/待确认行强留

## 实际改动

| 文件 | 改动 |
|------|------|
| `src/renderer/src/utils/kimiFilter.ts` | 新增 `startOfDay(ts)`（本地自然日零点）、`filterTodayProjects(projects, now)`；下拉用的 `filterRecentProjects` 保持 3 天窗口不变 |
| `src/renderer/src/utils/kimiFilter.test.ts` | 新增 `startOfDay` + `filterTodayProjects` 共 7 条用例（今天零点边界含等号、昨天边界 1ms、强留忙/pending/null 时间戳、顺序不变） |
| `src/renderer/src/components/KimiCard.vue` | `projects` 改为 `filterTodayProjects(allProjects, props.now)`；空态文案按「原始列表是否为空」区分 `No sessions` / `今日无活动` |
| `AGENTS.md` | State Model 的 Kimi 段补一句：主面板当日窗口 vs 下拉 3 天窗口，两者都强留非空闲行 |

## 关键决策
- 用**本地自然日**（`setHours(0,0,0,0)`）而不是滚动 24h，符合"当日"语义，跨零点自动切换（`now` prop 每秒刷新，computed 会重算）
- 忙态/pending 强留：状态监控的底线是"正在干活的会话绝不能消失"，哪怕 `lastResponse` 是几小时前的脏时间戳
- 边界用 `>=`（今天 0 点整的那 1ms 算今天），`null` 时间戳且空闲 → 隐藏

## 验证
- `npm test` 129 passed / 11 files
- `npm run typecheck` 通过
- `npm run build:renderer` 通过

## 影响范围
仅渲染层展示裁剪，未动主进程 `kimi-monitor.ts`（数据仍全量推送，WS 协议不变），安卓端与悬浮球下拉行为不变。
