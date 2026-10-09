package com.aisignallight.data.remote

import com.aisignallight.domain.model.UsageMetric
import com.aisignallight.domain.model.VolcengineProviderConfig
import com.aisignallight.domain.model.VolcengineUsageData
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import javax.inject.Inject

/**
 * 火山方舟 Ark Coding Plan 额度：走官方 OpenAPI + V4 签名（AK/SK 长期有效）。
 * 签名算法见 [VolcengineSign]，与桌面端 `src/main/volcengine-sign.ts` 一致。
 */
class VolcengineApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val OPEN_HOST = "open.volcengineapi.com"
        const val OPEN_REGION = "cn-beijing"
        const val OPEN_SERVICE = "ark"
        const val ACTION = "GetCodingPlanUsage"
        const val VERSION = "2024-01-01"
        val QUOTA_LEVELS = listOf("session", "weekly", "monthly")
    }

    suspend fun fetch(config: VolcengineProviderConfig, proxyUrl: String?): VolcengineUsageData {
        val accessKey = config.accessKey.trim()
        val secretKey = config.secretKey.trim()
        if (accessKey.isBlank() || secretKey.isBlank()) throw ApiException("no_token")

        val client: HttpClient = clientProvider.create(proxyUrl)
        val signed = VolcengineSign.sign(
            VolcengineSign.Input(
                host = OPEN_HOST,
                region = OPEN_REGION,
                service = OPEN_SERVICE,
                action = ACTION,
                version = VERSION,
                query = mapOf("Region" to OPEN_REGION),
                accessKey = accessKey,
                secretKey = secretKey,
                instant = Instant.now()
            )
        )

        val response: HttpResponse = client.get(VolcengineSign.buildUrl(OPEN_HOST, signed.canonicalQuery)) {
            // 注意：此处裸 headers 会解析到 HttpRequestBuilder.headers，必须用 signed. 前缀
            signed.headers.forEach { (name, value) -> header(name, value) }
        }

        // 鉴权失败时可能返回 HTTP 200 + ResponseMetadata.Error，需先检查返回体
        val json = response.body<JsonObject>()
        val errCode = json["ResponseMetadata"]?.jsonObject?.get("Error")?.jsonObject
            ?.get("Code")?.jsonPrimitive?.content
        if (errCode != null) {
            throw ApiException("AK/SK 调用失败: $errCode")
        }
        if (response.status.value >= 400) {
            throw ApiException("AK/SK 调用失败: HTTP ${response.status.value}")
        }

        val quota: List<JsonElement> = json["Result"]?.jsonObject?.get("QuotaUsage")?.jsonArray
            ?: emptyList()
        val present = quota.mapNotNull { it.jsonObject["Level"]?.jsonPrimitive?.content }.toSet()
        val missing = QUOTA_LEVELS.filterNot { present.contains(it) }
        if (missing.isNotEmpty()) {
            throw ApiException("AK/SK 响应缺少 ${missing.joinToString("/")} 档")
        }

        return mapQuota(quota)
    }

    /** 重置时间字段在不同接口上分别叫 ResetTimestamp / ResetTime，这里兼容两种 */
    private fun mapQuota(quota: List<JsonElement>): VolcengineUsageData {
        fun metric(level: String): UsageMetric {
            val item = quota.firstOrNull {
                it.jsonObject["Level"]?.jsonPrimitive?.content == level
            }?.jsonObject
            val percent = item?.get("Percent")?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
            val limit = item?.get("Cap")?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
            val raw = item?.get("ResetTimestamp") ?: item?.get("ResetTime")
            val resetSec = raw?.jsonPrimitive?.content?.toLongOrNull()
            val resetTime = if (resetSec != null && resetSec > 0) {
                Instant.ofEpochSecond(resetSec).toString()
            } else null
            return UsageMetric(
                limit = limit,
                used = 0,
                remaining = 0,
                percent = percent.coerceIn(0, 100),
                resetTime = resetTime
            )
        }

        return VolcengineUsageData(
            session = metric("session"),
            weekly = metric("weekly"),
            monthly = metric("monthly")
        )
    }
}
