package com.aisignallight.ui.home

import android.content.Context
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
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
import com.aisignallight.domain.utils.calcPace
import com.aisignallight.ui.components.DeepseekBalanceCard
import com.aisignallight.ui.components.DeepseekBalanceTile
import com.aisignallight.ui.components.GridProviderCard
import com.aisignallight.ui.components.ProviderCard
import com.aisignallight.ui.components.UsageBarItem
import com.aisignallight.ui.components.formatIsoTime
import com.aisignallight.ui.components.toBarItem
import java.time.Instant

private val W5H = 5L * 60 * 60 * 1000
private val W7D = 7L * 24 * 60 * 60 * 1000
private val W30D = 30L * 24 * 60 * 60 * 1000

private const val UI_PREFS = "ui_prefs"
private const val KEY_USAGE_GRID = "usage_grid"

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

/** 单个 provider 在 UI 层的渲染数据（网格/单列两种模式共用） */
private data class ProviderUiModel(
    val title: String,
    val shortTitle: String,
    val statusText: String,
    val statusColor: Color,
    val bars: List<UsageBarItem>,
    val footer: String?
)

/** provider 状态文案 + 颜色（正常绿 / 异常红 / 加载灰） */
@Composable
private fun providerStatus(data: Any?, error: String?): Pair<String, Color> {
    val text = when (error) {
        "disabled" -> stringResource(R.string.error_disabled)
        "no_token" -> stringResource(R.string.error_no_token)
        null -> if (data != null) "正常" else stringResource(R.string.loading)
        else -> error
    }
    val color = when (error) {
        null -> if (data != null) Color(0xFF4CAF50) else MaterialTheme.colorScheme.outline
        else -> Color(0xFFF44336)
    }
    return text to color
}

@Composable
fun UsageTab(
    usage: UsageSnapshot,
    config: AppConfig,
    isLoading: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val uiPrefs = remember { context.getSharedPreferences(UI_PREFS, Context.MODE_PRIVATE) }
    var gridMode by remember { mutableStateOf(uiPrefs.getBoolean(KEY_USAGE_GRID, true)) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = stringResource(R.string.usage_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            IconButton(onClick = {
                gridMode = !gridMode
                uiPrefs.edit().putBoolean(KEY_USAGE_GRID, gridMode).apply()
            }) {
                LayoutToggleIcon(gridMode = gridMode)
            }
        }

        if (gridMode) {
            UsageGrid(usage = usage, config = config, isLoading = isLoading, onRefresh = onRefresh)
        } else {
            UsageList(usage = usage, config = config, isLoading = isLoading, onRefresh = onRefresh)
        }
    }
}

/** 双列网格模式：DeepSeek 余额 tile + 一家一卡的同心环卡片 */
@Composable
private fun UsageGrid(
    usage: UsageSnapshot,
    config: AppConfig,
    isLoading: Boolean,
    onRefresh: () -> Unit
) {
    val models = buildProviderModels(usage, config)
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(top = 4.dp, bottom = 16.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        if (config.deepseek.enabled) {
            item(key = "deepseek") {
                DeepseekBalanceTile(state = usage.deepseek, modifier = Modifier.fillMaxWidth())
            }
        }
        items(models, key = { it.shortTitle }) { model ->
            GridProviderCard(
                title = model.shortTitle,
                statusText = model.statusText,
                statusColor = model.statusColor,
                bars = model.bars
            )
        }
        if (isLoading && allEmpty(usage, config)) {
            item(key = "loading", span = { GridItemSpan(maxLineSpan) }) {
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
        if (allNoToken(usage, config)) {
            item(key = "no_token", span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = "未配置 Token，请在设置中添加",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.outline,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp)
                )
            }
        }
        item(key = "refresh", span = { GridItemSpan(maxLineSpan) }) {
            RefreshButton(isLoading = isLoading, onRefresh = onRefresh)
        }
    }
}

