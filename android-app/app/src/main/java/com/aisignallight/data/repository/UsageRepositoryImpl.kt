package com.aisignallight.data.repository

import com.aisignallight.domain.model.AppConfig
import com.aisignallight.domain.model.CopilotUsageData
import com.aisignallight.domain.model.KimiUsageData
import com.aisignallight.domain.model.MinimaxUsageData
import com.aisignallight.domain.model.UsageProviderState
import com.aisignallight.domain.model.UsageSnapshot
import com.aisignallight.domain.model.VolcengineUsageData
import com.aisignallight.domain.model.DeepseekUsageData
import com.aisignallight.domain.model.MimoUsageData
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.UsageRepository
import com.aisignallight.data.local.UsageSnapshotStore
import com.aisignallight.data.remote.CopilotApi
import com.aisignallight.data.remote.KimiApi
import com.aisignallight.data.remote.MinimaxApi
import com.aisignallight.data.remote.VolcengineApi
import com.aisignallight.data.remote.DeepseekApi
import com.aisignallight.data.remote.MimoApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UsageRepositoryImpl @Inject constructor(
    private val configRepository: ConfigRepository,
    private val snapshotStore: UsageSnapshotStore,
    private val kimiApi: KimiApi,
    private val minimaxApi: MinimaxApi,
    private val copilotApi: CopilotApi,
    private val volcengineApi: VolcengineApi,
    private val deepseekApi: DeepseekApi,
    private val mimoApi: MimoApi
) : UsageRepository {

    /** 进程内的最新快照；null 表示本进程还没刷新过 */
    private val _usageFlow = MutableStateFlow<UsageSnapshot?>(null)

    override fun observeUsage(): Flow<UsageSnapshot> = flow {
        // 冷启动先用磁盘缓存渲染，refresh 出新值后由内存流接管
        snapshotStore.snapshotFlow.first()?.let { emit(it) }
        emitAll(_usageFlow.filterNotNull())
    }

    override suspend fun refresh(): UsageSnapshot {
        val snapshot = fetchAll()
        _usageFlow.value = snapshot
        snapshotStore.save(snapshot)
        return snapshot
    }

    override suspend fun fetchAll(): UsageSnapshot = withContext(Dispatchers.IO) {
        val config = configRepository.getConfig()
        val proxyUrl = config.proxy.url.takeIf { it.isNotBlank() }
        val now = Instant.now().toString()

        val kimi = async { fetchKimi(config, proxyUrl, now) }
        val minimax = async { fetchMinimax(config, proxyUrl, now) }
        val copilot = async { fetchCopilot(config, proxyUrl, now) }
        val volcengine = async { fetchVolcengine(config, proxyUrl, now) }
        val deepseek = async { fetchDeepseek(config, proxyUrl, now) }
        val mimo = async { fetchMimo(config, proxyUrl, now) }

        UsageSnapshot(
            kimi = kimi.await(),
            minimax = minimax.await(),
            copilot = copilot.await(),
            volcengine = volcengine.await(),
            deepseek = deepseek.await(),
            mimo = mimo.await()
        )
    }

    private suspend fun fetchKimi(config: AppConfig, proxyUrl: String?, now: String): UsageProviderState<KimiUsageData> {
        val cfg = config.kimi
        if (!cfg.enabled) return UsageProviderState(error = "disabled", lastUpdated = now)
        if (cfg.token.isBlank()) return UsageProviderState(error = "no_token", lastUpdated = now)
        return try {
            val proxy = if (cfg.useProxy) proxyUrl else null
            UsageProviderState(data = kimiApi.fetch(cfg.token, proxy), lastUpdated = now, error = null)
        } catch (e: Exception) {
            UsageProviderState(error = formatError(e), lastUpdated = now)
        }
    }

    private suspend fun fetchMinimax(config: AppConfig, proxyUrl: String?, now: String): UsageProviderState<MinimaxUsageData> {
        val cfg = config.minimax
        if (!cfg.enabled) return UsageProviderState(error = "disabled", lastUpdated = now)
        if (cfg.token.isBlank()) return UsageProviderState(error = "no_token", lastUpdated = now)
        return try {
            val proxy = if (cfg.useProxy) proxyUrl else null
            UsageProviderState(data = minimaxApi.fetch(cfg.token, proxy), lastUpdated = now, error = null)
        } catch (e: Exception) {
            UsageProviderState(error = formatError(e), lastUpdated = now)
        }
    }

    private suspend fun fetchCopilot(config: AppConfig, proxyUrl: String?, now: String): UsageProviderState<CopilotUsageData> {
        val cfg = config.copilot
        if (!cfg.enabled) return UsageProviderState(error = "disabled", lastUpdated = now)
        if (cfg.token.isBlank()) return UsageProviderState(error = "no_token", lastUpdated = now)
        return try {
            val proxy = if (cfg.useProxy) proxyUrl else null
            UsageProviderState(data = copilotApi.fetch(cfg.token, proxy), lastUpdated = now, error = null)
        } catch (e: Exception) {
            UsageProviderState(error = formatError(e), lastUpdated = now)
        }
    }

    private suspend fun fetchVolcengine(
        config: AppConfig, proxyUrl: String?, now: String
    ): UsageProviderState<VolcengineUsageData> {
        val cfg = config.volcengine
        if (!cfg.enabled) return UsageProviderState(error = "disabled", lastUpdated = now)
if (cfg.accessKey.isBlank() || cfg.secretKey.isBlank()) {
            return UsageProviderState(error = "no_token", lastUpdated = now)
        }
        return try {
            val proxy = if (cfg.useProxy) proxyUrl else null
            UsageProviderState(
                data = volcengineApi.fetch(cfg, proxy),
                lastUpdated = now, error = null
            )
        } catch (e: Exception) {
            UsageProviderState(error = formatError(e), lastUpdated = now)
        }
    }

    private suspend fun fetchDeepseek(
        config: AppConfig, proxyUrl: String?, now: String
    ): UsageProviderState<DeepseekUsageData> {
        val cfg = config.deepseek
        if (!cfg.enabled) return UsageProviderState(error = "disabled", lastUpdated = now)
        if (cfg.token.isBlank()) return UsageProviderState(error = "no_token", lastUpdated = now)
        return try {
            val proxy = if (cfg.useProxy) proxyUrl else null
            UsageProviderState(data = deepseekApi.fetch(cfg.token, proxy), lastUpdated = now, error = null)
        } catch (e: Exception) {
            UsageProviderState(error = formatError(e), lastUpdated = now)
        }
    }

    private suspend fun fetchMimo(
        config: AppConfig, proxyUrl: String?, now: String
    ): UsageProviderState<MimoUsageData> {
        val cfg = config.mimo
        if (!cfg.enabled) return UsageProviderState(error = "disabled", lastUpdated = now)
        if (cfg.token.isBlank()) return UsageProviderState(error = "no_token", lastUpdated = now)
        return try {
            val proxy = if (cfg.useProxy) proxyUrl else null
            UsageProviderState(data = mimoApi.fetch(cfg.token, proxy), lastUpdated = now, error = null)
        } catch (e: Exception) {
            UsageProviderState(error = formatError(e), lastUpdated = now)
        }
    }

    private fun formatError(e: Throwable): String {        val msg = e.message ?: e.toString()
        return when {
            msg.contains("timeout", ignoreCase = true) || msg.contains("SocketTimeout") -> "timeout"
            msg.contains("Unable to resolve host") || msg.contains("UnknownHost") -> "DNS 解析失败"
            msg.contains("Connection refused", ignoreCase = true) -> "连接被拒绝"
            msg.startsWith("HTTP") -> msg
            else -> msg
        }
    }
}
