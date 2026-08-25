package com.aisignallight.domain.utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class PaceUtilsTest {

    private val nowMs = 1_800_000_000_000L // 固定基准时间
    private val windowMs = 7L * 24 * 60 * 60 * 1000 // 7 天

    private fun isoAt(epochMs: Long): String = Instant.ofEpochMilli(epochMs).toString()

    @Test
    fun `消耗明显快于匀速时判为快`() {
        // 窗口过半(期望 50%)却已用 80%
        val resetMs = nowMs + windowMs / 2
        val p = calcPace(80, isoAt(resetMs), windowMs, nowMs)
        assertNotNull(p.pace)
        assertEquals("快", p.pace)
        assertEquals("↑", p.arrow)
    }

    @Test
    fun `消耗明显慢于匀速时判为慢`() {
        val resetMs = nowMs + windowMs / 2 // 期望 50%，已用 10%
        val p = calcPace(10, isoAt(resetMs), windowMs, nowMs)
        assertNotNull(p.pace)
        assertEquals("慢", p.pace)
        assertEquals("↓", p.arrow)
    }

    @Test
    fun `接近匀速时判为均`() {
        val resetMs = nowMs + windowMs / 2 // 期望 50%，已用 52%
        val p = calcPace(52, isoAt(resetMs), windowMs, nowMs)
        assertNotNull(p.pace)
        assertEquals("均", p.pace)
        assertEquals("—", p.arrow)
    }

    @Test
    fun `重置时间为空时不计算`() {
        val p = calcPace(80, null, windowMs, nowMs)
        assertNull(p.pace)
        assertEquals("", p.label)
    }

    @Test
    fun `剩余时间超出窗口时不计算`() {
        val resetMs = nowMs + windowMs + 1000 // 超过一个完整窗口
        val p = calcPace(80, isoAt(resetMs), windowMs, nowMs)
        assertNull(p.pace)
    }

    @Test
    fun `剩余时间为负时不计算`() {
        val resetMs = nowMs - 1000 // 已重置
        val p = calcPace(80, isoAt(resetMs), windowMs, nowMs)
        assertNull(p.pace)
    }
}