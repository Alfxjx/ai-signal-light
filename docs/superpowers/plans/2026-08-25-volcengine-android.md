# Android：火山引擎 Ark Coding Plan 用量监控 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原生 Android App 新增 `volcengine` 用量 provider：手机设置里粘贴 Cookie + x-csrf-token → 本地加密存储 → 自己轮询 `GetCodingPlanUsage` → Usage 页展示 session/weekly/monthly 三档。

**Architecture:** 完全复用现有 Kimi/MiniMax/Copilot 链路。新增 `VolcengineProviderConfig`（cookie/csrfToken/enabled/useProxy，`@Serializable`）挂到 `AppConfig`；新增 `VolcengineApi`（Ktor POST）；`UsageRepositoryImpl` 注入并并行拉取；`SettingsScreen/ViewModel` 新增分区；`UsageTab` 新增三档卡片。字段名与 Electron 侧 `MobileAppConfig.volcengine` 保持一致，使扫码导入可无缝解析。

**Tech Stack:** Kotlin、Jetpack Compose、Ktor、Hilt、kotlinx.serialization、Room/EncryptedSharedPreferences。

参考规格：`docs/superpowers/specs/2026-08-25-volcengine-coding-plan-usage-design.md`
路径基座：`android-app/app/src/main/java/com/aisignallight/`（下称 `{base}`）

---

### Task 1: 数据模型 —— UsageData.kt 新增 volcengine

**Files:**
- Modify: `{base}/domain/model/UsageData.kt`

- [ ] **Step 1: 新增行为类型与 ProviderId**

  在 `CopilotUsageData` 后新增：

  ```kotlin
  data class VolcengineUsageData(
      val session: UsageMetric = UsageMetric(),
      val weekly: UsageMetric = UsageMetric(),
      val monthly: UsageMetric = UsageMetric()
  )
  ```

  `ProviderId` 枚举加入：
  ```kotlin
  VOLCENGINE("volcengine")
  ```

  `ProviderUsageData` sealed class 加入：
  ```kotlin
  data class VolcengineData(val data: VolcengineUsageData) : ProviderUsageData() {
      override val providerId: ProviderId = ProviderId.VOLCENGINE
  }
  ```

  `UsageSnapshot` 加入字段：
  ```kotlin
  val volcengine: UsageProviderState<VolcengineUsageData>? = null
  ```

- [ ] **Step 2: 编译**

  Run: `cd android-app && ./gradlew compileDebugKotlin`
  Expected: 通过。

---

### Task 2: 配置模型 —— AppConfig.kt 新增 volcengine

**Files:**
- Modify: `{base}/domain/model/AppConfig.kt`

- [ ] **Step 1: 新增配置类型与字段**

  在 `ProviderConfig` 后新增：

  ```kotlin
  @Serializable
  data class VolcengineProviderConfig(
      val cookie: String = "",
      val csrfToken: String = "",
      val enabled: Boolean = true,
      val useProxy: Boolean = false
  )
  ```

  `AppConfig` data class 加入字段：
  ```kotlin
  val volcengine: VolcengineProviderConfig = VolcengineProviderConfig(),
  ```

  > 字段名（cookie/csrfToken/enabled/useProxy）必须与 Electron 侧 `MobileAppConfig.volcengine` 完全一致，否则扫码导入 `fetchConfig` 解码失败。

- [ ] **Step 2: 编译**

  Run: `cd android-app && ./gradlew compileDebugKotlin`
  Expected: 通过。`SecureConfigStore` 无需改动（`AppConfig` 走 `@Serializable` 整体序列化）。

---

### Task 3: VolcengineApi —— Ktor POST + 解析

**Files:**
- Create: `{base}/data/remote/VolcengineApi.kt`

