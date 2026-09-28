# 实施计划：小米 MiMo 账户余额监控

## 目标

AI状态监控 已支持 Kimi / MiniMax / Copilot / DeepSeek / Codex / 火山引擎 六家用量。
新增第七家 **小米 MiMo**（pay-as-you-go 余额型），在主面板 Usage 卡片与托盘 hover 弹窗
展示当前账户余额与赠送部分。

## 原理（已实测端点存在）

- **余额只由 Web 控制台暴露**：调模型的 `sk-` API Key（`api.xiaomimimo.com/v1`）查不到余额。
  唯一入口是控制台接口
  `GET https://platform.xiaomimimo.com/api/v1/balance`
- **鉴权走小米账号会话 Cookie**（非 API Key）：整段 `Cookie` 请求头，需含
  `api-platform_serviceToken` + `userId`，可选 `api-platform_ph` / `api-platform_slh`。
  与 `fetchCopilotByCookie` 同构，故复用 `ProviderConfig.token` 存整段 Cookie，
  不引入新的配置类型（对比 Volcengine 需要 cookie + csrfToken 两个字段才另起类型）。
- **未授权响应实测**：`HTTP 401` + `{"code":401,"loginUrl":"https://account.xiaomi.com/..."}`
- **响应结构未公开**，故 `mapMimoBalance` 做两层容错：
  1. 剥 `data` / `result` 信封（最多 3 层），兼容 `balance` 本身是嵌套对象
  2. 字段名按「去下划线 + 忽略大小写」匹配（`totalBalance` / `total_balance` / `TotalBalance` 等价）
  金额默认按元；若响应带 `scale`/`unit` 倍率字段则按其换算。
  总额与「充值/赠送」只给其一时，另一项用减法补齐。
- 业务错误码判断放在**映射失败之后**：控制台成功码未必是 0，先试解析再判 `code`/`loginUrl`，
  避免把 `code: 1000` 这类成功响应当成失败。

## 改动文件

### 新建
- `AI代码/徐剑祥/mimo-balance-monitor.md` — 计划副本（对齐用户级规则）

### 修改
- `src/shared/types/usage.ts` — `ProviderId` 加 `mimo`；新增 `MimoUsageData`（余额型，同 DeepSeek）；并入 `ProviderUsageData`
- `src/shared/types/config.ts` — `AppConfig.mimo` / `MobileAppConfig.mimo` 用 `ProviderConfig`；`ConfigPartial` Omit 列表加 `'mimo'` + `mimo?`
- `src/shared/types/ipc.ts` — `SettingsPayload.hasMimoCookie`；`SettingsSavePayload.mimo`
- `src/renderer/src/types/messages.ts` — 再导出 `MimoUsageData`；`UsageState.mimo` / `UsageInitPayload.mimo`
- `src/main/config.ts` — `DEFAULTS.mimo` / `_load` 合并 / `update` 分支
- `src/main/usage-monitor.ts` — `MIMO_BALANCE_API`、`fetchMimo`、`mapMimoBalance` + 辅助（`toFiniteNumber`/`normalizeKey`/`pickNumber`/`pickString`/`round2`）、`checkAll` 与 `state` 各加一项
- `src/main/usage-monitor.test.ts` — `mapMimoBalance` 6 个用例（data 信封 / snake_case / 嵌套 balance / scale 换算 / 仅总额 / 无余额字段抛错）
- `src/main/main.ts` — `SETTINGS_GET` 返回脱敏 `mimo` + `hasMimoCookie`；`SETTINGS_SAVE` 走 `tokenChanged` 协议
- `src/main/server.ts` — `usageInit` 捎带 `mimo` 快照与 `enabled.mimo`
- `src/main/pairing.ts` — `toMobileConfig` 投影 `mimo`（纳入桌面→手机 WS 同步契约）
- `src/renderer/src/Settings.vue` — 复用 `makeProvider()` 模式新增「小米 MiMo」分区（含抓 Cookie 步骤提示）
- `src/renderer/src/App.vue` — `usage.mimo` 初值与 `usageInit` 赋值
- `src/renderer/src/composables/useUsageState.ts` — `mimo` ref、`init`/`usageInit`/`usageUpdate` 三条分支、`isProviderVisible` 联合、`lastUpdatedTs`、对外导出
- `src/renderer/src/components/UsageCard.vue` — MiMo 余额卡（照 DeepSeek 余额样式，无进度条）；`usageLastTs` / `allNoToken` 纳入
- `src/renderer/src/TrayHover.vue` — 托盘 hover 弹窗加 MiMo 余额行
- `.vibe-harness/index.md` — 任务索引

## 步骤

1. shared 类型四件套（usage / config / ipc / messages）
2. `config.ts` 三处接线
3. `usage-monitor.ts`：`mapMimoBalance` 纯函数 + `fetchMimo`
4. `usage-monitor.test.ts` 补单测并跑 `npm test`
5. 主进程接线：`main.ts` / `server.ts` / `pairing.ts`
6. 渲染层：`Settings.vue` / `App.vue` / `useUsageState.ts` / `UsageCard.vue` / `TrayHover.vue`
7. 验证：`npm run typecheck` + `npm test` + `npm run build:main` + `npx vite build`
8. 真实接口验证：临时 vitest 用假 Cookie 打 `/api/v1/balance`，确认 401 → 中文提示；验证后删除临时文件

## 未覆盖（后续可做）

- **Token Plan 套餐额度**：控制台另有 token-plan 详情/用量接口，本次只做余额
- **Cookie 自动续期**：Chrome 重启后 session cookie 失效，需用户重新粘贴（与 Volcengine 同样的取舍）
- **Android 端**：`MobileAppConfig` 已投影 `mimo`，但 `android-app` 的 `AppConfig`/`UsageData`/
  `UsageTab.kt` 尚未加 MiMo 渲染
