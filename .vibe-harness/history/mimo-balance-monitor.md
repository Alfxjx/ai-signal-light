# 小米 MiMo 账户余额监控

- 时间：2026-09-25
- 状态：已完成（typecheck / test / build / 真实接口鉴权失败路径 均验证通过）

## 做了什么

在已有的 6 家用量 provider 之后接入第 7 家 **小米 MiMo**，走 pay-as-you-go **余额型**
展示（与 DeepSeek 同款：金额文本 + 赠送明细，无进度条）。

主面板 Usage 卡片与托盘 hover 弹窗各加一条 MiMo 余额行；设置窗口加「小米 MiMo」分区，
粘贴控制台 Cookie 即可。

## 关键结论

1. **MiMo 余额没有 API Key 接口**。调模型的 `sk-` key（`api.xiaomimimo.com/v1`）查不到余额，
   唯一入口是控制台 `GET https://platform.xiaomimimo.com/api/v1/balance`，
   鉴权是小米账号**会话 Cookie**（需 `api-platform_serviceToken` + `userId`）。
2. **端点已实测存在**。未授权时返回 `HTTP 401` +
   `{"code":401,"loginUrl":"https://account.xiaomi.com/..."}`。
3. **响应结构未公开**，所以 `mapMimoBalance` 走两层容错：剥 `data`/`result` 信封 +
   字段名「去下划线 + 忽略大小写」多候选匹配；金额按元，若带 `scale`/`unit` 倍率字段则换算。
4. **业务码判断放在映射失败之后**（重要）。最初写成「先看 `code` 不是 0/200 就报错」，
   但控制台成功码未必是 0，这样会把 `code: 1000` 这类正常响应误判成失败。
   改成先试解析余额、失败再回落到 `code`/`loginUrl`/`success` 判断。

## 设计取舍

- **复用 `ProviderConfig`（token 存整段 Cookie），不新建配置类型**。
  对比 Volcengine 之所以有 `VolcengineProviderConfig`，是因为它需要 cookie + csrfToken
  **两个**凭证字段；MiMo 只有一个 Cookie 字段，套 `ProviderConfig` 即可，
  连带省掉 `VolcengineProviderConfig` 那一整套 IPC 脱敏/双变更协议代码。
  既有先例是 Copilot 的 `fetchCopilotByCookie` 旧路径（`token` 字段存整段 Cookie）。
- 余额型不画进度条：`UsageCard.vue` 的 MiMo 卡照抄 DeepSeek 卡的
  `balance` 行 + `含赠送` 副行；`showUsageBars` 对余额型 provider 本来就只判错误态。

## 影响范围

- `src/shared/types/{usage,config,ipc}.ts`、`src/renderer/src/types/messages.ts` — 加 `mimo` provider 与 `MimoUsageData`
- `src/main/{config,usage-monitor,usage-monitor.test,main,server,pairing}.ts` — 配置读写、轮询抓取、纯函数映射+单测、IPC、WS init、移动端投影
- `src/renderer/src/{Settings.vue,App.vue,TrayHover.vue,components/UsageCard.vue,composables/useUsageState.ts}` — 设置分区、状态聚合、托盘弹窗、余额卡
- `AGENTS.md` — Usage quotas 段落补 MiMo 说明
- `AI代码/徐剑祥/mimo-balance-monitor.md` — 计划副本

## 验证记录

- `npm run typecheck` 通过
- `npm test` 11 文件 / 122 用例通过（新增 `mapMimoBalance` 6 例）
- `npm run build:main` + `npx vite build` 通过
- 真实接口：临时 vitest 用假 Cookie 走 `UsageMonitor.checkAll()`，
  日志打出 `[usage:mimo] fetch failed: 登录态已过期，请重新登录 platform.xiaomimimo.com 并粘贴新的 Cookie`，
  确认 axios → 401 → 中文提示的整条链路通；验证后已删除该临时文件

## 遗留

- **Token Plan 套餐额度未做**：控制台另有 token-plan 详情/用量接口，本次只做余额
- **Cookie 需手动续期**：Chrome 重启后 session cookie 失效，要重新粘贴（与 Volcengine 同样取舍）
- **Android 端未接**：`MobileAppConfig` 已投影 `mimo`，但 `android-app` 侧
  `AppConfig.kt` / `UsageData.kt` / `UsageTab.kt` 还没有 MiMo 渲染
- **响应字段名未最终确认**：单测用的是推测的多种命名。若首次真实抓取后数值明显不对
  （例如大了 100 倍），看主进程日志的 `[usage:mimo] unmappable response:` 或
  `[usage:mimo] fetched data:` 对照真实 body 调整 `MIMO_*_KEYS` 候选名
