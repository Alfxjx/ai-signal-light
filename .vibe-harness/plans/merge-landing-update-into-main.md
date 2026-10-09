# 合并 landing-update 到 main

## 背景

仓库远端有三个分支，都从 `2.6.0 (ee927dd)` 分叉，谁也不包含谁：

| 分支 | 最后提交 | 内容 |
|---|---|---|
| `main` | 2026-10-09 | 安卓重构为独立「AI 用量监控」、火山改官方 OpenAPI V4 |
| `opencode-feat` | 2026-09-29 | opencode 用量侧边栏插件 + 配置助手 CLI |
| `landing-update` | 2026-09-30 | 上面那个的超集，另加 landing 整页重做 + README 刷新 + 侧边栏单家刷新按钮 |

`landing-update` 是 `opencode-feat` 的祖先（已用 `git merge-base --is-ancestor` 验证），
合它一次即可拿到两个分支的全部内容，避免分两次合。

## 目标

把 `landing-update` 合进 `main`，保住两边各自的**后续**成果：

- main 侧（较新，2026-10）：安卓单屏重构 + 火山官方 OpenAPI V4 签名（Cookie 通道已删）
- 分支侧（较旧，2026-09）：桌面宠物、悬浮球 Kimi 气泡、MiMo provider、opencode 插件、landing 重做

## 做法

`git merge --no-commit --no-ff origin/landing-update`，落出 21 个冲突，按方向分四类处理：

1. **火山冲突一律取 main**（main 的 2026-10-09 版本更晚且是显式设计决策：彻底删 Cookie 通道）
2. **MiMo 一律保留**（分支侧新增能力，main 没有）
3. **安卓 UI 重构取 main，MiMo 手工移植进去**（不能简单二选一）
4. **文档两边都留**（索引按时间倒序合并）

## 验证

- `npm run typecheck` 通过
- `android-app/gradlew assembleDebug` 通过
- `npm test`：142 例中 139 通过；3 例失败（`pet-store` / `pet-install`）在 `origin/landing-update` 上原样复现，非本次引入