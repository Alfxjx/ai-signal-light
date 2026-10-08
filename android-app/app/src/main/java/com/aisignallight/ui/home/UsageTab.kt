package com.aisignallight.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.aisignallight.R
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.CopilotUsageData
import com.aisignallight.domain.model.KimiUsageData
import com.aisignallight.domain.model.MinimaxUsageData
import com.aisignallight.domain.model.UsageProviderState
import com.aisignallight.domain.model.UsageSnapshot
import com.aisignallight.domain.model.VolcengineUsageData
import com.aisignallight.domain.utils.calcPace
import com.aisignallight.ui.components.DeepseekBalanceCard
import com.aisignallight.ui.components.ProviderCard
import com.aisignallight.ui.components.UsageBarItem
import com.aisignallight.ui.components.toBarItem
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

/** 解析绝对 ISO 重置时间为 epoch 毫秒；无法解析返回 null */
private fun parseResetMs(iso: String?): Long? =
    iso?.takeIf { it.isNotBlank() }?.let {
        runCatching { Instant.parse(it).toEpochMilli() }.getOrNull()
    }

/** 与 Electron formatResetTime 一致的显示：绝对剩余时间 -> "Reset in XdYhZm" */
private fun resetLabelFromMs(resetMs: Long?, nowMs: Long): String? {
    if (resetMs == null || resetMs <= nowMs) return null
    val diff = resetMs - nowMs
    val days = diff / 86_400_000
    val hours = (diff % 86_400_000) / 3_600_000
    val mins = Math.ceil((diff % 3_600_000) / 60_000.0).toInt()
    val parts = mutableListOf<String>()
    if (days > 0) parts.add("${days}d")
    if (hours > 0 || (days > 0 && mins > 0)) parts.add("${hours}h")
    if (mins > 0 || parts.isEmpty()) parts.add("${mins}m")
    return "Reset in ${parts.joinToString("")}"
}

/** MiniMax 的相对毫秒剩余 -> "Reset in XdYhZm" */
private fun relativeResetLabel(relativeMsRaw: String?, nowMs: Long): String? {
    val n = relativeMsRaw?.trim()?.toLongOrNull() ?: return null
    if (n <= 0) return null
    return resetLabelFromMs(nowMs + n, nowMs)
}

/** ISO 时间 -> HH:mm（本地时区），解析失败返回 null */
private fun formatHm(iso: String?): String? = iso?.takeIf { it.isNotBlank() }?.let {
    runCatching {
        DateTimeFormatter.ofPattern("HH:mm")
            .format(Instant.parse(it).atZone(ZoneId.systemDefault()))
    }.getOrNull()
}

/** 单个 provider 在 UI 层的渲染数据 */
private data class ProviderUiModel(
    val title: String,
    val statusText: String,
    val statusColor: Color,
    val bars: List<UsageBarItem>,
    val footer: String?,
    val updatedLabel: String?,
    val needsSetup: Boolean
)