- [ ] **Step 1: 新建类**

  ```kotlin
  package com.aisignallight.data.remote

  import com.aisignallight.domain.model.UsageMetric
  import com.aisignallight.domain.model.VolcengineUsageData
  import io.ktor.client.HttpClient
  import io.ktor.client.call.body
  import io.ktor.client.request.header
  import io.ktor.client.request.post
  import io.ktor.client.statement.HttpResponse
  import io.ktor.client.statement.bodyAsText
  import kotlinx.serialization.json.JsonArray
  import kotlinx.serialization.json.doubleOrNull
  import kotlinx.serialization.json.jsonArray
  import kotlinx.serialization.json.jsonObject
  import kotlinx.serialization.json.jsonPrimitive
  import java.time.Instant
  import javax.inject.Inject

  class VolcengineApi @Inject constructor(
      private val clientProvider: KtorClientProvider
  ) {
      companion object {
          const val URL =
              "https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage"
      }

      suspend fun fetch(cookie: String, csrfToken: String, proxyUrl: String?): VolcengineUsageData {
          val client: HttpClient = clientProvider.create(proxyUrl)
          val response: HttpResponse = client.post(URL) {
              header("Cookie", cookie.trim())
              header("x-csrf-token", csrfToken.trim())
              header("Content-Type", "application/json")
              header("Origin", "https://console.volcengine.com")
              header("Referer", "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan")
          }

          // 鉴权失败专属提示
          if (response.status.value == 401 || response.status.value == 403) {
              throw ApiException("登录态已过期，请更新 Cookie / x-csrf-token")
          }
          if (response.status.value >= 400) {
              val body = response.bodyAsText()
              throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
          }

          val json = response.body<kotlinx.serialization.json.JsonObject>()
          val quota: JsonArray = json["Result"]?.jsonObject?.get("QuotaUsage")?.jsonArray
              ?: throw ApiException("invalid response")

          fun metric(level: String): UsageMetric {
              val item = quota.firstOrNull {
                  it.jsonObject["Level"]?.jsonPrimitive?.content == level
              }?.jsonObject
              val percent = item?.get("Percent")?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
              val limit = item?.get("Cap")?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
              val resetSec = item?.get("ResetTimestamp")?.jsonPrimitive?.content?.toLongOrNull()
              val resetTime = if (resetSec != null && resetSec > 0) {
                  Instant.ofEpochSecond(resetSec).toString()
              } else null
              return UsageMetric(
                  limit = limit,
                  used = 0,
                  remaining = 0,
                  percent = percent.coerceIn(0, 100),
                  resetTime = resetTime
              )
          }

          return VolcengineUsageData(
              session = metric("session"),
              weekly = metric("weekly"),
              monthly = metric("monthly")
          )
      }
  }
  ```

  注：`ApiException` 已存在于 `data/remote` 包（KimiApi/MinimaxApi 使用），直接复用。

- [ ] **Step 2: 编译**

  Run: `cd android-app && ./gradlew compileDebugKotlin`
  Expected: 通过。

---

### Task 4: UsageRepositoryImpl 注入并拉取

**Files:**
- Modify: `{base}/data/repository/UsageRepositoryImpl.kt`

- [ ] **Step 1: 构造函数注入 VolcengineApi**

  把 `private val volcengineApi: VolcengineApi` 加入构造函数，并 import `VolcengineApi`, `VolcengineUsageData`。

- [ ] **Step 2: fetchAll 加入 volcengine**

  `fetchAll` 里三个 `async` 之后加入：
  ```kotlin
  val volcengine = async { fetchVolcengine(config, proxyUrl, now) }
  ```
  构造 `UsageSnapshot` 时加入：
  ```kotlin
  volcengine = volcengine.await()
  ```

- [ ] **Step 3: 实现 fetchVolcengine**

  在 `fetchCopilot` 之后新增：
  ```kotlin
  private suspend fun fetchVolcengine(
      config: AppConfig, proxyUrl: String?, now: String
  ): UsageProviderState<VolcengineUsageData> {
      val cfg = config.volcengine
      if (!cfg.enabled) return UsageProviderState(error = "disabled", lastUpdated = now)
      if (cfg.cookie.isBlank() || cfg.csrfToken.isBlank()) {
          return UsageProviderState(error = "no_token", lastUpdated = now)
      }
      return try {
          val proxy = if (cfg.useProxy) proxyUrl else null
          UsageProviderState(
              data = volcengineApi.fetch(cfg.cookie, cfg.csrfToken, proxy),
              lastUpdated = now, error = null
          )
      } catch (e: Exception) {
          UsageProviderState(error = formatError(e), lastUpdated = now)
      }
  }
  ```

- [ ] **Step 4: 编译**

  Run: `cd android-app && ./gradlew compileDebugKotlin`
  Expected: 通过。

