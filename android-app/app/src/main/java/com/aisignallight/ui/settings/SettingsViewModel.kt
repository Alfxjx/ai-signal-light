package com.aisignallight.ui.settings

import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.ProxyConfig
import com.aisignallight.domain.model.ThemeMode
import com.aisignallight.domain.model.UsageThresholds
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.widget.UsageWidget
import com.aisignallight.worker.UsagePollingWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** 设置页"服务商"分组里的条目 */
enum class SettingsProvider {
    KIMI,
    MINIMAX,
    COPILOT,
    DEEPSEEK,
    VOLCENGINE
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configRepository: ConfigRepository
) : ViewModel() {

    private val _config = MutableStateFlow(AppConfig())
    val config: StateFlow<AppConfig> = _config.asStateFlow()

    init {
        viewModelScope.launch {
            configRepository.observeConfig().collect { _config.value = it }
        }
    }

    fun updateTheme(mode: ThemeMode) = update { it.copy(themeMode = mode) }

    fun updateInterval(minutes: Int) {
        if (minutes !in VALID_INTERVALS) return
        update { it.copy(intervalMinutes = minutes) }
        UsagePollingWorker.enqueue(context, minutes)
    }

    fun updateThresholds(warn: Int, danger: Int) {
        if (warn >= danger) return
        if (warn !in THRESHOLD_RANGE || danger !in THRESHOLD_RANGE) return
        update { it.copy(thresholds = UsageThresholds(warn = warn, danger = danger)) }
    }

    fun updateProxy(url: String) = update { it.copy(proxy = ProxyConfig(url = url.trim())) }

    fun updateProviderEnabled(provider: SettingsProvider, enabled: Boolean) {
        update { config ->
            when (provider) {
                SettingsProvider.KIMI -> config.copy(kimi = config.kimi.copy(enabled = enabled))
                SettingsProvider.MINIMAX -> config.copy(minimax = config.minimax.copy(enabled = enabled))
                SettingsProvider.COPILOT -> config.copy(copilot = config.copilot.copy(enabled = enabled))
                SettingsProvider.DEEPSEEK -> config.copy(deepseek = config.deepseek.copy(enabled = enabled))
                SettingsProvider.VOLCENGINE -> config.copy(volcengine = config.volcengine.copy(enabled = enabled))
            }
        }
    }

    /** Token / Cookie 类服务商；火山引擎有两个字段，走 [updateVolcengineConfig] */
    fun updateProviderToken(provider: SettingsProvider, token: String, useProxy: Boolean) {
        update { config ->
            val value = token.trim()
            when (provider) {
                SettingsProvider.KIMI -> config.copy(kimi = config.kimi.copy(token = value, useProxy = useProxy))
                SettingsProvider.MINIMAX -> config.copy(minimax = config.minimax.copy(token = value, useProxy = useProxy))
                SettingsProvider.COPILOT -> config.copy(copilot = config.copilot.copy(token = value, useProxy = useProxy))
                SettingsProvider.DEEPSEEK -> config.copy(deepseek = config.deepseek.copy(token = value, useProxy = useProxy))
                SettingsProvider.VOLCENGINE -> config
            }
        }
    }

    fun updateVolcengineConfig(cookie: String, csrfToken: String, useProxy: Boolean) {
        update { config ->
            config.copy(
                volcengine = config.volcengine.copy(
                    cookie = cookie.trim(),
                    csrfToken = csrfToken.trim(),
                    useProxy = useProxy
                )
            )
        }
    }

    /** 先更新内存状态（连续两次编辑不会互相覆盖），再落盘并刷新小组件 */
    private fun update(transform: (AppConfig) -> AppConfig) {
        val next = transform(_config.value)
        _config.value = next
        viewModelScope.launch {
            configRepository.saveConfig(next)
            runCatching { UsageWidget().updateAll(context) }
        }
    }

    companion object {
        val VALID_INTERVALS = listOf(5, 10, 15, 30, 60)
        val THRESHOLD_RANGE = 0..100
    }
}
