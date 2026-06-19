package com.aisignallight.ui.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.ProjectSyncState
import com.aisignallight.domain.model.UsageSnapshot
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.ProjectSyncRepository
import com.aisignallight.domain.repository.UsageRepository
import com.aisignallight.worker.UsagePollingWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val usageRepository: UsageRepository,
    private val configRepository: ConfigRepository,
    private val projectSyncRepository: ProjectSyncRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            configRepository.observeConfig().collect { config ->
                _uiState.update { it.copy(config = config) }
                schedulePolling(config)
            }
        }
        viewModelScope.launch {
            usageRepository.observeUsage().collect { usage ->
                _uiState.update { it.copy(usage = usage, isLoading = false) }
            }
        }
        viewModelScope.launch {
            combine(
                projectSyncRepository.observeProjects(),
                projectSyncRepository.observePending(),
                projectSyncRepository.observeConnection()
            ) { projects, pending, connection ->
                ProjectSyncState(
                    projects = projects,
                    pending = pending,
                    isConnected = connection.isConnected,
                    lastSyncAt = connection.lastSyncAt,
                    error = connection.error
                )
            }.collect { state ->
                _uiState.update { it.copy(projectSync = state) }
            }
        }
        refresh()
    }

    fun refresh() {
        _uiState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            try {
                usageRepository.refresh()
            } catch (_: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun schedulePolling(config: AppConfig) {
        UsagePollingWorker.enqueue(context, config.intervalMinutes)
    }
}

data class HomeUiState(
    val usage: UsageSnapshot = UsageSnapshot(),
    val config: AppConfig = AppConfig(),
    val projectSync: ProjectSyncState = ProjectSyncState(),
    val isLoading: Boolean = false
)