---

### Task 5: Settings 视图模型与界面 —— 新增火山引擎分区

**Files:**
- Modify: `{base}/ui/settings/SettingsViewModel.kt`
- Modify: `{base}/ui/settings/SettingsScreen.kt`

- [ ] **Step 1: ViewModel 状态字段**

  `SettingsViewModel.kt`：
  - `init` 里 `SettingsUiState(...)` 加入 `volcengine = config.volcengine`
  - 新增方法：
    ```kotlin
    fun updateVolcengine(config: VolcengineProviderConfig) {
        _uiState.value = _uiState.value.copy(volcengine = config)
    }
    ```
  - `save()` 构造 `AppConfig` 时加入 `volcengine = state.volcengine`
  - `SettingsUiState` data class 加入：
    ```kotlin
    val volcengine: VolcengineProviderConfig = VolcengineProviderConfig()
    ```
  - import `VolcengineProviderConfig`

- [ ] **Step 2: 界面新增分区**

  `SettingsScreen.kt` 在 `Copilot` ProviderSection 后新增：

  ```kotlin
  VolcengineSection(
      config = uiState.volcengine,
      onChange = { viewModel.updateVolcengine(it) }
  )
  ```

  文件底部新增 composable（沿用 `ProviderSection` 的视觉风格，但拆两个输入框）：

  ```kotlin
  @Composable
  private fun VolcengineSection(
      config: VolcengineProviderConfig,
      onChange: (VolcengineProviderConfig) -> Unit
  ) {
      var showCookie by remember { mutableStateOf(false) }
      var showCsrf by remember { mutableStateOf(false) }

      Column(
          modifier = Modifier.fillMaxWidth(),
          verticalArrangement = Arrangement.spacedBy(8.dp)
      ) {
          Text(text = "火山引擎 (Ark Coding Plan)", style = MaterialTheme.typography.titleMedium)

          Row(verticalAlignment = Alignment.CenterVertically) {
              Checkbox(checked = config.enabled, onCheckedChange = { onChange(config.copy(enabled = it)) })
              Text("启用", style = MaterialTheme.typography.bodyMedium)
          }

          OutlinedTextField(
              value = config.cookie,
              onValueChange = { onChange(config.copy(cookie = it)) },
              label = { Text("Cookie") },
              modifier = Modifier.fillMaxWidth(),
              visualTransformation = if (showCookie) VisualTransformation.None else PasswordVisualTransformation(),
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
          )
          Row(verticalAlignment = Alignment.CenterVertically) {
              Checkbox(checked = showCookie, onCheckedChange = { showCookie = it })
              Text("显示", style = MaterialTheme.typography.bodyMedium)
          }

          OutlinedTextField(
              value = config.csrfToken,
              onValueChange = { onChange(config.copy(csrfToken = it)) },
              label = { Text("x-csrf-token") },
              modifier = Modifier.fillMaxWidth(),
              visualTransformation = if (showCsrf) VisualTransformation.None else PasswordVisualTransformation(),
              keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next)
          )
          Row(verticalAlignment = Alignment.CenterVertically) {
              Checkbox(checked = showCsrf, onCheckedChange = { showCsrf = it })
              Text("显示", style = MaterialTheme.typography.bodyMedium)
          }

          Row(verticalAlignment = Alignment.CenterVertically) {
              Checkbox(checked = config.useProxy, onCheckedChange = { onChange(config.copy(useProxy = it)) })
              Text("使用全局代理", style = MaterialTheme.typography.bodyMedium)
          }

          Text(
              text = "打开桌面控制台该页面的 DevTools，复制 GetCodingPlanUsage 请求的 Cookie 与 x-csrf-token。登录过期需重新粘贴。",
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.outline
          )
      }
  }
  ```

  import 加入 `VolcengineProviderConfig`。

- [ ] **Step 3: 编译**

  Run: `cd android-app && ./gradlew compileDebugKotlin`
  Expected: 通过。

---

### Task 6: Usage 页 —— 三档卡片

**Files:**
- Modify: `{base}/ui/home/UsageTab.kt`

