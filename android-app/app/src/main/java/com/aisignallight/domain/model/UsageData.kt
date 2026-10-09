package com.aisignallight.domain.model

import kotlinx.serialization.Serializable

typealias UsageError = String

@Serializable
data class UsageMetric(
    val limit: Int = 0,
    val used: Int = 0,
    val remaining: Int = 0,
    val percent: Int = 0,
    val resetTime: String? = null
)

@Serializable
data class KimiUsageData(
    val codingWeekly: UsageMetric = UsageMetric(),
    val codingFiveHour: UsageMetric = UsageMetric()
)

@Serializable
data class MinimaxUsageData(
    val fiveHourPercent: Int = 0,
    val weeklyPercent: Int = 0,
    val fiveHourResetTime: String? = null,
    val weeklyResetTime: String? = null
)

@Serializable
data class CopilotPremiumData(
    val limit: Int = 0,
    val remaining: Int = 0,
    val percent: Int = 0,
    val resetDate: String? = null,
    val resetDateUtc: String? = null
)

@Serializable
data class CopilotChatData(
    val percent: Int = 0
)

@Serializable
data class CopilotUsageData(
    val premium: CopilotPremiumData = CopilotPremiumData(),
    val chat: CopilotChatData = CopilotChatData(),
    val plan: String? = null,
    val licenseType: String? = null
)

@Serializable
data class VolcengineUsageData(
    val session: UsageMetric = UsageMetric(),
    val weekly: UsageMetric = UsageMetric(),
    val monthly: UsageMetric = UsageMetric()
)

@Serializable
data class DeepseekUsageData(
    override val isAvailable: Boolean = false,
    override val currency: String? = null,
    override val totalBalance: Double = 0.0,
    override val grantedBalance: Double = 0.0,
    val toppedUpBalance: Double = 0.0
) : BalanceData

/** 小米 MiMo 余额（api-platform_serviceToken 等 Cookie 鉴权，sk- 开头的 API Key 查不到） */
@Serializable
data class MimoUsageData(
    override val isAvailable: Boolean = false,
    override val currency: String? = null,
    override val totalBalance: Double = 0.0,
    override val grantedBalance: Double = 0.0,
    val paidBalance: Double = 0.0
) : BalanceData

/** 余额型 provider 的共同形状，供 UI 复用同一套余额卡（DeepSeek / MiMo） */
interface BalanceData {
    val isAvailable: Boolean
    val currency: String?
    val totalBalance: Double
    val grantedBalance: Double
}

// T 只出现在 data: T? 这一协变位，放宽为 out 以便余额卡接受任意 BalanceData 实现
@Serializable
data class UsageProviderState<out T>(
    val data: T? = null,
    val lastUpdated: String? = null,
    val error: UsageError? = null
)

@Serializable
data class UsageSnapshot(
    val kimi: UsageProviderState<KimiUsageData>? = null,
    val minimax: UsageProviderState<MinimaxUsageData>? = null,
    val copilot: UsageProviderState<CopilotUsageData>? = null,
    val volcengine: UsageProviderState<VolcengineUsageData>? = null,
    val deepseek: UsageProviderState<DeepseekUsageData>? = null,
    val mimo: UsageProviderState<MimoUsageData>? = null
)

enum class ProviderId(val value: String) {
    KIMI("kimi"),
    MINIMAX("minimax"),
    COPILOT("copilot"),
    VOLCENGINE("volcengine"),
    DEEPSEEK("deepseek"),
    MIMO("mimo")
}

sealed class ProviderUsageData {
    abstract val providerId: ProviderId

    data class KimiData(val data: KimiUsageData) : ProviderUsageData() {
        override val providerId: ProviderId = ProviderId.KIMI
    }

    data class MinimaxData(val data: MinimaxUsageData) : ProviderUsageData() {
        override val providerId: ProviderId = ProviderId.MINIMAX
    }

    data class CopilotData(val data: CopilotUsageData) : ProviderUsageData() {
        override val providerId: ProviderId = ProviderId.COPILOT
    }

    data class VolcengineData(val data: VolcengineUsageData) : ProviderUsageData() {
        override val providerId: ProviderId = ProviderId.VOLCENGINE
    }

    data class DeepseekData(val data: DeepseekUsageData) : ProviderUsageData() {
        override val providerId: ProviderId = ProviderId.DEEPSEEK
    }
}
