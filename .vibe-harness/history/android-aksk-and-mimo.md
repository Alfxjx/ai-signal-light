# 安卓端同步火山 AK/SK + 新增 MiMo

- 时间：2026-09-28
- 范围：安卓端火山 Coding Plan 接入 AK/SK 官方 OpenAPI（Cookie 降级回退）；新增 MiMo 余额 provider；顺带修安卓侧 cookie jar 只回写 csrfToken 的老 bug、修重新扫码冲掉手填 AK/SK 的问题

## 实际改动

| 文件 | 改动 |
|------|------|
| `data/remote/VolcengineSign.kt`（新） | Kotlin 版 V4 签名，镜像桌面 `volcengine-sign.ts`。`rfc3986` 自建编码表（不用 `URLEncoder`，它把空格编成 `+` 且不转义 `!'()*`）；派生链**用原始二进制摘要**做 HMAC 密钥 |
| `app/src/test/.../VolcengineSignTest.kt`（新） | 14 条用例，与桌面 `volcengine-sign.test.ts` 断言**同一套官方文档测试向量**，含 CanonicalRequest 哈希 `43171c16…` 与 Signature `1eda9e7e…` |
| `domain/model/AppConfig.kt` | `VolcengineProviderConfig` 加 `accessKey`/`secretKey`；`AppConfig` 加 `mimo: ProviderConfig`（token 存整段 Cookie） |
| `domain/model/UsageData.kt` | 新增 `MimoUsageData`；抽 `BalanceData` 接口（`DeepseekUsageData`/`MimoUsageData` 实现）；`UsageProviderState<T>` 放宽为 `<out T>`；`UsageSnapshot` 加 `mimo`；`ProviderId` 加 `MIMO` |
| `data/remote/MimoApi.kt`（新） | `GET platform.xiaomimimo.com/api/v1/balance`；解析照搬桌面 `mapMimoBalance` 的容错（剥 `data`/`result` 信封、key 去下划线忽略大小写、解析失败时按 `code`/`message` 判登录态） |
| `data/remote/VolcengineApi.kt` | 入口改 `fetch(config, proxyUrl)`：AK/SK 齐备优先 → 失败回退 Cookie；AK/SK 缺档抛错回退；解析兼容 `ResetTimestamp`/`ResetTime`；`refreshCsrfFromResponse` → `syncCookies` 合并整份 cookie jar；新增顶层 `parseCookieJar`/`mergeCookiePair` |
| `data/repository/UsageRepositoryImpl.kt` | 注入 `MimoApi` + `fetchMimo`；`fetchAll` 加 `async`；`fetchVolcengine` 的 no_token 判定改为「AK/SK 与 Cookie 都没配」才算 |
| `ui/components/BalanceCard.kt`（新，替代 `DeepseekBalance.kt`） | `DeepseekBalanceTile/Card` → `BalanceTile/BalanceCard(title, state)`；`deepseekSymbol` → `currencySymbol` |
| `ui/home/UsageTab.kt` | 网格/单列各加 MiMo 余额卡；`allEmpty`/`allNoToken` 纳入 mimo |
| `ui/settings/SettingsViewModel.kt` / `SettingsScreen.kt` | 火山区加 AK/SK 密码框 + 说明；`ProviderSection` 加 `tokenLabel` 参数；新增 MiMo 区块 |
| `ui/scan/ScanViewModel.kt` | 扫码落盘从整体覆盖改为**合并**：入站 AK/SK 为空时保留本机值 |
| `AGENTS.md` | 修正「AK/SK 不下发手机端」的表述：手机端另有同款通道、需手填、重扫不覆盖 |

## 关键决策

- **AK/SK 手机上手动填**（用户确认）：桌面 `toMobileConfig` 继续剔除，永不过期的控制面密钥不落到第二台设备
- **跨语言一致性靠同一套测试向量**：官方文档 GET 示例的 AK/SK/X-Date/哈希/签名五项公布值在 TS 与 Kotlin 各断言一次，任何一侧跑偏都会立刻暴露——这次 Kotlin 一次通过，反过来再次确认了「派生链用二进制摘要」的结论
- **MiMo 复用余额卡**而非复制 Compose：抽 `BalanceData` 接口 + `UsageProviderState` 协变（`T` 只在 `data: T?` 这个协变位，放宽安全）
- **AK/SK 缺档即回退 Cookie**：与桌面同策略，避免展示 0 误导

## 验证

- `assembleDebug` **BUILD SUCCESSFUL**（JAVA_HOME 指向 JDK 17；本机默认 `java` 是 1.8，必须显式指定）
- `testDebugUnitTest` 通过，测试报告逐类核对：
  - `VolcengineSignTest` **14 用例 / 0 失败 / 0 错误**
  - `PaceUtilsTest` 6、`PercentUtilsTest` 4（既有，无回归）
- `grep -E "^w:|^e:"` 全清，无编译警告
- 桌面侧 `npm run typecheck` + `npm test` 148 passed（本任务只改 `android-app/**`）

## 排错记录（踩过的坑）

1. Ktor `get { }` 块里裸写 `headers` 会解析到 `HttpRequestBuilder.headers`，不是自己的 map → 必须 `signed.headers`
2. Kotlin 一个类只能有一个 `companion object`，`VolcengineApi` / `MimoApi` 各踩一次 → 常量合并成一个 companion，cookie jar 工具函数提到文件顶层
3. `Set<String>.associateBy { normalizeKey(it) }` 得到的是 `Map<String, String>`（值是原元素），要取 JSON 值必须 `entries.associate { normalizeKey(it.key) to it.value }`
4. Kotlin data class 实现接口时字段要加 `override`（与 TS 的 structural typing 直觉不同）

## 遗留

- **安卓 UI 效果未目视验证**：无模拟器/真机截图，余额卡与设置页布局需装包实机确认
- 安卓端仍无 Codex provider（桌面有），用户未要求
- `NotificationHelper` 只覆盖 kimi/minimax/copilot，volcengine/deepseek/mimo 都没有阈值告警——既有行为，本次未扩展
