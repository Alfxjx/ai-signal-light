# 安卓端同步火山 AK/SK + 新增 MiMo

## 目标

1. 安卓端火山 Ark Coding Plan 支持 **AK/SK 官方 OpenAPI**（与桌面同款），Cookie 降级回退
2. 安卓端**新增 MiMo** provider（余额型）

## 关键决策

**AK/SK 在手机上手动填，不从桌面继承。** 桌面 `toMobileConfig` 继续剔除 AK/SK
（永不过期的控制面密钥不应下发到第二台设备）。

⚠️ **由此带出的坑**：`ScanViewModel` 扫码后是 `saveConfig(incoming)` **整体覆盖**。
桌面不下发 AK/SK，所以重新扫码会把手填的 AK/SK 冲掉 → 改为入站为空时保留本机值。

**签名照搬桌面已验证的结论**：派生链用**原始二进制摘要**做 HMAC 密钥（官方文档正文说 hex、
Java 示例说二进制，桌面侧测试向量判定为二进制）。Kotlin 侧用**同一套官方测试向量**做单测，
等于免费拿到一次跨语言一致性验证。

**MiMo 余额 UI 复用 DeepSeek 余额组件**，不复制 170 行 Compose：抽 `BalanceData` 接口 +
`UsageProviderState<out T>` 协变，组件改名 `BalanceTile` / `BalanceCard`。

**构建验证**：本机 `java` 默认是 1.8，项目要 JVM 17，必须显式
`JAVA_HOME="C:/Program Files/Java/jdk-17.0.2"`。先跑基线再改代码。

## 计划

1. 基线 `assembleDebug` 证明工具链可用
2. `VolcengineSign.kt` + `VolcengineSignTest.kt`（官方测试向量）
3. `VolcengineApi` 接 AK/SK 通道 + 修 cookie jar 只回写 csrfToken 的老 bug
4. MiMo：`MimoUsageData` / `MimoApi` / 仓库接线
5. 余额组件泛型化，DeepSeek/MiMo 共用
6. `UsageTab` / `SettingsScreen` / `SettingsViewModel` 接入
7. `ScanViewModel` 扫码合并
8. `assembleDebug` + `testDebugUnitTest` 验证

## 不做

- 不给安卓加 Codex（桌面有、安卓没有，用户没提）
- 不扩展 `NotificationHelper`（它只覆盖 kimi/minimax/copilot，volcengine/deepseek 本来就没有）
- 不动桌面端 UI
