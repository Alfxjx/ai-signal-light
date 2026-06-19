package com.aisignallight.domain.repository

import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.QrPayload
import kotlinx.coroutines.flow.Flow

interface ConfigRepository {
    suspend fun getConfig(): AppConfig
    suspend fun saveConfig(config: AppConfig)
    suspend fun clearConfig()
    fun observeConfig(): Flow<AppConfig>

    suspend fun saveDesktopConnection(host: String, port: Int, apiKey: String?)
    suspend fun getDesktopConnection(): DesktopConnection?
    fun observeDesktopConnection(): Flow<DesktopConnection?>

    suspend fun saveQrPayload(payload: QrPayload)
}

data class DesktopConnection(
    val host: String,
    val port: Int,
    val apiKey: String?
)
