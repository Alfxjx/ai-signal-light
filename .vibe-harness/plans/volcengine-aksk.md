# 火山引擎改用 AK/SK（官方 OpenAPI + V4 签名），彻底移除 Cookie 通道

## 背景与目标

`main` 上火山的用量查询走的是**控制台网关 + Cookie + x-csrf-token**（会话约一周失效，需要反复从 DevTools 复制）。另一条分支 `origin/opencode-feat` 的提交 `f826630` 已经做过 AK/SK 版本（官方 OpenAPI + V4 签名，桌面/安卓共用同一套官方测试向量），但未合入 main。

本次目标：把 AK/SK 那套移植到 `main`，**桌面端和安卓端都改**，并且：
- **彻底删除 Cookie / x-csrf-token 通道**（不留回退）
- **不带 MiMo**（分支上同批次的小米 MiMo provider 不移植，安卓也不加 MiMo 余额卡）
- 不引入分支上的其他特性（桌面宠物、托盘速览、opencode 插件、Kimi 当日过滤）

数据源固定为官方 OpenAPI：`GET https://open.volcengineapi.com/?Action=GetCodingPlanUsage&Region=cn-beijing&Version=2024-01-01`，host `open.volcengineapi.com`、service `ark`、region `cn-beijing`，签名头 `Host / X-Date / Authorization`（`SignedHeaders=host;x-date`）。

## 一、桌面端（TypeScript）

1. **新增 `src/main/volcengine-sign.ts`** — 从 `origin/opencode-feat` 的 `f826630` 整体取（`git show f826630:src/main/volcengine-sign.ts`）。纯 `node:crypto` 实现，导出 `signVolcengineRequest` / `buildVolcengineUrl` / `formatXDate` / `buildCanonicalQuery` / `SIGNED_HEADERS` / `EMPTY_PAYLOAD_SHA256`。注意派生签名密钥的每一步用**二进制摘要**作 HMAC key（不是 hex 字符串）。
2. **新增 `src/main/volcengine-sign.test.ts`** — 整体取。含官方文档测试向量（`billing.volcengineapi.com` / `QueryBalanceAcct`）锁定 canonicalRequest hash + signature，约 12 个用例，无需新依赖。
3. **`src/main/usage-monitor.ts`**
   - 新增常量 `VOLCENGINE_OPEN_HOST/REGION/SERVICE`、`VOLCENGINE_QUOTA_LEVELS`
   - `fetchVolcengine` 改为**只走 AK/SK**：新增 `fetchVolcengineByAksk(cfg, proxyConfig)`；`accessKey`/`secretKey` 任一为空 → `throw new Error('no_token')`；调用失败时**直接 rethrow 真实错误**（不再吞成 `no_token`，否则 UI 只显示"未配置"而看不到 `InvalidAccessKeyId` 之类）
   - 删除：`VOLCENGINE_API`（控制台网关）、`fetchVolcengineByCookie`、`syncVolcengineCsrf`/`syncVolcengineCookies`、`parseCookieJar`/`mergeCookiePair`
   - `mapVolcengineUsage`：重置时间字段兼容两种命名 `item?.ResetTimestamp ?? item?.ResetTime`，返回结构不变
4. **`src/shared/types/config.ts`** — `VolcengineProviderConfig` 收敛为 `{ accessKey, secretKey, enabled, useProxy }`；`MobileAppConfig` 删掉 `volcengine` 字段（main 的安卓端已删扫码/`DesktopSyncClient`，该投影已无消费方）
5. **`src/main/config.ts`** — `DEFAULTS.volcengine` 换成 `{ accessKey: '', secretKey: '', enabled: true, useProxy: false }`；旧 `config.json` 里遗留的 `cookie`/`csrfToken` 需在加载时**显式剔除**（现有 merge 是 `{...DEFAULTS, ...parsed}`，会把旧字段带进内存对象）
6. **`src/main/pairing.ts`** — `toMobileConfig` 去掉 volcengine 投影（含 AK/SK 剥离逻辑一并删除）
7. **`src/shared/types/ipc.ts`** — `SettingsPayload` 用 `hasVolcengineAccessKey` / `hasVolcengineSecretKey`；`SettingsSavePayload.volcengine` 用 `accessKey / accessKeyChanged / secretKey / secretKeyChanged`；删掉 cookie/csrf 相关字段
8. **`src/main/main.ts`** — `SETTINGS_GET`（约 917 行）与 `SETTINGS_SAVE`（约 998 行）的火山字段改 AK/SK，沿用既有"留空保持原值"协议（GET 走 `maskToken` 掩码 + `has*` 标志，SAVE 走 `keepOrTake`）
9. **`src/renderer/src/Settings.vue`** — 删掉 `volcengineCookie` / `volcengineCsrfToken` 相关 ref、回填、payload 与模板字段；新增 `Access Key ID`、`Secret Access Key` 两个 `settings-field`（带显示/隐藏切换、"留空保持原值"占位），下方 hint：`在 console.volcengine.com/iam/keymanage/ 创建访问密钥（区域 cn-beijing）。AK/SK 长期有效，无需再维护 Cookie。`
10. **`src/main/usage-monitor.test.ts`** — 保留/补充 `mapVolcengineUsage` 的 `ResetTime` 兼容用例；不加 cookie 相关用例
11. **`AGENTS.md`** — Usage quotas 段火山描述改为 AK/SK 官方 OpenAPI + V4 签名，注明 Cookie 通道已移除、AK/SK 不下发手机（安卓需手动填写）

