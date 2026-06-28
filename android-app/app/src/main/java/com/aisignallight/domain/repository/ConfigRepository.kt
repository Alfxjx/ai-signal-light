package com.aisignallight.domain.repository

import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.ThemeMode
import kotlinx.coroutines.flow.Flow

interface ConfigRepository {
    suspend fun getConfig(): AppConfig
    suspend fun saveConfig(config: AppConfig)
    suspend fun clearConfig()
    fun observeConfig(): Flow<AppConfig>

    suspend fun saveThemeMode(mode: ThemeMode)

    suspend fun saveDesktopConnection(host: String, port: Int, apiKey: String?)
    suspend fun getDesktopConnection(): DesktopConnection?
    fun observeDesktopConnection(): Flow<DesktopConnection?>
}

data class DesktopConnection(
    val host: String,
    val port: Int,
    val apiKey: String?
)
