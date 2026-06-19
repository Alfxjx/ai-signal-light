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
data class AppConfig(
    val kimi: ProviderConfig = ProviderConfig(),
    val minimax: ProviderConfig = ProviderConfig(),
    val copilot: ProviderConfig = ProviderConfig(),
    val proxy: ProxyConfig = ProxyConfig(),
    val intervalMinutes: Int = 10,
    val thresholds: UsageThresholds = UsageThresholds()
)

@Serializable
data class QrPayload(
    val v: Int = 1,
    val host: String,
    val port: Int,
    val apiKey: String? = null,
    val config: AppConfig
)