/** 单列详情模式：DeepSeek 余额条 + 完整详情卡 */
@Composable
private fun UsageList(
    usage: UsageSnapshot,
    config: AppConfig,
    isLoading: Boolean,
    onRefresh: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (config.deepseek.enabled) {
            DeepseekBalanceCard(state = usage.deepseek)
        }

        buildProviderModels(usage, config).forEach { model ->
            ProviderCard(
                title = model.title,
                statusText = model.statusText,
                statusColor = model.statusColor,
                bars = model.bars,
                footer = model.footer
            )
        }

        if (isLoading && allEmpty(usage, config)) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
        }

        if (allNoToken(usage, config)) {
            Text(
                text = "未配置 Token，请在设置中添加",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.outline,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }

        RefreshButton(isLoading = isLoading, onRefresh = onRefresh)
    }
}

@Composable
private fun RefreshButton(isLoading: Boolean, onRefresh: () -> Unit) {
    Button(
        onClick = onRefresh,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        enabled = !isLoading
    ) {
        Text(text = if (isLoading) stringResource(R.string.loading) else stringResource(R.string.refresh))
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
        shortTitle = "Kimi",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = state?.lastUpdated?.let { "最后更新：${formatIsoTime(it)}" }
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
        shortTitle = "MiniMax",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = state?.lastUpdated?.let { "最后更新：${formatIsoTime(it)}" }
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

    val footer = buildString {
        state?.lastUpdated?.let { append("最后更新：${formatIsoTime(it)}") }
        data?.premium?.resetDate?.let {
            if (isNotEmpty()) append("  ·  ")
            append("重置：$it")
        }
    }.takeIf { it.isNotEmpty() }

    return ProviderUiModel(
        title = "Copilot",
        shortTitle = "Copilot",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = footer
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
        shortTitle = "火山引擎",
        statusText = statusText,
        statusColor = statusColor,
        bars = bars,
        footer = state?.lastUpdated?.let { "最后更新：${formatIsoTime(it)}" }
    )
}

private fun allEmpty(usage: UsageSnapshot, config: AppConfig): Boolean {
    return (!config.kimi.enabled || usage.kimi == null)
        && (!config.minimax.enabled || usage.minimax == null)
        && (!config.copilot.enabled || usage.copilot == null)
        && (!config.volcengine.enabled || usage.volcengine == null)
        && (!config.deepseek.enabled || usage.deepseek == null)
}

private fun allNoToken(usage: UsageSnapshot, config: AppConfig): Boolean {
    val enabledAndMissing = listOf(
        config.kimi.enabled to usage.kimi,
        config.minimax.enabled to usage.minimax,
        config.copilot.enabled to usage.copilot,
        config.volcengine.enabled to usage.volcengine,
        config.deepseek.enabled to usage.deepseek,
    ).filter { it.first } // 只看已启用的
    if (enabledAndMissing.isEmpty()) return false // 全部禁用时不该显示"未配置"
    return enabledAndMissing.all { it.second?.error == "no_token" }
}

/** 自绘布局切换图标（material-icons-core 没有 GridView）：网格 = 2x2 圆角块，列表 = 三条横线 */
@Composable
private fun LayoutToggleIcon(gridMode: Boolean, modifier: Modifier = Modifier) {
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(modifier = modifier.size(24.dp)) {
        val w = size.width
        if (gridMode) {
            val cell = w / 2f
            val inset = w / 16f
            val radius = w / 12f
            for (row in 0..1) {
                for (col in 0..1) {
                    drawRoundRect(
                        color = color,
                        topLeft = Offset(col * cell + inset, row * cell + inset),
                        size = Size(cell - inset * 2, cell - inset * 2),
                        cornerRadius = CornerRadius(radius, radius)
                    )
                }
            }
        } else {
            val lineH = w / 9f
            val slot = w / 3f
            val radius = CornerRadius(lineH / 2, lineH / 2)
            for (i in 0..2) {
                drawRoundRect(
                    color = color,
                    topLeft = Offset(0f, i * slot + (slot - lineH) / 2),
                    size = Size(w, lineH),
                    cornerRadius = radius
                )
            }
        }
    }
}
