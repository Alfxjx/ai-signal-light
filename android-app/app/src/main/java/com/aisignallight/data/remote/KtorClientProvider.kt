package com.aisignallight.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import java.net.InetSocketAddress
import java.net.Proxy
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class KtorClientProvider @Inject constructor() {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    /**
     * Creates a new Ktor HttpClient optionally configured with a proxy.
     * Each provider may use its own client instance to keep headers/cookies isolated.
     */
    fun create(proxyUrl: String? = null): HttpClient {
        return HttpClient(OkHttp) {
            install(HttpTimeout) {
                requestTimeoutMillis = REQUEST_TIMEOUT_MS
                connectTimeoutMillis = 5000
                socketTimeoutMillis = 8000
            }
            install(ContentNegotiation) {
                json(json)
            }
            engine {
                proxyUrl?.let { parseProxy(it) }?.let { proxy ->
                    this.proxy = proxy
                }
            }
        }
    }

    private fun parseProxy(urlStr: String): Proxy? {
        if (urlStr.isBlank()) return null
        return try {
            val url = java.net.URL(urlStr.trim())
            val port = if (url.port != -1) url.port else (if (url.protocol == "https") 443 else 80)
            Proxy(Proxy.Type.HTTP, InetSocketAddress(url.host, port))
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        const val REQUEST_TIMEOUT_MS = 8000L

        // Browser-style UA to avoid being rejected by some APIs
        val BROWSER_HEADERS = mapOf(
            "User-Agent" to "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept" to "application/json, text/plain, */*",
            "Accept-Language" to "zh-CN,zh;q=0.9,en;q=0.8"
        )
    }
}
