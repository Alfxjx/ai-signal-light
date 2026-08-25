# Kimi 用量接口切换为 coding/v1/usages + API Key

## 时间
2026-08-25

## 背景
Kimi 关闭了旧的网页 session token 用量接口（GetSubscriptionStats），
且 30 天 JWT 过期机制不再适用。改用开放平台 API Key 认证的新接口
`GET https://api.kimi.com/coding/v1/usages`（与 MiniMax 相同的手填 Key 模式）。

## 改动摘要

### 桌面端
- `src/main/usage-monitor.ts`
  - `KIMI_API` → `https://api.kimi.com/coding/v1/usages`
  - `fetchKimi` 由 POST 改 GET，只带 `Authorization: Bearer <API Key>`（去掉 Content-Type / Connect-Protocol-Version）
  - `mapKimiSubscriptionStats` → `mapKimiUsages`：解析新结构 `usage`(7d) 与 `limits[0].detail`(5h)，limit/used/remaining 为字符串数字
- `src/shared/types/usage.ts`：`KimiUsageData` 移除 `total` 字段（精简为两行）
- 删除 `src/main/kimi-login.ts`（内嵌登录窗口 + decodeJwtExp）
- `src/main/main.ts`：移除 kimi-login import、`sendKimiLoginResult`、`KIMI_LOGIN_START` handler、SETTINGS_GET 的 `kimiTokenExp`
- `src/main/preload.ts`：移除 `kimiStartLogin` / `onKimiLoginResult` / KIMI_LOGIN_* 本地通道常量
- `src/shared/types/ipc.ts`：移除 `kimiTokenExp`、`KimiLoginResult`、`kimiStartLogin`/`onKimiLoginResult`、KIMI_LOGIN_* 通道
- `src/renderer/src/Settings.vue`：字段改"API Key"，移除"登录 Kimi 账号自动获取"按钮、`kimiLoginStatus`、`kimiTokenExpText` 提示
- `src/renderer/src/components/UsageCard.vue`：移除 Kimi"全部配额"(all plan / total) 进度条与 `kimiTotalPace`（顺带清理 `inferAllPlanWindowMs` 无引用 import）
- `src/main/usage-monitor.test.ts`：`mapKimiSubscriptionStats` 用例 → `mapKimiUsages`

### Android
- `KimiApi.kt`：URL 改 `https://api.kimi.com/coding/v1/usages`、POST→GET、解析 `usage`/`limits[0].detail`，数值为字符串用 `content.toIntOrNull()`
- `domain/model/UsageData.kt`：`KimiUsageData` 移除 `total`
- `ui/home/UsageTab.kt`：KimiCard 移除 `total.toBarItem("全部配额", ...)` 行
- `data/notification/NotificationHelper.kt`：kimiAlerts 移除"全部配额"告警

## 字段映射（新接口只有两档）
- `codingWeekly` ← `usage`（7 天周期窗口）
- `codingFiveHour` ← `limits[0].detail`（5 小时窗口）
- 「全部配额」行在两端 UI 与 Android 通知中移除

## 影响范围
- 桌面端设置页：Kimi 不再有自动登录，需手动在开放平台创建 API Key 填入
- 手机 app 配置经 WS 从桌面同步，Kimi token 字段沿用 → 请求时按 API Key 使用
- 认证语义变更：API Key（长期有效）替代 30 天 JWT，Token 有效期提示已移除

## 验证
- `npm test`：6 文件 63 用例通过
- `npm run typecheck`：vue-tsc + tsc 无错误
- `./gradlew.bat :app:compileDebugKotlin`：exit 0

## 备注
- 新接口响应 `limit/used/remaining` 为字符串，桌面用 `Number()`、Android 用 `content.toIntOrNull()` 解析
- 旧 `www.kimi.com/apiv2/...` 两套接口（GetSubscriptionStats / BillingService GetUsages）均不再使用