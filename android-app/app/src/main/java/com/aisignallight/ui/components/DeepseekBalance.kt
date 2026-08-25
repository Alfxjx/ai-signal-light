package com.aisignallight.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aisignallight.R
import com.aisignallight.domain.model.DeepseekUsageData
import com.aisignallight.domain.model.UsageProviderState
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** DeepSeek 卡片专属深色渐变（深/浅主题共用） */
private val DsGradient = Brush.linearGradient(listOf(Color(0xFF20304F), Color(0xFF2C2350)))
private const val DsLabelColor = 0xFFB8C4E8

/** 币种 -> 货币符号（与桌面端一致） */
internal fun deepseekSymbol(currency: String?): String = when (currency) {
    "CNY" -> "¥"
    "USD" -> "$"
    else -> currency?.let { "$it " } ?: ""
}

/** ISO 时间 -> HH:mm:ss（本地时区），解析失败原样返回 */
internal fun formatIsoTime(iso: String): String {
    return try {
        val instant = Instant.parse(iso)
        val local = instant.atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("HH:mm:ss").format(local)
    } catch (_: Exception) {
        iso
    }
}

@Composable
private fun dsStatusText(data: DeepseekUsageData?, error: String?): String = when (error) {
    "disabled" -> stringResource(R.string.error_disabled)
    "no_token" -> stringResource(R.string.error_no_token)
    null -> if (data != null) "正常" else stringResource(R.string.loading)
    else -> error
}

/** 网格模式的 DeepSeek 余额 tile：渐变底 + 居中大号余额 */
@Composable
fun DeepseekBalanceTile(
    state: UsageProviderState<DeepseekUsageData>?,
    modifier: Modifier = Modifier
) {
    val data = state?.data
    val error = state?.error
    val statusText = dsStatusText(data, error)

    Box(
        modifier = modifier
            .background(DsGradient, RoundedCornerShape(16.dp))
            .padding(horizontal = 12.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "DeepSeek",
                style = MaterialTheme.typography.labelMedium,
                color = Color(DsLabelColor)
            )
            if (data != null) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "${deepseekSymbol(data.currency)}${"%.2f".format(data.totalBalance)}",
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Text(
                    text = "余额",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(DsLabelColor)
                )
            } else {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (error == null) Color(DsLabelColor) else Color(0xFFFFB4AB)
                )
            }
        }
    }
}

/** 单列模式的 DeepSeek 余额条：左侧大号余额 + 赠送明细，右侧更新时间 */
@Composable
fun DeepseekBalanceCard(
    state: UsageProviderState<DeepseekUsageData>?,
    modifier: Modifier = Modifier
) {
    val data = state?.data
    val error = state?.error
    val statusText = dsStatusText(data, error)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(DsGradient, RoundedCornerShape(16.dp))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = "DeepSeek 余额",
                style = MaterialTheme.typography.labelMedium,
                color = Color(DsLabelColor)
            )
            if (data != null) {
                Text(
                    text = "${deepseekSymbol(data.currency)}${"%.2f".format(data.totalBalance)}",
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    letterSpacing = (-0.5).sp
                )
                if (data.grantedBalance > 0) {
                    Text(
                        text = "含赠送 ${deepseekSymbol(data.currency)}${"%.2f".format(data.grantedBalance)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(DsLabelColor)
                    )
                }
            } else {
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (error == null) Color(DsLabelColor) else Color(0xFFFFB4AB)
                )
            }
        }
        state?.lastUpdated?.let {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = formatIsoTime(it),
                    style = MaterialTheme.typography.labelMedium,
                    color = Color(DsLabelColor)
                )
                Text(
                    text = "更新",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(DsLabelColor)
                )
            }
        }
    }
}
