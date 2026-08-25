package com.aisignallight.data.remote

import com.aisignallight.domain.model.KimiUsageData
import com.aisignallight.domain.model.UsageMetric
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.aisignallight.domain.utils.calcPercent
import javax.inject.Inject

class KimiApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val URL = "https://api.kimi.com/coding/v1/usages"
    }

    suspend fun fetch(token: String, proxyUrl: String?): KimiUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val response: HttpResponse = client.get(URL) {
            header("Authorization", "Bearer ${token.trim()}")
        }

        if (response.status.value >= 400) {
            val body = response.bodyAsText()
            throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
        }

        val json = response.body<JsonObject>()

        // 服务端 limit/used/remaining 为字符串数字，这里统一转 Int
        fun num(o: JsonObject?, key: String): Int =
            o?.get(key)?.jsonPrimitive?.content?.toIntOrNull() ?: 0
        fun metric(o: JsonObject?): UsageMetric {
            val limit = num(o, "limit")
            val used = num(o, "used")
            return UsageMetric(
                limit = limit,
                used = used,
                remaining = num(o, "remaining"),
                percent = calcPercent(used, limit),
                resetTime = o?.get("resetTime")?.jsonPrimitive?.content
            )
        }

        // 7 天周期窗口
        val usageObj = json["usage"]?.jsonObject ?: JsonObject(emptyMap())
        val codingWeekly = metric(usageObj)

        // 5 小时窗口（limits 数组第一个元素的 detail）
        val detail = json["limits"]?.jsonArray?.firstOrNull()?.jsonObject?.get("detail")?.jsonObject
        val codingFiveHour = metric(detail)

        return KimiUsageData(codingWeekly = codingWeekly, codingFiveHour = codingFiveHour)
    }
}