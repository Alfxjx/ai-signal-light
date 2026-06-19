package com.aisignallight.data.remote

import com.aisignallight.domain.model.MinimaxUsageData
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

class MinimaxApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val URL = "https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains"
    }

    suspend fun fetch(token: String, proxyUrl: String?): MinimaxUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val response: HttpResponse = client.get(URL) {
            header("Authorization", "Bearer ${token.trim()}")
        }

        if (response.status.value >= 400) {
            val body = response.bodyAsText()
            throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
        }

        val json = response.body<JsonObject>()
        val baseResp = json["base_resp"]?.jsonObject
        val statusCode = baseResp?.get("status_code")?.jsonPrimitive?.doubleOrNull?.toInt()
        if (statusCode != 0) {
            val msg = baseResp?.get("status_msg")?.jsonPrimitive?.content ?: "api error"
            throw ApiException(msg)
        }

        val modelRemains = json["model_remains"]?.jsonArray
        val general = modelRemains?.find {
            it.jsonObject["model_name"]?.jsonPrimitive?.content == "general"
        }?.jsonObject ?: throw ApiException("general model not found")

        return MinimaxUsageData(
            fiveHourPercent = general["current_interval_remaining_percent"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0,
            weeklyPercent = general["current_weekly_remaining_percent"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0,
            fiveHourResetTime = general["remains_time"]?.jsonPrimitive?.content,
            weeklyResetTime = general["weekly_remains_time"]?.jsonPrimitive?.content
        )
    }
}
