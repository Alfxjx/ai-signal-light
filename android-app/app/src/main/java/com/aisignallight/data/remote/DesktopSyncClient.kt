package com.aisignallight.data.remote

import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.AssistantStatus
import com.aisignallight.domain.model.ClaudeHookPayload
import com.aisignallight.domain.model.PendingHook
import com.aisignallight.domain.model.SyncEvent
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.ConnectionState
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.http.URLProtocol
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
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

    // 出站发送互斥：Ktor 的 WebSocketSession 不允许多个并发 send
    private val sendMutex = Mutex()
    @Volatile
    private var currentSession: DefaultClientWebSocketSession? = null

    // requestId → 等待响应的 CompletableDeferred（值为响应里 config 字段的 JsonElement）
    private val pending = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()

    fun connect() {
        if (scope?.isActive == true) return
        scope = CoroutineScope(Dispatchers.IO + SupervisorJob()).also { start(it) }
    }

    fun disconnect() {
        scope?.cancel()
        scope = null
        currentSession = null
        failAllPending(IllegalStateException("disconnected"))
        _connectionState.value = ConnectionState(isConnected = false)
    }

    /**
     * 通过已建立的 WS 反向拉取桌面端 AppConfig。必须在 `connect()` 之后调用，
     * 且桌面端 LAN 模式已开启。失败/超时不会重试，由调用方决定。
     */
    suspend fun fetchConfig(timeoutMs: Long = 10_000L): Result<AppConfig> {
        val requestId = "getConfig-${UUID.randomUUID()}"
        val deferred = CompletableDeferred<JsonElement>()
        pending[requestId] = deferred
        return try {
            sendFrame(buildJsonObject {
                put("type", "getConfig")
                put("requestId", requestId)
            })
            val configElement = withTimeout(timeoutMs) { deferred.await() }
            val config = json.decodeFromJsonElement(AppConfig.serializer(), configElement)
            Result.success(config)
        } catch (e: TimeoutCancellationException) {
            pending.remove(requestId)
            Result.failure(e)
        } catch (e: kotlinx.coroutines.CancellationException) {
            pending.remove(requestId)
            throw e
        } catch (e: Exception) {
            pending.remove(requestId)
            Result.failure(e)
        }
    }

    private suspend fun sendFrame(obj: JsonObject) {
        val session = currentSession ?: error("WS not connected")
        sendMutex.withLock {
            session.send(Frame.Text(json.encodeToString(JsonObject.serializer(), obj)))
        }
    }

    private fun completePending(requestId: String?, element: JsonElement?) {
        if (requestId == null) return
        val deferred = pending.remove(requestId) ?: return
        if (element != null) deferred.complete(element)
        else deferred.completeExceptionally(IllegalStateException("response missing config"))
    }

    private fun failAllPending(cause: Throwable) {
        val ids = pending.keys.toList()
        ids.forEach { id ->
            pending.remove(id)?.completeExceptionally(cause)
        }
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
                } catch (e: kotlinx.coroutines.CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val error = classifyError(e)
                    _connectionState.value = ConnectionState(
                        isConnected = false,
                        lastSyncAt = _connectionState.value.lastSyncAt,
                        error = error
                    )
                    attempt++
                    val backoff = (1000L * (1 shl attempt.coerceAtMost(5))).coerceAtMost(30000L)
                    delay(backoff)
                }
            }
        }
    }

    private fun classifyError(e: Throwable): String {
        val msg = e.message ?: e.toString()
        return when {
            msg.contains("401", ignoreCase = true) ||
                    msg.contains("Unauthorized", ignoreCase = true) ->
                "鉴权失败，请重新扫码导入配置"
            msg.contains("Unable to resolve host", ignoreCase = true) ||
                    msg.contains("UnknownHost", ignoreCase = true) ->
                "无法解析桌面地址"
            msg.contains("ECONNREFUSED", ignoreCase = true) ||
                    msg.contains("Connection refused", ignoreCase = true) ||
                    msg.contains("Failed to connect", ignoreCase = true) ->
                "连接被拒绝，请确认桌面端已开启 LAN 模式"
            msg.contains("timeout", ignoreCase = true) ||
                    msg.contains("SocketTimeout", ignoreCase = true) ->
                "连接超时"
            else -> "连接异常：$msg"
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
                currentSession = this
                _connectionState.value = _connectionState.value.copy(isConnected = true, error = null)
                try {
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            handleMessage(frame.readText())
                        }
                    }
                } finally {
                    currentSession = null
                    failAllPending(IllegalStateException("WS session ended"))
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
                "configSnapshot" -> {
                    // 响应 getConfig 请求；requestId 必须匹配，config 字段必须存在
                    val requestId = obj["requestId"]?.jsonPrimitive?.contentOrNull
                    completePending(requestId, obj["config"])
                }
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
