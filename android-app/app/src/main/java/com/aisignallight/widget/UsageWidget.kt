package com.aisignallight.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.aisignallight.MainActivity
import com.aisignallight.R
import com.aisignallight.data.local.UsageSnapshotStore
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.UsageSnapshot
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.ui.components.deepseekSymbol
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** 进度条固定宽度：Glance 的 fillMaxWidth 不支持比例参数，只能按 dp 自算已用宽度 */
private val NAME_WIDTH = 58.dp
private val BAR_WIDTH = 110.dp
private val BAR_HEIGHT = 6.dp

private val COLOR_OK = ColorProvider(Color(0xFF43A047))
private val COLOR_WARN = ColorProvider(Color(0xFFFFB300))
private val COLOR_DANGER = ColorProvider(Color(0xFFE53935))
private val TRACK = ColorProvider(Color(0x33808080))

/** 小组件读配置/快照：不在 Hilt 注入路径上，用 EntryPoint 取单例 */
@EntryPoint
@InstallIn(SingletonComponent::class)
interface UsageWidgetEntryPoint {
    fun configRepository(): ConfigRepository
    fun usageSnapshotStore(): UsageSnapshotStore
}

/** 一行渲染数据；percent 为 null 表示不画进度条（DeepSeek 显示余额） */
private data class WidgetRow(
    val name: String,
    val percent: Int?,
    val text: String,
    val warn: Int,
    val danger: Int
)

class UsageWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entryPoint = EntryPointAccessors.fromApplication(context, UsageWidgetEntryPoint::class.java)
        val config = entryPoint.configRepository().getConfig()
        val snapshot = entryPoint.usageSnapshotStore().snapshotFlow.first()

        provideContent {
            GlanceTheme {
                WidgetContent(context = context, config = config, snapshot = snapshot)
            }
        }
    }
}

@Composable
private fun WidgetContent(
    context: Context,
    config: AppConfig,
    snapshot: UsageSnapshot?
) {
    val rows = buildRows(config, snapshot)
    val updatedAt = updatedLabel(snapshot)

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .cornerRadius(16.dp)
            .background(GlanceTheme.colors.background)
            .padding(12.dp)
            .clickable(actionStartActivity(Intent(context, MainActivity::class.java)))
    ) {
        Text(
            text = context.getString(R.string.widget_title),
            style = TextStyle(
                color = GlanceTheme.colors.onBackground,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
            ),
            maxLines = 1
        )

        Spacer(modifier = GlanceModifier.height(6.dp))

        if (rows.isEmpty()) {
            Text(
                text = context.getString(R.string.widget_empty),
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp)
            )
        } else {
            rows.forEach { row -> ProviderRow(row) }
        }

        if (updatedAt != null) {
            Spacer(modifier = GlanceModifier.height(6.dp))
            Text(
                text = context.getString(R.string.updated_at, updatedAt),
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp),
                maxLines = 1
            )
        }
    }
}

@Composable
private fun ProviderRow(row: WidgetRow) {
    Row(
        modifier = GlanceModifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.Vertical.CenterVertically
    ) {
        Text(
            text = row.name,
            modifier = GlanceModifier.width(NAME_WIDTH),
            style = TextStyle(color = GlanceTheme.colors.onBackground, fontSize = 12.sp),
            maxLines = 1
        )

        Spacer(modifier = GlanceModifier.width(6.dp))

        val percent = row.percent
        if (percent != null) {
            ProgressBar(percent = percent, color = barColor(percent, row.warn, row.danger))
        } else {
            // 无进度条的行占同样的宽度，让右侧数值纵向对齐
            Spacer(modifier = GlanceModifier.width(BAR_WIDTH))
        }

        Spacer(modifier = GlanceModifier.width(6.dp))

        Text(
            text = row.text,
            style = TextStyle(color = GlanceTheme.colors.onBackground, fontSize = 12.sp),
            maxLines = 1
        )
    }
}