- [ ] **Step 1: 渲染脚本**

  import 加入 `VolcengineUsageData`。

  在 `CopilotCard` 后新增：

  ```kotlin
  @Composable
  private fun VolcengineCard(state: UsageProviderState<VolcengineUsageData>?, config: AppConfig) {
      val data = state?.data
      val error = state?.error
      val statusText = when (error) {
          "disabled" -> stringResource(R.string.error_disabled)
          "no_token" -> stringResource(R.string.error_no_token)
          null -> if (data != null) "正常" else stringResource(R.string.loading)
          else -> error
      }
      val statusColor = when (error) {
          null -> if (data != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline
          else -> Color(0xFFF44336)
      }

      val bars = if (data != null) {
          listOf(
              data.session.toBarItem("会话 (session)", config.thresholds.warn, config.thresholds.danger),
              data.weekly.toBarItem("本周 (weekly)", config.thresholds.warn, config.thresholds.danger),
              data.monthly.toBarItem("本月 (monthly)", config.thresholds.warn, config.thresholds.danger)
          )
      } else emptyList()

      ProviderCard(
          title = "火山引擎 Coding Plan",
          statusText = statusText,
          statusColor = statusColor,
          bars = bars,
          footer = state?.lastUpdated?.let { "最后更新：${formatIso(it)}" }
      )
  }
  ```

  `UsageTab` 里（CopilotCard 之后）加入：
  ```kotlin
  VolcengineCard(usage.volcengine, config)
  ```

  更新辅助函数以纳入 volcengine：
  ```kotlin
  private fun allEmpty(usage: UsageSnapshot): Boolean {
      return usage.kimi == null && usage.minimax == null && usage.copilot == null && usage.volcengine == null
  }
  private fun allNoToken(usage: UsageSnapshot): Boolean {
      return listOfNotNull(usage.kimi, usage.minimax, usage.copilot, usage.volcengine).all { it.error == "no_token" }
  }
  ```

- [ ] **Step 2: 编译**

  Run: `cd android-app && ./gradlew compileDebugKotlin`
  Expected: 通过。

---

### Task 7: 扫码导入兼容

**Files:**
- Modify: `{base}/data/remote/DesktopSyncClient.kt`（仅确认，无需改代码）

- [ ] **Step 1: 确认契约一致**

  桌面端 `MobileAppConfig`（Electron 计划 Task 7）已投影 `volcengine`。`DesktopSyncClient.fetchConfig` 用 `AppConfig.serializer()` 解码 + `ignoreUnknownKeys=true`。因字段名一致，桌面推送的 `volcengine` 会自动写入手机配置，无需改代码。如桌面端尚未升级，`volcengine` 缺省也不报错（走默认 `VolcengineProviderConfig()`）。

- [ ] **Step 2: 编译 + 单测**

  Run: `cd android-app && ./gradlew testDebugUnitTest assembleDebug`
  Expected: 编译与现有单测通过。

---

### Task 8: 端到端手动验证

- [ ] **Step 1: 安装并打开手机 App**，进「设置」，展开「火山引擎 (Ark Coding Plan)」，粘贴 Cookie 与 x-csrf-token，开启启用，保存。
- [ ] **Step 2: 回到 Usage 页**，Expected: 出现「火山引擎 Coding Plan」卡片，三档进度条数值与桌面控制台一致。
- [ ] **Step 3: 故意清空任一凭证**，Expected: 卡片显示「未配置 Token」，不崩溃。
- [ ] **Step 4: 扫码导入桌面配置**（桌面已升级且填写 volcengine），Expected: 手机配置自动带上 volcengine。
- [ ] **Step 5: 提交**

  ```bash
  cd android-app && git add app/src && git commit -m "feat: Android 端新增火山引擎 Coding Plan 用量监控"
  ```

---

## 自审记录（已执行）

- 规格覆盖：模型、配置、VolcengineApi、仓库拉取、设置分区、Usage 卡片、扫码导入，均落到图任务。
- 类型一致性：`VolcengineProviderConfig` 字段 `cookie/csrfToken/enabled/useProxy` 与 Electron 侧完全一致（Task 2 Step 1 注释强调）。
- `ApiException` 复用现有类，无新增依赖。
- 未改动 `NotificationHelper`：规格「不做的事」不含通知，volcengine 不触发通知（YAGNI）。
- `resetTime` 转 ISO 字符串（`Instant.ofEpochSecond`），与 Electron 侧解析口径一致。