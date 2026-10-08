package com.aisignallight.domain.repository

import com.aisignallight.domain.model.AppConfig
import kotlinx.coroutines.flow.Flow

interface ConfigRepository {
    suspend fun getConfig(): AppConfig
    suspend fun saveConfig(config: AppConfig)
    suspend fun clearConfig()
    fun observeConfig(): Flow<AppConfig>
}
