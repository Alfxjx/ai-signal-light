package com.aisignallight.data.remote

import com.aisignallight.domain.model.DeepseekUsageData
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

class DeepseekApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val URL = "https://api.deepseek.com/user/balance"
    }

    suspend fun fetch(token: String, proxyUrl: String?): DeepseekUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val response: HttpResponse = client.get(URL) {
            header("Authorization", "Bearer ${token.trim()}")
        }

        if (response.status.value >= 400) {
            val body = response.bodyAsText()
            throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
        }

        val json = response.body<JsonObject>()
        val info = json["balance_infos"]?.jsonArray?.firstOrNull()?.jsonObject
            ?: throw ApiException("no balance info")

        return DeepseekUsageData(
            isAvailable = json["is_available"]?.jsonPrimitive?.content?.toBoolean() ?: false,
            currency = info["currency"]?.jsonPrimitive?.content,
            totalBalance = info["total_balance"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
            grantedBalance = info["granted_balance"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
            toppedUpBalance = info["topped_up_balance"]?.jsonPrimitive?.doubleOrNull ?: 0.0
        )
    }
}