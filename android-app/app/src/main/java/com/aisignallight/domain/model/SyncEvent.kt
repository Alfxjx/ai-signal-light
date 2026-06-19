package com.aisignallight.domain.model

sealed class SyncEvent {
    data class Init(
        val assistants: Map<String, AssistantStatus>,
        val pending: Map<String, PendingHook>
    ) : SyncEvent()

    data class StatusChange(
        val assistantId: String,
        val status: AssistantStatus
    ) : SyncEvent()

    data class PendingChanged(
        val byCwd: Map<String, PendingHook>
    ) : SyncEvent()

    data class ClaudeHook(
        val hook: PendingHook
    ) : SyncEvent()
}
