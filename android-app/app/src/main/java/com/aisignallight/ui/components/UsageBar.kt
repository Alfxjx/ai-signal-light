package com.aisignallight.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@Composable
fun UsageBar(
    percent: Int,
    warnThreshold: Int,
    dangerThreshold: Int,
    modifier: Modifier = Modifier,
    height: Int = 8
) {
    val color = when {
        percent >= dangerThreshold -> Color(0xFFF44336) // danger red
        percent >= warnThreshold -> Color(0xFFFFC107)  // warn yellow
        else -> Color(0xFF4CAF50)                        // fresh green
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height.dp)
            .clip(RoundedCornerShape(percent = 50))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(percent.coerceIn(0, 100) / 100f)
                .clip(RoundedCornerShape(percent = 50))
                .background(color)
        )
    }
}
