# Kimi 用量接口切换为 coding/v1/usages + API Key

## 目标
把桌面端与 Android 端 Kimi 用量获取从「网页 session token + GetSubscriptionStats」改为
「手动 API Key + `https://api.kimi.com/coding/v1/usages`(GET)」,并移除网页登录窗口逻辑;
UI 由三行精简为两行(去掉「全部配额」)。

## 用户已拍板(AskUserQuestion)
1. 认证:移除 Kimi 网页登录逻辑 → 与 MiniMax 一致,纯手动填 API Key。
2. 字段映射:精简为两行 —— 去掉「全部配额」,仅保留「本周编码」(usage,7d)与「5 小时窗口」(limits[0],5h)。

## 新接口
```
GET https://api.kimi.com/coding/v1/usages
Authorization: Bearer <API Key>
```
响应(与旧 desktop 共用结构):
- `usage`: { limit, used, remaining, resetTime } → `codingWeekly`(7d)
- `limits[0].detail`: { limit, used, remaining, resetTime } → `codingFiveHour`(5h)
- `total` 字段保留但不再渲染(`totalQuota` 为空对象)。

## 改动清单
### 桌面端
- `src/main/usage-monitor.ts`
  - `KIMI_API` → `https://api.kimi.com/coding/v1/usages`
  - `fetchKimi` 改 GET,Bearer API Key(仿 MiniMax,去 Connect-Protocol-Version)
  - `mapKimiSubscriptionStats` → `mapKimiUsages`,解析 usage/limits[0].detail
- `src/main/kimi-login.ts` → 删除整文件
- `src/main/main.ts` → 移除 kimi-login import、sendKimiLoginResult、KIMI_LOGIN_START handler、SETTINGS_GET 的 kimiTokenExp
- `src/main/preload.ts` → 移除 kimiStartLogin / onKimiLoginResult
- `src/shared/types/ipc.ts` → 移除 kimiTokenExp、KimiLoginResult、kimiStartLogin/onKimiLoginResult、KIMI_LOGIN_* 通道
- `src/renderer/src/Settings.vue` → 移除「登录 Kimi 账号自动获取」按钮、kimiLoginStatus、kimiTokenExp 提示
- `src/renderer/src/components/UsageCard.vue` → 移除 Kimi「全部配额」(total)行
- `src/main/usage-monitor.test.ts` → 更新 mapKimi 用例

### Android
- `KimiApi.kt` → URL 改新接口,GET,解析 usage/limits[0],token 来自 WS 同步配置
- `UsageTab.kt` → KimiCard 去掉 total.toBarItem
- `NotificationHelper.kt` → kimiAlerts 去掉「全部配额」total 行

## 验证
- `npm test`(桌面 main 单测)
- `npm run typecheck`
- Android `:app:compileDebugKotlin`(编译检查)