/**
 * Glance 没有 Compose 的 LinearProgressIndicator，也没有 fillMaxWidth(fraction)，
 * 因此用固定宽度的槽 + 按百分比算出的 dp 宽度自绘（Row 默认左对齐，已用条贴左）。
 */
@Composable
private fun ProgressBar(
    percent: Int,
    color: ColorProvider,
    modifier: GlanceModifier = GlanceModifier
) {
    val safePercent = percent.coerceIn(0, 100)

    Row(
        modifier = modifier
            .width(BAR_WIDTH)
            .height(BAR_HEIGHT)
            .cornerRadius(3.dp)
            .background(TRACK)
    ) {
        if (safePercent > 0) {
            Spacer(
                modifier = GlanceModifier
                    .width((BAR_WIDTH.value * safePercent / 100f).dp)
                    .height(BAR_HEIGHT)
                    .cornerRadius(3.dp)
                    .background(color)
            )
        }
    }
}

private fun barColor(percent: Int, warn: Int, danger: Int): ColorProvider = when {
    percent >= danger -> COLOR_DANGER
    percent >= warn -> COLOR_WARN
    else -> COLOR_OK
}

/** 只列出「已启用且已配置」的服务商；无快照数据时显示 — */
private fun buildRows(config: AppConfig, snapshot: UsageSnapshot?): List<WidgetRow> {
    val warn = config.thresholds.warn
    val danger = config.thresholds.danger
    val rows = mutableListOf<WidgetRow>()

    if (config.kimi.enabled && config.kimi.token.isNotBlank()) {
        val used = snapshot?.kimi?.data?.let {
            maxOf(it.codingFiveHour.percent, it.codingWeekly.percent)
        }
        rows += WidgetRow("Kimi", used, used.percentText(), warn, danger)
    }

    if (config.minimax.enabled && config.minimax.token.isNotBlank()) {
        // MiniMax 返回剩余百分比，翻转成已用
        val used = snapshot?.minimax?.data?.let {
            (100 - maxOf(it.fiveHourPercent, it.weeklyPercent)).coerceIn(0, 100)
        }
        rows += WidgetRow("MiniMax", used, used.percentText(), warn, danger)
    }

    if (config.copilot.enabled && config.copilot.token.isNotBlank()) {
        val used = snapshot?.copilot?.data?.premium?.percent
        rows += WidgetRow("Copilot", used, used.percentText(), warn, danger)
    }

    if (config.volcengine.enabled &&
        config.volcengine.cookie.isNotBlank() &&
        config.volcengine.csrfToken.isNotBlank()
    ) {
        val used = snapshot?.volcengine?.data?.let {
            maxOf(it.session.percent, it.weekly.percent, it.monthly.percent)
        }
        rows += WidgetRow("火山引擎", used, used.percentText(), warn, danger)
    }

    if (config.deepseek.enabled && config.deepseek.token.isNotBlank()) {
        val text = snapshot?.deepseek?.data?.let {
            "${deepseekSymbol(it.currency)}${"%.2f".format(it.totalBalance)}"
        } ?: "—"
        rows += WidgetRow("DeepSeek", null, text, warn, danger)
    }

    return rows
}

private fun Int?.percentText(): String = this?.let { "$it%" } ?: "—"

private fun updatedLabel(snapshot: UsageSnapshot?): String? {
    val newest = listOfNotNull(
        snapshot?.kimi?.lastUpdated,
        snapshot?.minimax?.lastUpdated,
        snapshot?.copilot?.lastUpdated,
        snapshot?.volcengine?.lastUpdated,
        snapshot?.deepseek?.lastUpdated
    ).filter { it.isNotBlank() }.maxOrNull() ?: return null

    return runCatching {
        DateTimeFormatter.ofPattern("HH:mm")
            .format(Instant.parse(newest).atZone(ZoneId.systemDefault()))
    }.getOrNull()
}
