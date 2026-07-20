package com.aisignallight.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ProviderConfig(
    val token: String = "",
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
    val proxy: ProxyConfig = ProxyConfig(),
    val intervalMinutes: Int = 10,
    val thresholds: UsageThresholds = UsageThresholds(),
    val themeMode: ThemeMode = ThemeMode.SYSTEM
)

/**
 * QR 码内只携带最小配对信息。完整配置在扫码后通过 WebSocket 反向拉取
 * （见 DesktopSyncClient.fetchConfig + 服务端 getConfig 处理器）。
 */
@Serializable
data class QrPayload(
    val v: Int = 1,
    val host: String,
    val port: Int,
    val apiKey: String = ""
)
