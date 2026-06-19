package com.aisignallight.data.remote

import com.aisignallight.domain.model.AssistantStatus
import com.aisignallight.domain.model.ClaudeHookPayload
import com.aisignallight.domain.model.PendingHook
import com.aisignallight.domain.model.SyncEvent
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.ConnectionState
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.http.HttpHeaders
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import io.ktor.client.request.header
import io.ktor.http.URLProtocol
import io.ktor.http.encodedPath
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DesktopSyncClient @Inject constructor(
    private val configRepository: ConfigRepository
) {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val _connectionState = MutableStateFlow(ConnectionState())
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _messages = MutableSharedFlow<SyncEvent>()
    val messages: SharedFlow<SyncEvent> = _messages.asSharedFlow()

    private var scope: CoroutineScope? = null

    fun connect() {
        if (scope?.isActive == true) return
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob()).also { start(it) }
    }

    fun disconnect() {
        scope?.cancel()
        scope = null
        _connectionState.value = ConnectionState(isConnected = false)
    }

    private fun start(scope: CoroutineScope) {
        scope.launch {
            var attempt = 0
            while (isActive) {
                val conn = configRepository.getDesktopConnection()
                if (conn == null || conn.apiKey.isNullOrBlank()) {
                    _connectionState.value = ConnectionState(
                        isConnected = false,
                        error = "未配置桌面连接，请先扫码导入"
                    )
                    delay(5000)
                    continue
                }

                _connectionState.value = _connectionState.value.copy(error = null)
                try {
                    runSession(conn.host, conn.port, conn.apiKey)
                    attempt = 0
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val msg = e.message ?: e.toString()
                    _connectionState.value = ConnectionState(
                        isConnected = false,
                        lastSyncAt = _connectionState.value.lastSyncAt,
                        error = msg
                    )
                    attempt++
                    val backoff = (1000L * (1 shl attempt.coerceAtMost(5))).coerceAtMost(30000L)
                    delay(backoff)
                }
            }
        }
    }

    private suspend fun runSession(host: String, port: Int, apiKey: String) {
        val client = HttpClient(OkHttp) {
            install(HttpTimeout) {
                requestTimeoutMillis = 30_000
                connectTimeoutMillis = 10_000
            }
            install(WebSockets)
        }

        try {
            client.webSocket(
                request = {
                    url {
                        protocol = URLProtocol.WS
                        this.host = host
                        this.port = port
                    }
                    header(HttpHeaders.Authorization, "Bearer $apiKey")
                }
            ) {
                _connectionState.value = _connectionState.value.copy(isConnected = true, error = null)
                for (frame in incoming) {
                    if (frame is Frame.Text) {
                        handleMessage(frame.readText())
                    }
                }
            }
        } finally {
            client.close()
            _connectionState.value = _connectionState.value.copy(isConnected = false)
        }
    }

    private suspend fun handleMessage(raw: String) {
        try {
            val obj = json.parseToJsonElement(raw).jsonObject
            val type = obj["type"]?.jsonPrimitive?.contentOrNull ?: return
            when (type) {
                "init" -> parseInit(obj)
                "statusChange" -> parseStatusChange(obj)
                "pendingChanged" -> parsePendingChanged(obj)
                "claudeHook" -> parseClaudeHook(obj)
                "usageInit", "usageUpdate", "thresholdsChanged", "floatingBallState" -> {
                    // 手机端独立轮询用量，忽略这些推送
                }
                else -> {
                    // 未知类型忽略
                }
            }
        } catch (_: Exception) {
            // 单条消息解析失败不应断开连接
        }
    }

    private suspend fun parseInit(obj: JsonObject) {
        val data = obj["data"]?.jsonObject ?: return
        val assistants = mutableMapOf<String, AssistantStatus>()
        val pending = mutableMapOf<String, PendingHook>()
        for ((key, value) in data) {
            if (key == "pending") {
                val map = json.decodeFromJsonElement<Map<String, PendingHook>>(
                    MapSerializer(String.serializer(), PendingHook.serializer()),
                    value
                )
                pending.putAll(map)
            } else {
                assistants[key] = json.decodeFromJsonElement(AssistantStatus.serializer(), value)
            }
        }
        _messages.emit(SyncEvent.Init(assistants, pending))
        _connectionState.value = _connectionState.value.copy(
            lastSyncAt = System.currentTimeMillis()
        )
    }

    private suspend fun parseStatusChange(obj: JsonObject) {
        val assistantId = obj["assistantId"]?.jsonPrimitive?.contentOrNull ?: return
        val data = obj["data"] ?: return
        val status = json.decodeFromJsonElement(AssistantStatus.serializer(), data)
        _messages.emit(SyncEvent.StatusChange(assistantId, status))
        _connectionState.value = _connectionState.value.copy(
            lastSyncAt = System.currentTimeMillis()
        )
    }

    private suspend fun parsePendingChanged(obj: JsonObject) {
        val byCwd = obj["byCwd"] ?: return
        val map = json.decodeFromJsonElement<Map<String, PendingHook>>(
            MapSerializer(String.serializer(), PendingHook.serializer()),
            byCwd
        )
        _messages.emit(SyncEvent.PendingChanged(map))
    }

    private suspend fun parseClaudeHook(obj: JsonObject) {
        val payload = json.decodeFromJsonElement(ClaudeHookPayload.serializer(), obj)
        _messages.emit(
            SyncEvent.ClaudeHook(
                PendingHook(
                    event = payload.event,
                    cwd = payload.cwd,
                    ts = payload.ts,
                    message = payload.message,
                    toolName = payload.toolName
                )
            )
        )
    }
}
