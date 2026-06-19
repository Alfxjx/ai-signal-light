package com.aisignallight.ui.scan

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aisignallight.domain.model.QrPayload
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.worker.UsagePollingWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

@HiltViewModel
class ScanViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configRepository: ConfigRepository
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true }

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
                val payload = json.decodeFromString(QrPayload.serializer(), rawValue)
                configRepository.saveQrPayload(payload)
                UsagePollingWorker.enqueue(
                    context,
                    payload.config.intervalMinutes
                )
                handled = true
                _uiState.value = _uiState.value.copy(isProcessing = false, saved = true)
                _events.emit(ScanEvent.NavigateBack)
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isProcessing = false,
                    error = "二维码内容无效：${e.message}"
                )
            }
        }
    }

    fun dismissError() {
        _uiState.value = _uiState.value.copy(error = null)
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