## 二、安卓端（Kotlin）

12. **新增 `app/src/main/java/com/aisignallight/data/remote/VolcengineSign.kt`** — 整体照搬分支版本（`object VolcengineSign`，纯 `MessageDigest` + `Mac`，无新依赖；与 TS 版算法逐位一致）
13. **新增 `app/src/test/java/com/aisignallight/data/remote/VolcengineSignTest.kt`** — 整体照搬（JUnit4，约 14 个 `@Test`，沿用同一套官方测试向量；`testImplementation(libs.junit)` 已存在，不需要改 build.gradle）
14. **`domain/model/AppConfig.kt`** — `VolcengineProviderConfig` = `{ accessKey = "", secretKey = "", enabled = true, useProxy = false }`（有默认值，`SecureConfigStore` 的 `ignoreUnknownKeys` 会自动忽略旧 cookie 字段）
15. **`data/remote/VolcengineApi.kt`** — 改为 `suspend fun fetch(config: VolcengineProviderConfig, proxyUrl: String?): VolcengineUsageData`：AK/SK 齐备才发请求（`VolcengineSign.sign(...)` → `client.get(buildUrl(...))`，注意签名头要用 `signed.headers.forEach { header(k, v) }`，裸 `headers` 会解析到 `HttpRequestBuilder.headers`）；删 `URL` 常量、`refreshCsrfFromResponse`、cookie jar 相关；保留 `ResponseMetadata.Error` 与 HTTP ≥400 的中文错误提示；抽出 `mapQuota` 并做 `ResetTimestamp`/`ResetTime` 兼容；`ApiException` 复用 `CopilotApi.kt` 里的定义
16. **`data/repository/UsageRepositoryImpl.kt`** — `fetchVolcengine` 的凭证判断改为 AK/SK 齐备（否则 `no_token`），调用改为 `volcengineApi.fetch(cfg, proxy)`；错误原样透传给卡片
17. **`ui/settings/SettingsViewModel.kt`** — `updateVolcengineConfig(accessKey, secretKey, useProxy)`
18. **`ui/settings/SettingsScreen.kt`** — `ProviderDialog` 支持 AK/SK 两个字段（新增 `showAkskFields` + `initialAccessKey/initialSecretKey`，`onConfirm` 多回传两值；或为火山单独写 `VolcengineConfigDialog`）；`AppConfig.tokenValue(VOLCENGINE)` 改为 `volcengine.accessKey`；`isConfigured(VOLCENGINE)` 改为 `accessKey.isNotBlank() && secretKey.isNotBlank()`
19. **`res/values/strings.xml`** — 删 `settings_cookie_label` / `settings_csrf_label` / 旧 DevTools 帮助文案；新增 AK/SK 标签与帮助文案（简体中文，内容同桌面端 hint）

## 三、兼容性与影响

- **旧配置**：桌面 `config.json` 里的 `volcengine.cookie/csrfToken` 会被丢弃；安卓加密配置里的旧字段被忽略。用户需要**两端各填一次 AK/SK**（桌面不下发到手机）
- **未配置时的表现**：桌面/安卓火山卡片走既有的"未配置 Token"分支（`no_token`），文案已在上一轮重构里统一
- **失效时的表现**：AK/SK 无效会显示火山返回的真实错误码（如 `InvalidAccessKeyId` / `SignatureDoesNotMatch`），不再是笼统的登录过期
- **不受影响**：Kimi / MiniMax / Copilot / DeepSeek 四个 provider、Glance 小组件（数据源是同一份 `UsageSnapshot`）、阈值通知

## 四、验证

1. 桌面：`npm run typecheck` + `npm test`（重点看 `volcengine-sign.test.ts` 官方向量是否通过）
2. 安卓：`cd android-app && ./gradlew testDebugUnitTest assembleDebug`（重点看 `VolcengineSignTest`）
3. 签名一致性：桌面与安卓实现同一套官方测试向量，两边单测通过即等价
4. 真机/真实账号验证（需要你提供 AK/SK，我无法代办）：桌面设置里填 AK/SK → 火山卡片出数据；手机设置里填同一对 AK/SK → 卡片出数据

## 五、执行方式

按"桌面端 → 安卓端"两个阶段派 coder subagent（模型 `fangzhou/deepseek-v4.1-flash`）执行；每个 subagent 只改代码、不跑构建（上一轮教训：构建由主 agent 用后台任务跑），主 agent 负责阶段间编译/测试验证与最终收尾（含 `.vibe-harness` 记录）。
