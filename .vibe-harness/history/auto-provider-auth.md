# auto-provider-auth — 改动记录

- 时间：2026-07-20
- 计划：`.vibe-harness/plans/auto-provider-auth.md`（含实施阶段修订记录）

## 改动摘要

用量 provider 认证方式升级 + 新增两个 provider：

1. **Kimi：内嵌登录窗口自动抓 token**
   - 新建 `src/main/kimi-login.ts`：BrowserWindow 打开 kimi.com（`persist:kimi-login` 持久 cookie），`webRequest` 拦截 `apiv2/*` 请求抓 Bearer token（user-center HS512 JWT，约 30 天有效）；忽略过期 token、只保留更新的；抓到即写 config + checkAll + 自动关窗。
   - 设置页 Kimi 区新增「登录 Kimi 账号自动获取」按钮 + Token 有效期显示；手动粘贴保留。
   - **弃用路线（重要教训）**：`~/.kimi-code/credentials` 的 CLI OAuth token（scope=kimi-code）对 GetUsages 接口 401，该接口只认网页会话 token；kimi-desktop 的 LevelDB  scraping 太脆弱亦弃用。
2. **Copilot：GitHub Device Flow OAuth**
   - 新建 `src/main/copilot-auth.ts`：device code → 轮询换 `gho_` token（长期有效）→ `copilot_internal/v2/token` 会话 token（`CopilotSessionCache` 缓存）→ `copilot_internal/user` 的 `quota_snapshots`。
   - `copilot.token` 按 `gho_`/`ghu_` 前缀区分 OAuth 与旧 Cookie，旧 Cookie 路径保留（`fetchCopilotByCookie`）。
   - 设置页「连接 GitHub」按钮 + 验证码展示；新 IPC `copilot:device-start/cancel/result`。
3. **新增 DeepSeek provider**：手动 API key，`GET api.deepseek.com/user/balance`，只显示余额文本（无速率窗口）。
4. **新增 Codex provider**：新建 `src/main/codex-credentials.ts` 自动读 `~/.codex/auth.json`（JWT 约 6 天有效，过期走 auth.openai.com refresh 并合并写回）；`GET chatgpt.com/backend-api/wham/usage`（需 `ChatGPT-Account-Id` 头），primary/secondary 窗口按 `limit_window_seconds` 动态标 5h/day/week。chatgpt.com 需走代理（Electron/axios 不用系统代理），`useProxy` 要勾选。
5. **机制**：`UsageMonitor._safeRun` 新增可选 `resolveToken`（配置 token 为空时尝试自动来源，目前仅 Codex 使用）。

## 影响范围

- 主进程：`usage-monitor.ts`（重构 `_safeRun` + 新 fetcher + `mapDeepseekBalance`/`mapWhamUsage` 纯函数）、`main.ts`（SETTINGS_GET/SAVE + 3 个新 IPC handler）、`config.ts`（deepseek/codex 配置）、`server.ts`（usageInit 快照）、`preload.ts`
- 共享类型：`types/usage.ts`（ProviderId + 2 新数据类型）、`types/config.ts`、`types/ipc.ts`
- 渲染层：`Settings.vue`（Kimi 登录、Copilot 授权、DeepSeek/Codex 区块）、`UsageCard.vue`（DeepSeek 余额行、Codex 窗口 bar）、`useUsageState.ts`、`App.vue`、`FloatingBall.vue`（Codex 行）、`types/messages.ts`
- 测试：新增 `copilot-auth.test.ts`、`codex-credentials.test.ts`；`usage-monitor.test.ts` 加映射用例（共 50 用例通过）

## 已知限制 / 待办

- `MobileAppConfig` 未投影 deepseek/codex；Android 端假定 copilot.token 是 Cookie，OAuth token 后 Android Copilot 拉取会失效（待 Android 侧单独处理）。
- 悬浮球只加 Codex bar，DeepSeek 余额不进悬浮球。
- Copilot device flow、Kimi 登录窗口需用户交互验证（代码路径未端到端跑过）；DeepSeek 需真实 API key 验证。
- 环境注意：本仓库 vitest 需要 Node ≥ 20.17（`ERR_REQUIRE_ESM`），本机用 `D:\apps\nvm\v24.11.1` 跑测试。

## 追加：Kimi 接口迁移（2026-07-20 晚些时候）

Kimi 用量接口从 `BillingService/GetUsages` 换成 `MembershipService/GetSubscriptionStats`（POST `{}`，头加 `Connect-Protocol-Version: 1`）。新接口只返回 0-1 已用比例（`ratelimitCode5h.ratio` / `ratelimitCode7d.ratio` / `subscriptionBalance.amountUsedRatio`），无绝对配额数字。

- `fetchKimi` 整体重写，解析逻辑抽为纯函数 `mapKimiSubscriptionStats`（ratio → limit=100 的百分比 UsageMetric），`total.resetTime` 取 `subscriptionBalance.expireTime`。
- 已实测：dev 模式拉到 total 3% / week 16% / 5h 26%，与 curl 一致。首次冒烟遇到一次网络超时，重跑正常，属偶发。
