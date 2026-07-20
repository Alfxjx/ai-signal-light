package com.aisignallight.ui.settings

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.ProviderConfig
import com.aisignallight.domain.model.ProxyConfig
import com.aisignallight.domain.model.ThemeMode
import com.aisignallight.domain.model.UsageThresholds
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.worker.UsagePollingWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configRepository: ConfigRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val config = configRepository.getConfig()
            _uiState.value = SettingsUiState(
                kimi = config.kimi,
                minimax = config.minimax,
                copilot = config.copilot,
                proxyUrl = config.proxy.url,
                intervalMinutes = config.intervalMinutes,
                warnThreshold = config.thresholds.warn,
                dangerThreshold = config.thresholds.danger,
                themeMode = config.themeMode
            )
        }
    }

    fun updateKimi(config: ProviderConfig) {
        _uiState.value = _uiState.value.copy(kimi = config)
    }

    fun updateMinimax(config: ProviderConfig) {
        _uiState.value = _uiState.value.copy(minimax = config)
    }

    fun updateCopilot(config: ProviderConfig) {
        _uiState.value = _uiState.value.copy(copilot = config)
    }

    fun updateProxy(url: String) {
        _uiState.value = _uiState.value.copy(proxyUrl = url)
    }

    fun updateInterval(minutes: Int) {
        _uiState.value = _uiState.value.copy(intervalMinutes = minutes)
    }

    fun updateThresholds(warn: Int, danger: Int) {
        _uiState.value = _uiState.value.copy(warnThreshold = warn, dangerThreshold = danger)
    }

    fun updateTheme(mode: ThemeMode) {
        _uiState.value = _uiState.value.copy(themeMode = mode)
        viewModelScope.launch {
            configRepository.saveThemeMode(mode)
        }
    }

    suspend fun save(): Boolean {
        val state = _uiState.value
        if (state.warnThreshold >= state.dangerThreshold) return false
        if (state.intervalMinutes !in VALID_INTERVALS) return false

        val config = AppConfig(
            kimi = state.kimi,
            minimax = state.minimax,
            copilot = state.copilot,
            proxy = ProxyConfig(url = state.proxyUrl),
            intervalMinutes = state.intervalMinutes,
            thresholds = UsageThresholds(warn = state.warnThreshold, danger = state.dangerThreshold),
            themeMode = state.themeMode
        )
        configRepository.saveConfig(config)
        UsagePollingWorker.enqueue(context, config.intervalMinutes)
        return true
    }

    companion object {
        val VALID_INTERVALS = listOf(5, 10, 15, 30, 60)
    }
}

data class SettingsUiState(
    val kimi: ProviderConfig = ProviderConfig(),
    val minimax: ProviderConfig = ProviderConfig(),
    val copilot: ProviderConfig = ProviderConfig(),
    val proxyUrl: String = "",
    val intervalMinutes: Int = 10,
    val warnThreshold: Int = 50,
    val dangerThreshold: Int = 80,
    val themeMode: ThemeMode = ThemeMode.SYSTEM
)
