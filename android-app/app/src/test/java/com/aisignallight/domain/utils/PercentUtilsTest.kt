package com.aisignallight.domain.utils

import org.junit.Assert.assertEquals
import org.junit.Test

class PercentUtilsTest {

    @Test
    fun calcPercent_normal() {
        assertEquals(50, calcPercent(50, 100))
    }

    @Test
    fun calcPercent_zeroLimit() {
        assertEquals(0, calcPercent(10, 0))
    }

    @Test
    fun calcPercent_cappedAt100() {
        assertEquals(100, calcPercent(150, 100))
    }

    @Test
    fun calcPercent_negativeUsed() {
        assertEquals(0, calcPercent(-10, 100))
    }
}
