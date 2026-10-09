# 火山引擎改用 AK/SK（官方 OpenAPI + V4 签名），彻底移除 Cookie 通道

- 时间：2026-10-09
- 计划：[plans/volcengine-aksk.md](../plans/volcengine-aksk.md)
- 来源：移植分支 `origin/opencode-feat` 的提交 `f826630`（火山 AK/SK 部分），**不带** MiMo / 桌面宠物 / 托盘速览 / opencode 插件

## 背景

main 上火山的用量查询走控制台网关 + Cookie + x-csrf-token（会话约一周失效，要反复从 DevTools 复制）。`f826630` 已有官方 OpenAPI + V4 签名版本，本次把该通道搬回 main，并按用户要求**彻底删掉 Cookie 通道**（不留回退）。

数据源：`GET https://open.volcengineapi.com/?Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01`，host `open.volcengineapi.com` / region `cn-beijing` / service `ark`，签名头 `Host / X-Date / Authorization`（`SignedHeaders=host;x-date`）。

## 桌面端（TypeScript）

| 文件 | 改动 |
|---|---|
| `src/main/volcengine-sign.ts` | 新增（整体取自 `f826630`）：纯 `node:crypto` 的 V4 签名，导出 `signVolcengineRequest` / `buildVolcengineUrl` / `formatXDate` / `buildCanonicalQuery` / `SIGNED_HEADERS` / `EMPTY_PAYLOAD_SHA256`。派生签名密钥每步用**二进制摘要**作 HMAC key |
| `src/main/volcengine-sign.test.ts` | 新增：官方文档测试向量（`billing.volcengineapi.com` / `QueryBalanceAcct`）锁定 canonicalRequest hash / signature，12 个用例 |
| `src/main/usage-monitor.ts` | 新增 `VOLCENGINE_OPEN_HOST/REGION/SERVICE`、`VOLCENGINE_QUOTA_LEVELS` 与 `fetchVolcengineByAksk`；`fetchVolcengine` 只走 AK/SK，缺任一项 → `no_token`，**失败直接 rethrow 真实错误**（不再吞成 no_token）；删除 `VOLCENGINE_API`、`fetchVolcengineByCookie`、`syncVolcengineCsrf`、cookie jar 相关；`mapVolcengineUsage` 重置字段兼容 `ResetTimestamp` / `ResetTime` |
| `src/shared/types/config.ts` | `VolcengineProviderConfig` = `{accessKey, secretKey, enabled, useProxy}`；`MobileAppConfig` 删掉 volcengine 字段（安卓已无消费端） |
| `src/main/config.ts` | `DEFAULTS.volcengine` 换 AK/SK；加载旧配置时**显式挑键**，旧 `cookie`/`csrfToken` 不再进内存（后续给该配置加字段必须同步这个挑选列表） |
| `src/main/pairing.ts` | `toMobileConfig` 去掉 volcengine 投影 |
| `src/shared/types/ipc.ts` | `SettingsPayload` → `hasVolcengineAccessKey` / `hasVolcengineSecretKey`；`SettingsSavePayload.volcengine` → `accessKey/accessKeyChanged/secretKey/secretKeyChanged` |
| `src/main/main.ts` | `SETTINGS_GET` 掩码 AK/SK + `has*`；`SETTINGS_SAVE` 用 `keepOrTake` 的"留空保持原值"协议 |
| `src/renderer/src/Settings.vue` | 删 Cookie / x-csrf-token 字段与文案；新增 Access Key ID / Secret Access Key 两字段（含显示隐藏切换、留空保持原值、帮助 hint） |
| `src/main/usage-monitor.test.ts` | 补一条 `ResetTime` 命名兼容用例 |

## 安卓端（Kotlin）

| 文件 | 改动 |
|---|---|
| `data/remote/VolcengineSign.kt` | 新增：整体照搬分支版本，`object VolcengineSign`（`Input`/`Result` + `rfc3986`/`canonicalQuery`/`formatXDate`/`sha256Hex`/`sign`/`buildUrl`），零新依赖 |
| `app/src/test/.../VolcengineSignTest.kt` | 新增：同一套官方测试向量，14 个 JUnit4 用例 |
| `domain/model/AppConfig.kt` | `VolcengineProviderConfig` = `{accessKey, secretKey, enabled, useProxy}`；旧 `cookie`/`csrfToken` 由 `ignoreUnknownKeys` 自动忽略（无迁移代码） |
| `data/remote/VolcengineApi.kt` | 重写为纯 AK/SK：`fetch(config, proxyUrl)`、companion 常量、签名 GET `open.volcengineapi.com`、错误码透传（`AK/SK 调用失败: ${code}`）、`mapQuota` 抽函数并兼容 `ResetTimestamp`/`ResetTime`；删 `URL`、cookie 版 `fetch`、`refreshCsrfFromResponse` |
| `data/repository/UsageRepositoryImpl.kt` | 火山凭证判断改 AK/SK 齐备，调用改 `fetch(cfg, proxy)` |
| `ui/settings/SettingsViewModel.kt` | `updateVolcengineConfig(accessKey, secretKey, useProxy)` |
| `ui/settings/SettingsScreen.kt` | 火山走新增的专用 `VolcengineConfigDialog`（AK/SK + 代理开关）；`ProviderDialog` 简化回 token + 代理；`tokenValue`/`isConfigured(VOLCENGINE)` 改判 AK/SK |
| `widget/UsageWidget.kt` | 小组件里火山的"已配置"判断同步改为 AK/SK（不改会编译不过） |
| `res/values/strings.xml` | 删 `settings_cookie_label` / `settings_csrf_label`；新增 AK/SK 标签，`settings_volcengine_help` 换文案 |

## 影响与兼容

- **旧配置**：桌面 `config.json` 的 `volcengine.cookie/csrfToken` 被丢弃，安卓加密配置里的旧字段被忽略。用户需**两端各填一次 AK/SK**（桌面不下发到手机）
- **未配置**：火山卡片走既有"未配置 Token"分支；**AK/SK 无效**时显示火山真实错误码（`InvalidAccessKeyId` / `SignatureDoesNotMatch` 等），不再是笼统"登录态已过期"
- **不受影响**：Kimi / MiniMax / Copilot / DeepSeek 四个 provider、Glance 小组件、阈值通知
- **遗留可清理**（本次未动）：`android-app/app/src/main/res/xml/network_security_config.xml` 与 `res/raw/volcengine_*.pem` 是为 `console.volcengine.com` 证书链加信任锚的，该域名已不再调用（改用 `open.volcengineapi.com`，走系统 CA）

## 验证

- 桌面：`npm run typecheck` 通过；`npm test` 105 个用例全绿（含 `volcengine-sign.test.ts` 12 个官方向量）
- 安卓：`./gradlew testDebugUnitTest assembleDebug` BUILD SUCCESSFUL；`VolcengineSignTest` 14 个用例通过
- 待真机验证：桌面/手机各填一次 AK/SK → 火山卡片（session/weekly/monthly 三档）出数据
