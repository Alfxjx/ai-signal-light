package com.aisignallight.domain.model

import kotlinx.serialization.Serializable

@Serializable
data class ClaudeHookPayload(
    val event: String,
    val cwd: String? = null,
    val sessionId: String? = null,
    val ts: Long,
    val message: String? = null,
    val toolName: String? = null
)
