package com.aisignallight.data.repository

import com.aisignallight.data.local.PendingDao
import com.aisignallight.data.local.PendingEntity
import com.aisignallight.data.local.ProjectDao
import com.aisignallight.data.local.ProjectEntity
import com.aisignallight.data.remote.DesktopSyncClient
import com.aisignallight.domain.model.AssistantStatus
import com.aisignallight.domain.model.ClaudeProject
import com.aisignallight.domain.model.PendingHook
import com.aisignallight.domain.model.ProjectWithAssistant
import com.aisignallight.domain.model.SyncEvent
import com.aisignallight.domain.repository.ConnectionState
import com.aisignallight.domain.repository.ProjectSyncRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProjectSyncRepositoryImpl @Inject constructor(
    private val desktopSyncClient: DesktopSyncClient,
    private val projectDao: ProjectDao,
    private val pendingDao: PendingDao
) : ProjectSyncRepository {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _assistantStates = MutableStateFlow<Map<String, AssistantStatus>>(emptyMap())
    private val _pending = MutableStateFlow<Map<String, PendingHook>>(emptyMap())

    init {
        desktopSyncClient.messages
            .onEach { event -> handleEvent(event) }
            .launchIn(scope)
    }

    override fun observeProjects(): Flow<List<ProjectWithAssistant>> =
        projectDao.observeAll().map { list ->
            list.map { entity ->
                ProjectWithAssistant(
                    assistantId = entity.assistantId,
                    project = ClaudeProject(
                        id = entity.projectId,
                        name = entity.name,
                        source = entity.source,
                        cwd = entity.cwd,
                        lastResponseMs = entity.lastResponseMs
                    )
                )
            }
        }

    override fun observePending(): Flow<Map<String, PendingHook>> =
        pendingDao.observeAll().map { list ->
            list.associateBy(
                { it.cwd },
                { PendingHook(it.event, it.ts, it.message, it.toolName, it.cwd) }
            )
        }

    override fun observeConnection(): Flow<ConnectionState> = desktopSyncClient.connectionState

    override fun connect() {
        desktopSyncClient.connect()
    }

    override fun disconnect() {
        desktopSyncClient.disconnect()
    }

    private fun handleEvent(event: SyncEvent) {
        when (event) {
            is SyncEvent.Init -> {
                _assistantStates.value = event.assistants
                _pending.value = event.pending
                persistAll()
            }
            is SyncEvent.StatusChange -> {
                _assistantStates.value = _assistantStates.value.toMutableMap().apply {
                    put(event.assistantId, event.status)
                }
                persistProjects()
            }
            is SyncEvent.PendingChanged -> {
                _pending.value = event.byCwd
                persistPending()
            }
            is SyncEvent.ClaudeHook -> {
                val hook = event.hook
                if (hook.cwd != null) {
                    _pending.value = _pending.value.toMutableMap().apply {
                        put(hook.cwd, hook)
                    }
                    persistPending()
                }
            }
        }
    }

    private fun persistAll() {
        scope.launch {
            persistProjectsSync()
            persistPendingSync()
        }
    }

    private fun persistProjects() {
        scope.launch { persistProjectsSync() }
    }

    private fun persistPending() {
        scope.launch { persistPendingSync() }
    }

    private suspend fun persistProjectsSync() {
        val now = System.currentTimeMillis()
        val entities = _assistantStates.value.flatMap { (assistantId, status) ->
            status.details.projects.map { project ->
                ProjectEntity(
                    projectKey = "$assistantId:${project.id}",
                    assistantId = assistantId,
                    projectId = project.id,
                    name = project.name,
                    source = project.source,
                    cwd = project.cwd,
                    lastResponseMs = project.lastResponseMs,
                    lastUpdateMs = status.lastUpdateMs,
                    syncedAt = now
                )
            }
        }
        projectDao.clear()
        projectDao.insertAll(entities)
    }

    private suspend fun persistPendingSync() {
        val entities = _pending.value.map { (cwd, hook) ->
            PendingEntity(
                cwd = cwd,
                event = hook.event,
                ts = hook.ts,
                message = hook.message,
                toolName = hook.toolName
            )
        }
        pendingDao.clear()
        pendingDao.insertAll(entities)
    }
}
