package com.aisignallight.data.remote

import com.aisignallight.domain.model.MimoUsageData
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import javax.inject.Inject

/**
 * 小米 MiMo 余额。只由 Web 控制台接口暴露，鉴权走小米账号会话 Cookie
 * （api-platform_serviceToken / userId 等），调模型的 sk- API Key 查不到余额。
 * 与桌面端 `fetchMimo` 同一套容错策略。
 */
class MimoApi @Inject constructor(
    private val clientProvider: KtorClientProvider
) {
    companion object {
        const val URL = "https://platform.xiaomimimo.com/api/v1/balance"

        val TOTAL_KEYS = setOf(
            "totalbalance", "balance", "total", "availablebalance",
            "usablebalance", "remainbalance", "remainingbalance", "amount"
        )
        val GRANTED_KEYS = setOf(
            "grantedbalance", "grantbalance", "giftbalance", "bonusbalance",
            "freebalance", "granted", "grant", "gift"
        )
        val PAID_KEYS = setOf(
            "paidbalance", "toppedupbalance", "rechargebalance", "cashbalance",
            "paid", "toppedup", "recharge", "cash"
        )
        val CURRENCY_KEYS = setOf("currency", "currencycode", "curr")
        val ENVELOPES = listOf("data", "result", "balance")
        val ALL_KEYS = TOTAL_KEYS + GRANTED_KEYS + PAID_KEYS + CURRENCY_KEYS
        val LOGIN_HINT = Regex("login|auth|token|unauthor|expire|session|未登录|登录", RegexOption.IGNORE_CASE)
    }

    suspend fun fetch(cookie: String, proxyUrl: String?): MimoUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val response: HttpResponse = client.get(URL) {
            header("Cookie", cookie.trim())
            header("Origin", "https://platform.xiaomimimo.com")
            header("Referer", "https://platform.xiaomimimo.com/#/console/balance")
            header("Accept", "application/json, text/plain, */*")
        }

        if (response.status.value == 401 || response.status.value == 403) {
            throw ApiException("登录态已过期，请重新登录 platform.xiaomimimo.com 并粘贴新的 Cookie")
        }
        if (response.status.value >= 400) {
            val body = response.bodyAsText()
            throw ApiException("HTTP ${response.status.value}: ${body.take(200)}")
        }

        val json = response.body<JsonObject>()

        return try {
            mapMimoBalance(json)
        } catch (e: Exception) {
            // 解析不出余额时再看业务错误：控制台可能用 code + message 表达失败
            val message = parseMessage(json)
            val code = (json["code"] as? JsonPrimitive)?.doubleOrNull?.toInt()
            val loginHint = json.containsKey("loginUrl") || json["success"]?.jsonPrimitiveOrNullFalse() == false ||
                (message != null && LOGIN_HINT.containsMatchIn(message))
            if (loginHint) {
                throw ApiException("登录态已过期，请重新登录 platform.xiaomimimo.com 并粘贴新的 Cookie")
            }
            if (json["success"]?.jsonPrimitiveOrNullFalse() == false || (code != null && code != 0 && code != 200)) {
                throw ApiException("API 错误${if (code != null) " $code" else ""}: ${message?.take(120) ?: "unknown"}")
            }
            throw e
        }
    }

    private fun parseMessage(json: JsonObject): String? =
        ((json["message"] ?: json["msg"]) as? JsonPrimitive)?.takeIf { it.isString }?.content

    /**
     * 小米未公开响应结构，两层容错（与桌面端 mapMimoBalance 同思路）：
     * 1) 剥掉 data / result 信封，兼容 balance 本身是嵌套对象；
     * 2) 字段名按「去下划线 + 忽略大小写」匹配，兼容 totalBalance / total_balance / TotalBalance。
     */
    fun mapMimoBalance(json: JsonObject): MimoUsageData {
        val root = unwrap(json)
        val total = firstNumber(root, TOTAL_KEYS) ?: throw ApiException("invalid response")
        return MimoUsageData(
            isAvailable = true,
            currency = firstString(root, CURRENCY_KEYS) ?: "CNY",
            totalBalance = total,
            grantedBalance = firstNumber(root, GRANTED_KEYS) ?: 0.0,
            paidBalance = firstNumber(root, PAID_KEYS) ?: (total - (firstNumber(root, GRANTED_KEYS) ?: 0.0))
        )
    }

    /** data / result / balance 任一层是对象就往里剥 */
    private fun unwrap(json: JsonObject): JsonObject {
        var current = json
        for (key in ENVELOPES) {
            val inner = current[key] as? JsonObject ?: continue
            // 剥掉后若内层没有任何我们认识的字段，说明剥错了，保留外层
            if (inner.keys.any { normalizeKey(it) in ALL_KEYS }) return inner
        }
        return current
    }

    /** 下划线与大小写都不敏感，让 total_balance / TotalBalance 都能命中 */
    private fun normalizeKey(key: String): String = key.replace("_", "").lowercase()

    private fun JsonObject.findByAliases(aliases: Set<String>): JsonElement? {
        // entries + associate：把「归一化 key」映射到 JSON 值本身
        val index = entries.associate { normalizeKey(it.key) to it.value }
        for (alias in aliases) {
            val value = index[alias] ?: continue
            if (value !is JsonNull) return value
        }
        return null
    }

    private fun firstNumber(obj: JsonObject, aliases: Set<String>): Double? {
        val el = obj.findByAliases(aliases) ?: return null
        val prim = el as? JsonPrimitive ?: return null
        return prim.doubleOrNull ?: prim.content.trim().toDoubleOrNull()
    }

    private fun firstString(obj: JsonObject, aliases: Set<String>): String? {
        val el = obj.findByAliases(aliases) ?: return null
        val prim = el as? JsonPrimitive ?: return null
        return prim.content.takeIf { it.isNotBlank() }
    }

    private fun JsonElement.jsonPrimitiveOrNullFalse(): Boolean? =
        (this as? JsonPrimitive)?.takeIf { it.isString || it.booleanOrNull != null }
            ?.content?.toBooleanStrictOrNull()
}
