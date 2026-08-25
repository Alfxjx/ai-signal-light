package com.aisignallight.data.remote

import com.aisignallight.domain.model.UsageMetric
import com.aisignallight.domain.model.VolcengineUsageData
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import javax.inject.Inject

class VolcengineApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val URL =
            "https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage"
    }

    suspend fun fetch(cookie: String, csrfToken: String, proxyUrl: String?): VolcengineUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val response: HttpResponse = client.post(URL) {
            header("Cookie", cookie.trim())
            header("x-csrf-token", csrfToken.trim())
            header("Content-Type", "application/json")
            header("Origin", "https://console.volcengine.com")
            header("Referer", "https://console.volcengine.com/ark/region:cn-beijing/subscription/coding-plan")
        }

        // 鉴权失败时可能返回 HTTP 200 + ResponseMetadata.Error，需先检查返回体
        val json = response.body<JsonObject>()
        val apiErr = json["ResponseMetadata"]?.jsonObject?.get("Error")?.jsonObject
        val errCode = apiErr?.get("Code")?.jsonPrimitive?.content
        if (errCode != null) {
            if (errCode.contains("csrf", ignoreCase = true) || errCode.contains("token", ignoreCase = true)) {
                throw ApiException("x-csrf-token 无效或已过期，请从 DevTools 重新复制完整值")
            }
            if (errCode.contains("login", ignoreCase = true)
                || errCode.contains("signature", ignoreCase = true)
                || errCode.contains("accesskey", ignoreCase = true)
                || errCode.contains("credential", ignoreCase = true)
                || errCode.contains("auth", ignoreCase = true)
                || errCode.contains("session", ignoreCase = true)
            ) {
                throw ApiException("登录态已过期，请更新 Cookie / x-csrf-token")
            }
            throw ApiException("API 错误: $errCode")
        }
        if (response.status.value == 401 || response.status.value == 403) {
            throw ApiException("登录态已过期，请更新 Cookie / x-csrf-token")
        }
        if (response.status.value >= 400) {
            val body = response.bodyAsText()
            throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
        }

        val quota = json["Result"]?.jsonObject?.get("QuotaUsage")?.jsonArray
            ?: throw ApiException("invalid response")

        fun metric(level: String): UsageMetric {
            val item = quota.firstOrNull {
                it.jsonObject["Level"]?.jsonPrimitive?.content == level
            }?.jsonObject
            val percent = item?.get("Percent")?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
            val limit = item?.get("Cap")?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
            val resetSec = item?.get("ResetTimestamp")?.jsonPrimitive?.content?.toLongOrNull()
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