package com.aisignallight.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.aisignallight.domain.model.UsageMetric

@Composable
fun ProviderCard(
    title: String,
    statusText: String,
    statusColor: Color,
    bars: List<UsageBarItem>,
    footer: String?,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(text = statusText, color = statusColor, style = MaterialTheme.typography.labelMedium)
            }

            Spacer(modifier = Modifier.height(12.dp))

            bars.forEach { bar ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = bar.label, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        text = "${bar.percent}%",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                UsageBar(
                    percent = bar.percent,
                    warnThreshold = bar.warnThreshold,
                    dangerThreshold = bar.dangerThreshold
                )
                Spacer(modifier = Modifier.height(8.dp))
            }

            footer?.let {
                Text(text = it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}

data class UsageBarItem(
    val label: String,
    val percent: Int,
    val warnThreshold: Int = 50,
    val dangerThreshold: Int = 80
)

fun UsageMetric.toBarItem(label: String, warnThreshold: Int = 50, dangerThreshold: Int = 80): UsageBarItem {
    return UsageBarItem(label = label, percent = percent, warnThreshold = warnThreshold, dangerThreshold = dangerThreshold)
}
