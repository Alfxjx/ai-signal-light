package com.aisignallight.ui.scan

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aisignallight.data.remote.DesktopSyncClient
import com.aisignallight.domain.model.QrPayload
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.worker.UsagePollingWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import javax.inject.Inject

@HiltViewModel
class ScanViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configRepository: ConfigRepository,
    private val desktopSyncClient: DesktopSyncClient
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val _uiState = MutableStateFlow(ScanUiState())
    val uiState: StateFlow<ScanUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<ScanEvent>()
    val events: SharedFlow<ScanEvent> = _events.asSharedFlow()

    private var handled = false

    fun onQrScanned(rawValue: String) {
        if (handled) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isProcessing = true, error = null)
            try {
                // 1. 解析精简 QR payload（仅 host/port/apiKey）
                val payload = json.decodeFromString(QrPayload.serializer(), rawValue)
                if (payload.apiKey.isBlank()) {
                    error("二维码缺少 apiKey，请确认是用最新版桌面端生成")
                    return@launch
                }

                // 2. 先落盘连接信息，让 DesktopSyncClient 能用
                configRepository.saveDesktopConnection(payload.host, payload.port, payload.apiKey)

                // 3. 触发 WS 连接并等待连接成功
                desktopSyncClient.connect()
                val connected = withTimeoutOrNull(CONNECT_TIMEOUT_MS) {
                    desktopSyncClient.connectionState.first { it.isConnected }
                    true
                }
                if (connected != true) {
                    val lastError = desktopSyncClient.connectionState.value.error
                    error(
                        lastError
                            ?: "无法连接到桌面端，请确认手机和桌面在同一网段、桌面端已开启 LAN 模式"
                    )
                    return@launch
                }

                // 4. 反向拉取完整配置
                val config = desktopSyncClient.fetchConfig().getOrElse { e ->
                    error("拉取配置失败：${e.message ?: e.javaClass.simpleName}")
                    return@launch
                }

                // 5. 落盘 + 启动轮询 worker
                configRepository.saveConfig(config)
                UsagePollingWorker.enqueue(context, config.intervalMinutes)

                handled = true
                _uiState.value = _uiState.value.copy(isProcessing = false, saved = true)
                _events.emit(ScanEvent.NavigateBack)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error("二维码内容无效：${e.message ?: e.javaClass.simpleName}")
            }
        }
    }

    private fun error(message: String) {
        _uiState.value = _uiState.value.copy(isProcessing = false, error = message)
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 8_000L
    }
}

data class ScanUiState(
    val isProcessing: Boolean = false,
    val saved: Boolean = false,
    val error: String? = null
)

sealed class ScanEvent {
    data object NavigateBack : ScanEvent()
}