/** provider 状态文案 + 颜色（正常绿 / 异常红 / 加载灰）；缺 token 引导去设置 */
@Composable
private fun providerStatus(data: Any?, error: String?): Pair<String, Color> {
    val text = when (error) {
        "disabled" -> stringResource(R.string.error_disabled)
        "no_token" -> stringResource(R.string.not_configured_open_settings)
        null -> if (data != null) "正常" else stringResource(R.string.loading)
        else -> error
    }
    val color = when (error) {
        null -> if (data != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline
        "no_token" -> MaterialTheme.colorScheme.outline
        else -> Color(0xFFF44336)
    }
    return text to color
}

@Composable
fun UsageList(
    usage: UsageSnapshot,
    config: AppConfig,
    isLoading: Boolean,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier
) {
    val models = buildProviderModels(usage, config)
    val deepseekNeedsSetup = usage.deepseek?.error == "no_token"

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (config.deepseek.enabled) {
            item(key = "deepseek") {
                DeepseekBalanceCard(
                    state = usage.deepseek,
                    onClick = if (deepseekNeedsSetup) onOpenSettings else null
                )
            }
        }

        items(models, key = { it.title }) { model ->
            ProviderCard(
                title = model.title,
                statusText = model.statusText,
                statusColor = model.statusColor,
                bars = model.bars,
                footer = model.footer,
                updatedLabel = model.updatedLabel,
                onClick = if (model.needsSetup) onOpenSettings else null
            )
        }

        if (isLoading && allEmpty(usage, config)) {
            item(key = "loading") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

/** 按设置里启用的 provider 构建渲染数据（禁用的不占位） */
@Composable
private fun buildProviderModels(usage: UsageSnapshot, config: AppConfig): List<ProviderUiModel> {
    val models = mutableListOf<ProviderUiModel>()
    if (config.kimi.enabled) models += kimiModel(usage.kimi, config)
    if (config.minimax.enabled) models += minimaxModel(usage.minimax, config)
    if (config.copilot.enabled) models += copilotModel(usage.copilot, config)
    if (config.volcengine.enabled) models += volcengineModel(usage.volcengine, config)
    return models
}

@Composable
private fun kimiModel(state: UsageProviderState<KimiUsageData>?, config: AppConfig): ProviderUiModel {
    val data = state?.data
    val (statusText, statusColor) = providerStatus(data, state?.error)

    val bars = if (data != null) {
        val w = config.thresholds.warn
        val d = config.thresholds.danger
        val nowMs = System.currentTimeMillis()
        listOf(
            data.codingWeekly.toBarItem("本周编码", w, d)
                .copy(
                    paceLabel = calcPace(data.codingWeekly.percent, data.codingWeekly.resetTime, W7D, nowMs).label,
                    resetLabel = resetLabelFromMs(parseResetMs(data.codingWeekly.resetTime), nowMs)
                ),
            data.codingFiveHour.toBarItem("5 小时窗口", w, d)
                .copy(
                    paceLabel = calcPace(data.codingFiveHour.percent, data.codingFiveHour.resetTime, W5H, nowMs).label,
                    resetLabel = resetLabelFromMs(parseResetMs(data.codingFiveHour.resetTime), nowMs)
                )
        )
    } else emptyList()

    return ProviderUiModel(
        title = "Kimi",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = null,
        updatedLabel = formatHm(state?.lastUpdated)?.let { stringResource(R.string.updated_at, it) },
        needsSetup = state?.error == "no_token"
    )
}

@Composable
private fun minimaxModel(state: UsageProviderState<MinimaxUsageData>?, config: AppConfig): ProviderUiModel {
    val data = state?.data
    val (statusText, statusColor) = providerStatus(data, state?.error)

    // Desktop shows used %; MiniMax returns remaining %, so flip it.
    val bars = if (data != null) {
        val w = config.thresholds.warn
        val d = config.thresholds.danger
        val nowMs = System.currentTimeMillis()
        listOf(
            UsageBarItem(
                "5 小时窗口", (100 - data.fiveHourPercent).coerceIn(0, 100), w, d,
                paceLabel = calcPace(100 - data.fiveHourPercent, relativeMsToIso(data.fiveHourResetTime, nowMs), W5H, nowMs).label,
                resetLabel = relativeResetLabel(data.fiveHourResetTime, nowMs)
            ),
            UsageBarItem(
                "本周", (100 - data.weeklyPercent).coerceIn(0, 100), w, d,
                paceLabel = calcPace(100 - data.weeklyPercent, relativeMsToIso(data.weeklyResetTime, nowMs), W7D, nowMs).label,
                resetLabel = relativeResetLabel(data.weeklyResetTime, nowMs)
            )
        )
    } else emptyList()

    return ProviderUiModel(
        title = "MiniMax",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = null,
        updatedLabel = formatHm(state?.lastUpdated)?.let { stringResource(R.string.updated_at, it) },
        needsSetup = state?.error == "no_token"
    )
}

@Composable
private fun copilotModel(state: UsageProviderState<CopilotUsageData>?, config: AppConfig): ProviderUiModel {
    val data = state?.data
    val (statusText, statusColor) = providerStatus(data, state?.error)

    val bars = if (data != null) {
        listOf(
            UsageBarItem("Premium", data.premium.percent, config.thresholds.warn, config.thresholds.danger)
        )
    } else emptyList()

    return ProviderUiModel(
        title = "Copilot",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = data?.premium?.resetDate?.let { "重置：$it" },
        updatedLabel = formatHm(state?.lastUpdated)?.let { stringResource(R.string.updated_at, it) },
        needsSetup = state?.error == "no_token"
    )
}

@Composable
private fun volcengineModel(state: UsageProviderState<VolcengineUsageData>?, config: AppConfig): ProviderUiModel {
    val data = state?.data
    val (statusText, statusColor) = providerStatus(data, state?.error)

    val bars = if (data != null) {
        val w = config.thresholds.warn
        val d = config.thresholds.danger
        val nowMs = System.currentTimeMillis()
        listOf(
            data.session.toBarItem("会话 (session)", w, d)
                .copy(
                    paceLabel = calcPace(data.session.percent, data.session.resetTime, W5H, nowMs).label,
                    resetLabel = resetLabelFromMs(parseResetMs(data.session.resetTime), nowMs)
                ),
            data.weekly.toBarItem("本周 (weekly)", w, d)
                .copy(
                    paceLabel = calcPace(data.weekly.percent, data.weekly.resetTime, W7D, nowMs).label,
                    resetLabel = resetLabelFromMs(parseResetMs(data.weekly.resetTime), nowMs)
                ),
            data.monthly.toBarItem("本月 (monthly)", w, d)
                .copy(
                    paceLabel = calcPace(data.monthly.percent, data.monthly.resetTime, W30D, nowMs).label,
                    resetLabel = resetLabelFromMs(parseResetMs(data.monthly.resetTime), nowMs)
                )
        )
    } else emptyList()

    return ProviderUiModel(
        title = "火山引擎 Coding Plan",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = null,
        updatedLabel = formatHm(state?.lastUpdated)?.let { stringResource(R.string.updated_at, it) },
        needsSetup = state?.error == "no_token"
    )
}

private fun allEmpty(usage: UsageSnapshot, config: AppConfig): Boolean {
    return (!config.kimi.enabled || usage.kimi == null)
        && (!config.minimax.enabled || usage.minimax == null)
        && (!config.copilot.enabled || usage.copilot == null)
        && (!config.volcengine.enabled || usage.volcengine == null)
        && (!config.deepseek.enabled || usage.deepseek == null)
}
