package com.aisignallight.domain.utils

import java.time.Instant

/** 用量节奏信息：pace 为 快/慢/均，arrow 为 ↑/↓/—，expectedPercent 为匀速期望已用 % */
data class PaceInfo(
    val pace: String?,
    val arrow: String?,
    val expectedPercent: Int?
) {
    val label: String
        get() = when {
            pace != null && arrow != null -> pace + arrow
            else -> ""
        }
    val isFast: Boolean get() = pace == "快"
    val isSlow: Boolean get() = pace == "慢"
}

/**
 * 计算用量节奏：与桌面端 calcUsagePace 逻辑一致。
 * usedPercent 相对「按匀速消耗的期望已用 %」的偏差，超过 threshold 判快/慢，否则均。
 * resetTimeIso 为空，或剩余重置时间不在 (0, windowMs) 内时，无法计算（返回全 null）。
 */
fun calcPace(
    usedPercent: Int,
    resetTimeIso: String?,
    windowMs: Long,
    nowMs: Long = System.currentTimeMillis(),
    threshold: Int = 5
): PaceInfo {
    if (resetTimeIso.isNullOrBlank()) return PaceInfo(null, null, null)
    val resetMs = runCatching { Instant.parse(resetTimeIso).toEpochMilli() }.getOrNull()
        ?: return PaceInfo(null, null, null)
    val remainingMs = resetMs - nowMs
    if (remainingMs <= 0 || remainingMs >= windowMs) return PaceInfo(null, null, null)

    val expectedPercent = ((windowMs - remainingMs).toDouble() / windowMs * 100).toInt()
    val delta = usedPercent - expectedPercent

    return when {
        delta > threshold -> PaceInfo("快", "↑", expectedPercent)
        delta < -threshold -> PaceInfo("慢", "↓", expectedPercent)
        else -> PaceInfo("均", "—", expectedPercent)
    }
}