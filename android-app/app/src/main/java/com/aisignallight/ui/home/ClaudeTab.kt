package com.aisignallight.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aisignallight.domain.model.PendingHook
import com.aisignallight.domain.model.ProjectSyncState
import com.aisignallight.domain.model.ProjectWithAssistant
import com.aisignallight.domain.utils.AgeLevel
import com.aisignallight.domain.utils.ageLevel
import com.aisignallight.domain.utils.formatRelativeTime

private enum class TimeFilter {
    ALL, RECENT, WITHIN_HOUR
}

@Composable
fun ClaudeTab(
    state: ProjectSyncState,
    modifier: Modifier = Modifier
) {
    var selectedFilter by remember { mutableStateOf(TimeFilter.ALL) }

    val filtered = remember(state.projects, selectedFilter) {
        state.projects.filter { item ->
            when (selectedFilter) {
                TimeFilter.ALL -> true
                TimeFilter.RECENT -> ageLevel(item.project.lastResponseMs) == AgeLevel.RECENT
                TimeFilter.WITHIN_HOUR -> ageLevel(item.project.lastResponseMs) != AgeLevel.OLDER
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        ConnectionHeader(state)

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FilterChip(
                selected = selectedFilter == TimeFilter.ALL,
                onClick = { selectedFilter = TimeFilter.ALL },
                label = { Text("全部") }
            )
            FilterChip(
                selected = selectedFilter == TimeFilter.RECENT,
                onClick = { selectedFilter = TimeFilter.RECENT },
                label = { Text("5 分钟内") }
            )
            FilterChip(
                selected = selectedFilter == TimeFilter.WITHIN_HOUR,
                onClick = { selectedFilter = TimeFilter.WITHIN_HOUR },
                label = { Text("1 小时内") }
            )
        }

        if (filtered.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (state.projects.isEmpty()) "暂无项目数据" else "当前筛选条件下无项目",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(bottom = 16.dp)
            ) {
                items(filtered, key = { "${it.assistantId}:${it.project.id}" }) { item ->
                    ProjectRow(
                        item = item,
                        pending = state.pending[item.project.cwd ?: item.project.id]
                    )
                }
            }
        }
    }
}

@Composable
private fun ConnectionHeader(state: ProjectSyncState) {
    val statusText = when {
        state.isConnected -> "已连接"
        state.error != null -> "连接异常：${state.error}"
        state.projects.isNotEmpty() -> "离线（显示缓存）"
        else -> "未连接"
    }
    val statusColor = when {
        state.isConnected -> Color(0xFF4CAF50)
        state.projects.isNotEmpty() -> MaterialTheme.colorScheme.outline
        else -> Color(0xFFF44336)
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(statusColor)
        )
        Text(
            text = statusText,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        state.lastSyncAt?.let {
            Text(
                text = "最后同步：${formatRelativeTime(it)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline
            )
        }
    }
}

@Composable
private fun ProjectRow(
    item: ProjectWithAssistant,
    pending: PendingHook?
) {
    val level = ageLevel(item.project.lastResponseMs)
    val ageColor = when (level) {
        AgeLevel.RECENT -> Color(0xFF4CAF50)
        AgeLevel.WITHIN_HOUR -> Color(0xFFFFC107)
        AgeLevel.OLDER -> MaterialTheme.colorScheme.outline
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(CircleShape)
                    .background(ageColor)
            )

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.project.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = formatRelativeTime(item.project.lastResponseMs),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (pending != null) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFF44336))
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "待处理",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(0xFFF44336)
                )
            }
        }
    }
}
