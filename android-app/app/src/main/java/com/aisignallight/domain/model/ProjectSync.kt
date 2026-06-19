package com.aisignallight.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ClaudeProject(
    val id: String,
    val name: String,
    val source: String = "cwd",
    val cwd: String? = null,
    @SerialName("lastResponse")
    @Serializable(with = EpochMsSerializer::class)
    val lastResponseMs: Long? = null
)

@Serializable
data class DetectorDetails(
    val projects: List<ClaudeProject> = emptyList()
)

@Serializable
data class AssistantStatus(
    val details: DetectorDetails = DetectorDetails(),
    @SerialName("lastUpdate")
    @Serializable(with = EpochMsSerializer::class)
    val lastUpdateMs: Long? = null,
    val pid: Int? = null
)

@Serializable
data class PendingHook(
    val event: String,
    val ts: Long,
    val message: String? = null,
    val toolName: String? = null,
    val cwd: String? = null
)

@Serializable
data class InitPayload(
    val pending: Map<String, PendingHook> = emptyMap(),
    val assistants: Map<String, AssistantStatus> = emptyMap()
)

data class ProjectSyncState(
    val projects: List<ProjectWithAssistant> = emptyList(),
    val pending: Map<String, PendingHook> = emptyMap(),
    val isConnected: Boolean = false,
    val lastSyncAt: Long? = null,
    val error: String? = null
)

data class ProjectWithAssistant(
    val assistantId: String,
    val project: ClaudeProject
)
