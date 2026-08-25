package com.aisignallight.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.aisignallight.R
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.CopilotUsageData
import com.aisignallight.domain.model.KimiUsageData
import com.aisignallight.domain.model.MinimaxUsageData
import com.aisignallight.domain.model.UsageProviderState
import com.aisignallight.domain.model.UsageSnapshot
import com.aisignallight.domain.model.VolcengineUsageData
import com.aisignallight.ui.components.ProviderCard
import com.aisignallight.ui.components.UsageBarItem
import com.aisignallight.ui.components.toBarItem
import com.aisignallight.domain.utils.calcPace
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val W5H = 5L * 60 * 60 * 1000
private val W7D = 7L * 24 * 60 * 60 * 1000
private val W30D = 30L * 24 * 60 * 60 * 1000

/** MiniMax 的 reset 时间是「距重置的剩余毫秒数」，转成绝对 ISO 时间供 calcPace 使用 */
private fun relativeMsToIso(raw: String?, nowMs: Long): String? {
    val n = raw?.trim()?.toLongOrNull() ?: return null
    if (n <= 0) return null
    return Instant.ofEpochMilli(nowMs + n).toString()
}

@Composable
fun UsageTab(
    usage: UsageSnapshot,
    config: AppConfig,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (isLoading && allEmpty(usage)) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        }

        KimiCard(usage.kimi, config)
        MinimaxCard(usage.minimax, config)
        CopilotCard(usage.copilot, config)
        VolcengineCard(usage.volcengine, config)

        if (allNoToken(usage)) {
            Text(
                text = "未配置 Token，请在设置中添加",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.outline,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Button(
            onClick = onRefresh,
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            Text(text = if (isLoading) stringResource(R.string.loading) else stringResource(R.string.refresh))
        }
    }
}

@Composable
private fun KimiCard(state: UsageProviderState<KimiUsageData>?, config: AppConfig) {
    val data = state?.data
    val error = state?.error
    val statusText = when (error) {
        "disabled" -> stringResource(R.string.error_disabled)
        "no_token" -> stringResource(R.string.error_no_token)
        null -> if (data != null) "正常" else stringResource(R.string.loading)
        else -> error
    }
    val statusColor = when (error) {
        null -> if (data != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline
        else -> Color(0xFFF44336)
    }

    val bars = if (data != null) {
        val w = config.thresholds.warn
        val d = config.thresholds.danger
        val nowMs = System.currentTimeMillis()
        listOf(
            data.codingWeekly.toBarItem("本周编码", w, d)
                .copy(paceLabel = calcPace(data.codingWeekly.percent, data.codingWeekly.resetTime, W7D, nowMs).label),
            data.codingFiveHour.toBarItem("5 小时窗口", w, d)
                .copy(paceLabel = calcPace(data.codingFiveHour.percent, data.codingFiveHour.resetTime, W5H, nowMs).label)
        )
    } else emptyList()

    ProviderCard(
        title = "Kimi",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = state?.lastUpdated?.let { "最后更新：${formatIso(it)}" }
    )
}

@Composable
private fun MinimaxCard(state: UsageProviderState<MinimaxUsageData>?, config: AppConfig) {
    val data = state?.data
    val error = state?.error
    val statusText = when (error) {
        "disabled" -> stringResource(R.string.error_disabled)
        "no_token" -> stringResource(R.string.error_no_token)
        null -> if (data != null) "正常" else stringResource(R.string.loading)
        else -> error
    }
    val statusColor = when (error) {
        null -> if (data != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline
        else -> Color(0xFFF44336)
    }

    // Desktop shows used %; MiniMax returns remaining %, so flip it.
    val bars = if (data != null) {
        val w = config.thresholds.warn
        val d = config.thresholds.danger
        val nowMs = System.currentTimeMillis()
        listOf(
            UsageBarItem(
                "5 小时窗口", (100 - data.fiveHourPercent).coerceIn(0, 100), w, d,
                paceLabel = calcPace(100 - data.fiveHourPercent, relativeMsToIso(data.fiveHourResetTime, nowMs), W5H, nowMs).label
            ),
            UsageBarItem(
                "本周", (100 - data.weeklyPercent).coerceIn(0, 100), w, d,
                paceLabel = calcPace(100 - data.weeklyPercent, relativeMsToIso(data.weeklyResetTime, nowMs), W7D, nowMs).label
            )
        )
    } else emptyList()

    ProviderCard(
        title = "MiniMax",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = state?.lastUpdated?.let { "最后更新：${formatIso(it)}" }
    )
}

@Composable
private fun CopilotCard(state: UsageProviderState<CopilotUsageData>?, config: AppConfig) {
    val data = state?.data
    val error = state?.error
    val statusText = when (error) {
        "disabled" -> stringResource(R.string.error_disabled)
        "no_token" -> stringResource(R.string.error_no_token)
        null -> if (data != null) "正常" else stringResource(R.string.loading)
        else -> error
    }
    val statusColor = when (error) {
        null -> if (data != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline
        else -> Color(0xFFF44336)
    }

    val bars = if (data != null) {
        listOf(
            UsageBarItem("Premium", data.premium.percent, config.thresholds.warn, config.thresholds.danger)
        )
    } else emptyList()

    val footer = buildString {
        state?.lastUpdated?.let { append("最后更新：${formatIso(it)}") }
        data?.premium?.resetDate?.let {
            if (isNotEmpty()) append("  ·  ")
            append("重置：$it")
        }
    }.takeIf { it.isNotEmpty() }

    ProviderCard(
        title = "Copilot",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = footer
    )
}

private fun allEmpty(usage: UsageSnapshot): Boolean {
    return usage.kimi == null && usage.minimax == null && usage.copilot == null && usage.volcengine == null
}

private fun allNoToken(usage: UsageSnapshot): Boolean {
    return listOfNotNull(usage.kimi, usage.minimax, usage.copilot, usage.volcengine).all { it.error == "no_token" }
}

@Composable
private fun VolcengineCard(state: UsageProviderState<VolcengineUsageData>?, config: AppConfig) {
    val data = state?.data
    val error = state?.error
    val statusText = when (error) {
        "disabled" -> stringResource(R.string.error_disabled)
        "no_token" -> stringResource(R.string.error_no_token)
        null -> if (data != null) "正常" else stringResource(R.string.loading)
        else -> error
    }
    val statusColor = when (error) {
        null -> if (data != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline
        else -> Color(0xFFF44336)
    }

    val bars = if (data != null) {
        val w = config.thresholds.warn
        val d = config.thresholds.danger
        val nowMs = System.currentTimeMillis()
        listOf(
            data.session.toBarItem("会话 (session)", w, d)
                .copy(paceLabel = calcPace(data.session.percent, data.session.resetTime, W5H, nowMs).label),
            data.weekly.toBarItem("本周 (weekly)", w, d)
                .copy(paceLabel = calcPace(data.weekly.percent, data.weekly.resetTime, W7D, nowMs).label),
            data.monthly.toBarItem("本月 (monthly)", w, d)
                .copy(paceLabel = calcPace(data.monthly.percent, data.monthly.resetTime, W30D, nowMs).label)
        )
    } else emptyList()

    ProviderCard(
        title = "火山引擎 Coding Plan",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = state?.lastUpdated?.let { "最后更新：${formatIso(it)}" }
    )
}

private fun formatIso(iso: String): String {
    return try {
        val instant = Instant.parse(iso)
        val local = instant.atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("HH:mm:ss").format(local)
    } catch (_: Exception) {
        iso
    }
}
