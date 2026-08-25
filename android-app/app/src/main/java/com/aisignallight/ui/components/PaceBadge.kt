package com.aisignallight.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * 用量节奏徽章：快（红）/ 慢（蓝）/ 均（灰），label 为空时不渲染。
 * label 形如 "快↑"、"慢↓"、"均-"（PaceInfo.label）。
 */
@Composable
fun PaceBadge(label: String?, modifier: Modifier = Modifier) {
    if (label.isNullOrBlank()) return
    val (container, content) = when {
        label.startsWith("快") -> Color(0x1EF44336) to Color(0xFFEF5350)
        label.startsWith("慢") -> Color(0x1E2196F3) to Color(0xFF42A5F5)
        else -> MaterialTheme.colorScheme.outlineVariant to MaterialTheme.colorScheme.outline
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = container,
        contentColor = content
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
        )
    }
}
