package com.aisignallight.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ProviderConfig(
    val token: String = "",
    val enabled: Boolean = true,
    val useProxy: Boolean = false
)

/**
 * 火山引擎凭证来自官方 OpenAPI 的长期凭证（Access Key ID / Secret Access Key，
 * 在 console.volcengine.com/iam/keymanage/ 创建），不再使用控制台 Cookie。
 * 旧配置里的 cookie / csrfToken 字段由 SecureConfigStore 的 ignoreUnknownKeys 自动忽略。
 */
@Serializable
data class VolcengineProviderConfig(
    val accessKey: String = "",
    val secretKey: String = "",
    val enabled: Boolean = true,
    val useProxy: Boolean = false
)

@Serializable
data class UsageThresholds(
    val warn: Int = 50,
    val danger: Int = 80
)

@Serializable
data class ProxyConfig(
    val url: String = ""
)

@Serializable
enum class ThemeMode {
    LIGHT,
    DARK,
    SYSTEM
}

@Serializable
data class AppConfig(
    val kimi: ProviderConfig = ProviderConfig(),
    val minimax: ProviderConfig = ProviderConfig(),
    val copilot: ProviderConfig = ProviderConfig(),
    val volcengine: VolcengineProviderConfig = VolcengineProviderConfig(),
    val deepseek: ProviderConfig = ProviderConfig(),
    /** token 字段存 platform.xiaomimimo.com 控制台复制的整段 Cookie */
    val mimo: ProviderConfig = ProviderConfig(),
    val proxy: ProxyConfig = ProxyConfig(),
    val intervalMinutes: Int = 10,
    val thresholds: UsageThresholds = UsageThresholds(),
    val themeMode: ThemeMode = ThemeMode.SYSTEM
)
