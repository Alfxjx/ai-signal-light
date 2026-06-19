package com.aisignallight.domain.repository

data class ConnectionState(
    val isConnected: Boolean = false,
    val lastSyncAt: Long? = null,
    val error: String? = null
)
