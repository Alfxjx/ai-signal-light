package com.aisignallight.data.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.aisignallight.R
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.CopilotUsageData
import com.aisignallight.domain.model.KimiUsageData
import com.aisignallight.domain.model.MinimaxUsageData
import com.aisignallight.domain.model.UsageSnapshot
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {

    private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "用量阈值提醒",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "当 Kimi / MiniMax / Copilot 用量超过 warn/danger 阈值时提醒"
        }
        notificationManager.createNotificationChannel(channel)
    }

    fun checkAndNotify(config: AppConfig, usage: UsageSnapshot) {
        val warn = config.thresholds.warn
        val danger = config.thresholds.danger

        val alerts = buildList {
            usage.kimi?.data?.let { addAll(kimiAlerts(it, warn)) }
            usage.minimax?.data?.let { addAll(minimaxAlerts(it, warn)) }
            usage.copilot?.data?.let { addAll(copilotAlerts(it, warn)) }
        }

        if (alerts.isEmpty()) return

        val dangerAlerts = alerts.filter { it.percent >= danger }
        val warnAlerts = alerts.filter { it.percent < danger }

        val title = if (dangerAlerts.isNotEmpty()) {
            "用量已超过 danger 阈值 (${danger}%)"
        } else {
            "用量已超过 warn 阈值 (${warn}%)"
        }
        val content = (dangerAlerts + warnAlerts).joinToString(", ") { "${it.provider} ${it.label} ${it.percent}%" }

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setPriority(
                if (dangerAlerts.isNotEmpty()) NotificationCompat.PRIORITY_HIGH
                else NotificationCompat.PRIORITY_DEFAULT
            )
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun kimiAlerts(data: KimiUsageData, warn: Int): List<Alert> {
        return listOf(
            Alert("Kimi", "全部配额", data.total.percent),
            Alert("Kimi", "本周编码", data.codingWeekly.percent),
            Alert("Kimi", "5 小时窗口", data.codingFiveHour.percent)
        ).filter { it.percent >= warn }
    }

    private fun minimaxAlerts(data: MinimaxUsageData, warn: Int): List<Alert> {
        // MiniMax 返回的是剩余百分比，需要翻转为已用百分比
        return listOf(
            Alert("MiniMax", "5 小时窗口", (100 - data.fiveHourPercent).coerceIn(0, 100)),
            Alert("MiniMax", "本周", (100 - data.weeklyPercent).coerceIn(0, 100))
        ).filter { it.percent >= warn }
    }

    private fun copilotAlerts(data: CopilotUsageData, warn: Int): List<Alert> {
        return listOf(
            Alert("Copilot", "Premium", data.premium.percent)
        ).filter { it.percent >= warn }
    }

    private data class Alert(
        val provider: String,
        val label: String,
        val percent: Int
    )

    companion object {
        const val CHANNEL_ID = "usage_threshold_alerts"
        const val NOTIFICATION_ID = 1001
    }
}
