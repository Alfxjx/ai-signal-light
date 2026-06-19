package com.aisignallight.domain.utils

fun calcPercent(used: Int, limit: Int): Int {
    if (limit <= 0) return 0
    return (used * 100 / limit).coerceIn(0, 100)
}
