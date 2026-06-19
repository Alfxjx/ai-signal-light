package com.aisignallight.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.QrPayload
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.DesktopConnection
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SecureConfigStore @Inject constructor(
    @ApplicationContext private val context: Context
) : ConfigRepository {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val prefs: EncryptedSharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        ) as EncryptedSharedPreferences
    }

    private val _configFlow = MutableStateFlow(loadConfig())
    override fun observeConfig(): StateFlow<AppConfig> = _configFlow.asStateFlow()

    private val _connectionFlow = MutableStateFlow(loadConnection())
    override fun observeDesktopConnection(): StateFlow<DesktopConnection?> = _connectionFlow.asStateFlow()

    override suspend fun getConfig(): AppConfig = loadConfig()

    override suspend fun saveConfig(config: AppConfig) {
        prefs.edit {
            putString(KEY_CONFIG, json.encodeToString(config))
        }
        _configFlow.value = config
    }

    override suspend fun clearConfig() {
        prefs.edit {
            remove(KEY_CONFIG)
            remove(KEY_DESKTOP_HOST)
            remove(KEY_DESKTOP_PORT)
            remove(KEY_DESKTOP_API_KEY)
        }
        _configFlow.value = AppConfig()
        _connectionFlow.value = null
    }

    override suspend fun saveDesktopConnection(host: String, port: Int, apiKey: String?) {
        prefs.edit {
            putString(KEY_DESKTOP_HOST, host)
            putInt(KEY_DESKTOP_PORT, port)
            putString(KEY_DESKTOP_API_KEY, apiKey)
        }
        _connectionFlow.value = DesktopConnection(host, port, apiKey)
    }

    override suspend fun getDesktopConnection(): DesktopConnection? = loadConnection()

    override suspend fun saveQrPayload(payload: QrPayload) {
        saveConfig(payload.config)
        saveDesktopConnection(payload.host, payload.port, payload.apiKey)
    }

    private fun loadConfig(): AppConfig {
        val raw = prefs.getString(KEY_CONFIG, null) ?: return AppConfig()
        return try {
            json.decodeFromString<AppConfig>(raw)
        } catch (_: Exception) {
            AppConfig()
        }
    }

    private fun loadConnection(): DesktopConnection? {
        val host = prefs.getString(KEY_DESKTOP_HOST, null) ?: return null
        val port = prefs.getInt(KEY_DESKTOP_PORT, 3456)
        val apiKey = prefs.getString(KEY_DESKTOP_API_KEY, null)
        return DesktopConnection(host, port, apiKey)
    }

    companion object {
        private const val PREFS_FILE = "ai_signal_light_secure_config"
        private const val KEY_CONFIG = "config"
        private const val KEY_DESKTOP_HOST = "desktop_host"
        private const val KEY_DESKTOP_PORT = "desktop_port"
        private const val KEY_DESKTOP_API_KEY = "desktop_api_key"
    }
}
