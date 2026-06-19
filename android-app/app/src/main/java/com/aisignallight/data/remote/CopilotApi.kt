package com.aisignallight.data.remote

import com.aisignallight.domain.model.CopilotChatData
import com.aisignallight.domain.model.CopilotPremiumData
import com.aisignallight.domain.model.CopilotUsageData
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import com.aisignallight.domain.utils.calcPercent
import javax.inject.Inject

class CopilotApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val URL = "https://github.com/github-copilot/chat/entitlement"
    }

    suspend fun fetch(cookie: String, proxyUrl: String?): CopilotUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val response: HttpResponse = client.get(URL) {
            header("Cookie", cookie.trim())
            header("Referer", "https://github.com/copilot")
            header("Accept", "application/json, text/plain, */*")
        }

        if (response.status.value >= 400) {
            val body = response.bodyAsText()
            throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
        }

        val json = response.body<JsonObject>()
        val quotas = json["quotas"]?.jsonObject ?: throw ApiException("invalid response, cookie may be incorrect or expired")
        val limits = quotas["limits"]?.jsonObject ?: JsonObject(emptyMap())
        val remaining = quotas["remaining"]?.jsonObject ?: JsonObject(emptyMap())

        val premiumLimit = limits["premiumInteractions"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val premiumRemaining = remaining["premiumInteractions"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
        val premiumUsed = (premiumLimit - premiumRemaining).coerceAtLeast(0)

        return CopilotUsageData(
            premium = CopilotPremiumData(
                limit = premiumLimit,
                remaining = premiumRemaining,
                percent = calcPercent(premiumUsed, premiumLimit),
                resetDate = quotas["resetDate"]?.jsonPrimitive?.content,
                resetDateUtc = quotas["resetDateUtc"]?.jsonPrimitive?.content
            ),
            chat = CopilotChatData(
                percent = remaining["chatPercentage"]?.jsonPrimitive?.doubleOrNull?.toInt() ?: 0
            ),
            plan = json["plan"]?.jsonPrimitive?.content,
            licenseType = json["licenseType"]?.jsonPrimitive?.content
        )
    }
}

class ApiException(message: String) : Exception(message)
