# 设计文档：火山引擎 Ark Coding Plan 用量监控

日期：2026-08-25
范围：Electron 桌面端 + Android 手机端

## 背景与目标

火山引擎方舟控制台 `订阅 / Coding Plan` 页面的「套餐用量限额」数据，是通过登录态接口
`GetCodingPlanUsage` 获取的。本功能在现有 AI 状态监控两端（Electron、Android）中新增一个
`volcengine` 用量 provider，让用户在两端的设置里手动粘贴 Cookie + x-csrf-token，各自独立查询并展示。

### 接口事实（已在用户浏览器实测）

- URL：`POST https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage`
- 需要的凭证/头：整段 Cookie（登录态）+ `x-csrf-token` 头
- 返回体 `Result.QuotaUsage[]`，每个元素：

| 字段 | 含义 |
|------|------|
| `Level` | `"session"` / `"weekly"` / `"monthly"` |
| `Percent` | 已用百分比（0-100，正是 UI 需要的「已用 %」） |
| `Cap` | 配额上限 |
| `ResetTimestamp` | 秒级 Unix 重置时间戳 |
| `RewardTotalPercent` | 奖励额度百分比（暂不展示） |

- 页面还返回 `Status`（Running）、`HasReward` 等，本功能暂不展示。

## 数据模型

### Electron（`src/shared/types/usage.ts`）

```ts
type ProviderId = 'kimi' | 'minimax' | 'copilot' | 'deepseek' | 'codex' | 'volcengine';

interface VolcengineUsageData {
  session:  UsageMetric;  // 会话周期
  weekly:   UsageMetric;  // 周周期
  monthly:  UsageMetric;  // 月周期
}
// ProviderUsageData / UsageSnapshot 加入 volcengine
```

映射规则（纯函数，供单测）：`Percent → percent`、`Cap → limit`、`ResetTimestamp → 绝对时间 ISO 字符串`。
`limit==0` 时按现有 `calcPercent` 约定返回 0。进度条宽度与其它 provider 一致 = 已用 %。

### Android（`android-app/.../domain/model/UsageData.kt`）

对称新增 `VolcengineUsageData`、`ProviderId.VOLCENGINE`、`ProviderUsageData.VolcengineData`，
`UsageSnapshot.volcengine`。添加 `VolcengineApi`（Ktor POST + 映射解析）。

## 配置模型

现有 `ProviderConfig` 只有一个 `token` 字段，装不下两个凭证。新增专用配置类型：

```ts
interface VolcengineProviderConfig {
  cookie: string;      // 浏览器整段 Cookie（半角分号分隔）
  csrfToken: string;   // x-csrf-token 值
  enabled: boolean;
  useProxy: boolean;   // 沿用全局代理
}
```

- Electron：`config.ts` 共享类型 `AppConfig.volcengine`、`ConfigPartial`、`DEFAULTS`、`ConfigStore.load/update`、ipc 类型、`Settings.vue` 全链路新增。
- Android：`AppConfig.kt` 加 `volcengine: VolcengineProviderConfig`（`@Serializable`）；`SecureConfigStore` 复用现有 JSON 序列化，无需改动；`SettingsScreen` / `SettingsViewModel` 新增分区（两个输入框 + 启用 + 代理）。

### 桌面→手机 WS 同步

`MobileAppConfig`（`src/shared/types/config.ts` + `src/main/pairing.ts` 投影）把 `volcengine` 一并纳入，
使「扫码导入桌面配置」可将桌面凭证同步到手机，与 kimi/minimax/copilot 一致。
手机本地设置仍可手动覆盖。

## Electron 轮询（`src/main/usage-monitor.ts`）

- 新增常量 `VOLCENGINE_API`（上述 URL），复用共享 `http` 实例与 `BROWSER_HEADERS`，追加 `Cookie`、`x-csrf-token`，另加 `Content-Type` 与 `Origin/Referer`（浏览器风格）。
- 新增 `fetchVolcengine` + `mapVolcengineUsage` 纯函数；纳入 `checkAll` 与 `state` 快照。
- 复用 `_safeRun` 的 enabled 分支；`cookie` 或 `csrfToken` 任一为空 → `no_token`。
- **鉴权失败专属提示**：判定条件为「HTTP status ∈ {401,403} 或返回体 JSON 含 `ResponseMetadata.Error`」。
  命中时错误文案固定为「登录态已过期，请更新 Cookie / x-csrf-token」；其余（网络/超时/其它 4xx/5xx）沿用通用错误。

## UI

- Electron `Settings.vue`：新「火山引擎 (Ark Coding Plan)」分区，Cookie、x-csrf-token 两个密文输入框 + 启用 + 全局代理开关，与现有 provider 分区样式一致。
- Electron `UsageCard`：火山引擎卡片三根进度条（会话 / 周 / 月），每档显示已用 %，并带重置时间（绝对时间）。
- Android `UsageTab` / `ProviderCard`：火山引擎卡片同样三档。
- 用户可见文案统一使用简体中文。

## 测试与验证

- Electron：`mapVolcengineUsage` 单测（沿用 `src/main/usage-monitor.test.ts` 模式），使用真实响应体 fixture。
- 真实数据校验：用浏览器实测抓到的 QuotaUsage 三段作为 fixture 断言映射结果。
- Android：`VolcengineApi` 解析逻辑抽纯函数并加单元测试；`./gradlew assembleDebug` 确认编译通过。
- 两端 `npm run typecheck`（Electron）与 Android 编译通过后再交付。

## 不做的事（YAGNI）

- 不展示 `RewardTotalPercent`、`HasReward`、`Status`、`Reward*`。
- 不把 region/version 做成可配置（硬编码 `cn-beijing` / `2024-01-01`，与其它 provider 硬编码 URL 一致）。
- 不做浏览器自动采集凭证；凭证仅手动粘贴。
- 不新增 provider 通用配置重构（避免过度抽象）。