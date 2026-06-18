# .vibe-harness 共识记忆

## 用途
存储每个任务的实施计划与执行历史，形成可追溯的故事线。AI 靠这个目录跨 session 传递上下文。

## 目录结构
- `plans/` — 实施计划（`/plan` 输出）
- `history/` — 实际改动记录（含原因、影响范围、关联文件）
- `index.md` — 任务索引，按主题组织

## 使用规则
- 每个任务必须落盘 plan + history 至少一个
- 新 session 开始时，AI 必须读 `index.md` 定位相关历史
- 命名用语义化 kebab-case，禁用日期或随机字符

## 历史膨胀处理
- md 累计超过 ~2000 行时考虑迁移到 sqlite + 特征检索
- 参考 hooks 在 `SessionStart` 自动注入相关记忆


