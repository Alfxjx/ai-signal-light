package com.aisignallight.data.remote

import com.aisignallight.domain.model.UsageMetric
import com.aisignallight.domain.model.VolcengineProviderConfig
import com.aisignallight.domain.model.VolcengineUsageData
import com.aisignallight.domain.repository.ConfigRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import javax.inject.Inject

/**
 * 火山方舟 Ark Coding Plan 额度。
 *
 * 两条通道，优先 AK/SK：官方 OpenAPI（V4 签名，长期有效），失败回退控制台 Cookie
 * （登录态约一周就失效）。与桌面端 `usage-monitor.ts` 的 fetchVolcengine 同一套策略。
 */
class VolcengineApi @Inject constructor(
    private val clientProvider: KtorClientProvider,
    private val configRepository: ConfigRepository
) {
    companion object {
        const val URL =
            "https://console.volcengine.com/api/top/ark/cn-beijing/2024-01-01/GetCodingPlanUsage"
        const val OPEN_HOST = "open.volcengineapi.com"
        const val OPEN_REGION = "cn-beijing"
        const val OPEN_SERVICE = "ark"
        val QUOTA_LEVELS = listOf("session", "weekly", "monthly")
    }

    suspend fun fetch(config: VolcengineProviderConfig, proxyUrl: String?): VolcengineUsageData {
        if (config.accessKey.isNotBlank() && config.secretKey.isNotBlank()) {
            try {
                return fetchByAksk(config.accessKey, config.secretKey, proxyUrl)
            } catch (e: Exception) {
                // AK/SK 不可用时回退 Cookie，而不是让整个 provider 挂掉
                if (config.cookie.isBlank() || config.csrfToken.isBlank()) throw e
                return fetchByCookie(config.cookie, config.csrfToken, proxyUrl)
            }
        }
        if (config.cookie.isBlank() || config.csrfToken.isBlank()) {
            throw ApiException("no_token")
        }
        return fetchByCookie(config.cookie, config.csrfToken, proxyUrl)
    }

    /** AK/SK 通道：官方 OpenAPI + V4 签名。缺档时抛错，交由调用方回退 Cookie。 */
    private suspend fun fetchByAksk(
        accessKey: String,
        secretKey: String,
        proxyUrl: String?
    ): VolcengineUsageData {
        val client: HttpClient = clientProvider.create(proxyUrl)
        val signed = VolcengineSign.sign(
            VolcengineSign.Input(
                host = OPEN_HOST,
                region = OPEN_REGION,
                service = OPEN_SERVICE,
                action = "GetCodingPlanUsage",
                version = "2024-01-01",
                query = mapOf("Region" to OPEN_REGION),
                accessKey = accessKey.trim(),
                secretKey = secretKey.trim(),
                instant = Instant.now()
            )
        )
        val response: HttpResponse = client.get(VolcengineSign.buildUrl(OPEN_HOST, signed.canonicalQuery)) {
            // 注意：此处裸 headers 会解析到 HttpRequestBuilder.headers，必须用 signed. 前缀
            signed.headers.forEach { (name, value) -> header(name, value) }
        }

        val json = response.body<JsonObject>()
        val apiErr = json["ResponseMetadata"]?.jsonObject?.get("Error")?.jsonObject
        val errCode = apiErr?.get("Code")?.jsonPrimitive?.content
        if (errCode != null) {
            throw ApiException("AK/SK 调用失败: $errCode")
        }
        if (response.status.value >= 400) {
            throw ApiException("AK/SK 调用失败: HTTP ${response.status.value}")
        }

        val quota = json["Result"]?.jsonObject?.get("QuotaUsage")?.jsonArray
        val present = (quota ?: emptyList())
            .mapNotNull { it.jsonObject["Level"]?.jsonPrimitive?.content }
            .toSet()
        val missing = QUOTA_LEVELS.filter { !present.contains(it) }
        if (missing.isNotEmpty()) {
            // AK/SK 通道的档位可能少于控制台 Cookie 通道，此时回退而不是展示 0
            throw ApiException("AK/SK 响应缺少 ${missing.joinToString("/")} 档")
        }

        return mapQuota(quota!!)
    }

    /** Cookie 通道：控制台内部网关，依赖登录态 */
    private suspend fun fetchByCookie(
        cookie: String,
        csrfToken: String,
        proxyUrl: String?
    ): VolcengineUsageData {
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

        val data = mapQuota(quota)
        // 成功后把服务端下发的 cookie 合并回配置，跟随登录态续期
        syncCookies(response, cookie, csrfToken)
        return data
    }

    /** 重置时间字段在两条通道上分别叫 ResetTimestamp / ResetTime，这里兼容两种 */
    private fun mapQuota(quota: kotlinx.serialization.json.JsonArray): VolcengineUsageData {
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

    /**
     * 合并服务端下发的 Set-Cookie 回配置。控制台会在每次响应里轮换登录态
     * （csrfToken 及其它 session cookie），只回写 csrfToken 会把续期丢掉，
     * 导致配置里的 cookie 约一天就过期。
     */
    private suspend fun syncCookies(response: HttpResponse, currentCookie: String, currentCsrf: String) {
        val lines: List<String> = response.headers.getAll(HttpHeaders.SetCookie) ?: return
        if (lines.isEmpty()) return

        val jar = LinkedHashMap(parseCookieJar(currentCookie))
        for (line in lines) {
            mergeCookiePair(jar, line.substringBefore(';'))
        }
        val nextCookie = jar.entries.joinToString("; ") { "${it.key}=${it.value}" }
        val nextCsrf = jar["csrfToken"] ?: currentCsrf
        if (nextCookie == currentCookie && nextCsrf == currentCsrf) return

        val cur = configRepository.getConfig()
        configRepository.saveConfig(
            cur.copy(volcengine = cur.volcengine.copy(cookie = nextCookie, csrfToken = nextCsrf))
        )
    }
}

/** "a=1; b=2" → 有序 map，容忍空片段与缺失等号 */
internal fun parseCookieJar(cookie: String): Map<String, String> {
    val jar = LinkedHashMap<String, String>()
    for (part in cookie.split(';')) {
        val kv = part.trim()
        if (kv.isEmpty()) continue
        val eq = kv.indexOf('=')
        if (eq <= 0) continue
        jar[kv.substring(0, eq).trim()] = kv.substring(eq + 1).trim()
    }
    return jar
}

/** 把 Set-Cookie 的首个 name=value 合并进 jar（同名覆盖） */
internal fun mergeCookiePair(jar: MutableMap<String, String>, pair: String) {
    val kv = pair.trim()
    val eq = kv.indexOf('=')
    if (eq <= 0) return
    jar[kv.substring(0, eq).trim()] = kv.substring(eq + 1).trim()
}
