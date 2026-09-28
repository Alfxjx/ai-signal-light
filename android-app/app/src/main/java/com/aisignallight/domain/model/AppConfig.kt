package com.aisignallight.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ProviderConfig(
    val token: String = "",
    val enabled: Boolean = true,
    val useProxy: Boolean = false
)

@Serializable
data class VolcengineProviderConfig(
    /** AK/SK 通道（官方 OpenAPI，长期有效），二者齐备时优先于 cookie。
     *  桌面端 toMobileConfig 不下发这两个字段，需在手机上手动填写。 */
    val accessKey: String = "",
    val secretKey: String = "",
    /** Cookie 通道（控制台会话，约一周需重配），仅在 AK/SK 不可用时回退 */
    val cookie: String = "",
    val csrfToken: String = "",
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
