package com.aisignallight.domain.utils

import java.time.Duration
import java.time.Instant

enum class AgeLevel {
    RECENT, WITHIN_HOUR, OLDER
}

fun ageLevel(timestampMs: Long?): AgeLevel {
    if (timestampMs == null) return AgeLevel.OLDER
    val minutes = Duration.between(
        Instant.ofEpochMilli(timestampMs),
        Instant.now()
    ).toMinutes()
    return when {
        minutes < 5 -> AgeLevel.RECENT
        minutes < 60 -> AgeLevel.WITHIN_HOUR
        else -> AgeLevel.OLDER
    }
}

fun formatRelativeTime(timestampMs: Long?): String {
    if (timestampMs == null) return "无记录"
    val minutes = Duration.between(
        Instant.ofEpochMilli(timestampMs),
        Instant.now()
    ).toMinutes()
    return when {
        minutes < 1 -> "刚刚"
        minutes < 60 -> "${minutes} 分钟前"
        minutes < 24 * 60 -> "${minutes / 60} 小时前"
        else -> "${minutes / (24 * 60)} 天前"
    }
}
