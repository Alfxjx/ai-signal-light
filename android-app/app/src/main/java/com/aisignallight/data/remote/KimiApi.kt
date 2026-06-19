package com.aisignallight.data.remote

import com.aisignallight.domain.model.KimiUsageData
import com.aisignallight.domain.model.UsageMetric
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.aisignallight.domain.utils.calcPercent
import javax.inject.Inject

class KimiApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val URL = "https://www.kimi.com/apiv2/kimi.gateway.billing.v1.BillingService/GetUsages"
    }

    suspend fun fetch(token: String, proxyUrl: String?): KimiUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val response: HttpResponse = client.post(URL) {
            header("Authorization", "Bearer ${token.trim()}")
            contentType(ContentType.Application.Json)
            setBody(mapOf("scope" to listOf("FEATURE_CODING")))
        }

        if (response.status.value >= 400) {
            val body = response.bodyAsText()
            throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
        }

        val json = response.body<JsonObject>()

        val totalObj = json["totalQuota"]?.jsonObject ?: JsonObject(emptyMap())
        val totalLimit = totalObj["limit"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val totalUsed = totalObj["used"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val totalRemaining = totalObj["remaining"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val total = UsageMetric(
            limit = totalLimit,
            used = totalUsed,
            remaining = totalRemaining,
            percent = calcPercent(totalUsed, totalLimit)
        )

        val usages = json["usages"]?.jsonArray
        val usage = usages?.firstOrNull()?.jsonObject ?: JsonObject(emptyMap())
        val dTotal = usage["detail"]?.jsonObject ?: JsonObject(emptyMap())
        val limits = usage["limits"]?.jsonArray
        val d5h = limits?.firstOrNull()?.jsonObject?.get("detail")?.jsonObject ?: JsonObject(emptyMap())

        val weeklyLimit = dTotal["limit"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val weeklyUsed = dTotal["used"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val weeklyRemaining = dTotal["remaining"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val codingWeekly = UsageMetric(
            limit = weeklyLimit,
            used = weeklyUsed,
            remaining = weeklyRemaining,
            percent = calcPercent(weeklyUsed, weeklyLimit),
            resetTime = dTotal["resetTime"]?.jsonPrimitive?.content
        )

        val fiveHourLimit = d5h["limit"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val fiveHourUsed = d5h["used"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val fiveHourRemaining = d5h["remaining"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val codingFiveHour = UsageMetric(
            limit = fiveHourLimit,
            used = fiveHourUsed,
            remaining = fiveHourRemaining,
            percent = calcPercent(fiveHourUsed, fiveHourLimit),
            resetTime = d5h["resetTime"]?.jsonPrimitive?.content
        )

        return KimiUsageData(total = total, codingWeekly = codingWeekly, codingFiveHour = codingFiveHour)
    }
}
