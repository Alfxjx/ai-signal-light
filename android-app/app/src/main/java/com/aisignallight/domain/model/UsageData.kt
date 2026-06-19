package com.aisignallight.domain.model

typealias UsageError = String

data class UsageMetric(
    val limit: Int = 0,
    val used: Int = 0,
    val remaining: Int = 0,
    val percent: Int = 0,
    val resetTime: String? = null
)

data class KimiUsageData(
    val total: UsageMetric = UsageMetric(),
    val codingWeekly: UsageMetric = UsageMetric(),
    val codingFiveHour: UsageMetric = UsageMetric()
)

data class MinimaxUsageData(
    val fiveHourPercent: Int = 0,
    val weeklyPercent: Int = 0,
    val fiveHourResetTime: String? = null,
    val weeklyResetTime: String? = null
)

data class CopilotPremiumData(
    val limit: Int = 0,
    val remaining: Int = 0,
    val percent: Int = 0,
    val resetDate: String? = null,
    val resetDateUtc: String? = null
)

data class CopilotChatData(
    val percent: Int = 0
)

data class CopilotUsageData(
    val premium: CopilotPremiumData = CopilotPremiumData(),
    val chat: CopilotChatData = CopilotChatData(),
    val plan: String? = null,
    val licenseType: String? = null
)

data class UsageProviderState<T>(
    val data: T? = null,
    val lastUpdated: String? = null,
    val error: UsageError? = null
)

data class UsageSnapshot(
    val kimi: UsageProviderState<KimiUsageData>? = null,
    val minimax: UsageProviderState<MinimaxUsageData>? = null,
    val copilot: UsageProviderState<CopilotUsageData>? = null
)

enum class ProviderId(val value: String) {
    KIMI("kimi"),
    MINIMAX("minimax"),
    COPILOT("copilot")
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
}
