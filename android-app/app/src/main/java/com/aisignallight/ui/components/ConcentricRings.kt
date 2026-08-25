package com.aisignallight.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** 一圈同心环的数据：已用百分比 + 健康色 */
data class UsageRing(val percent: Int, val color: Color)

/**
 * 同心多环进度（Apple Watch 风格）：外圈到内圈对应 rings 顺序，
 * 从 12 点方向顺时针按 percent 填充，底层画完整轨道。
 * rings 为空时画一圈空轨道（占位）。
 */
@Composable
fun ConcentricRings(
    rings: List<UsageRing>,
    modifier: Modifier = Modifier,
    ringWidth: Dp = 5.dp,
    gap: Dp = 2.dp,
    trackColor: Color = MaterialTheme.colorScheme.surfaceVariant
) {
    Canvas(modifier = modifier) {
        val ringPx = ringWidth.toPx()
        val gapPx = gap.toPx()
        val count = rings.size.coerceAtLeast(1)
        val outerRadius = minOf(size.width, size.height) / 2f - ringPx / 2f
        val topLeft = Offset(size.width / 2f, size.height / 2f)

        for (index in 0 until count) {
            val radius = outerRadius - index * (ringPx + gapPx)
            if (radius <= ringPx / 2f) break
            val arcSize = Size(radius * 2f, radius * 2f)
            val arcTopLeft = Offset(topLeft.x - radius, topLeft.y - radius)
            val stroke = Stroke(width = ringPx, cap = StrokeCap.Butt)

            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = arcTopLeft,
                size = arcSize,
                style = stroke
            )
            val ring = rings.getOrNull(index) ?: continue
            if (ring.percent > 0) {
                drawArc(
                    color = ring.color,
                    startAngle = -90f,
                    sweepAngle = ring.percent.coerceIn(0, 100) * 3.6f,
                    useCenter = false,
                    topLeft = arcTopLeft,
                    size = arcSize,
                    style = stroke
                )
            }
        }
    }
}
