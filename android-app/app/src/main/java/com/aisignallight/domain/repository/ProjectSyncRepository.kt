package com.aisignallight.domain.repository

import com.aisignallight.domain.model.PendingHook
import com.aisignallight.domain.model.ProjectWithAssistant
import kotlinx.coroutines.flow.Flow

interface ProjectSyncRepository {
    fun observeProjects(): Flow<List<ProjectWithAssistant>>
    fun observePending(): Flow<Map<String, PendingHook>>
    fun observeConnection(): Flow<ConnectionState>
    fun connect()
    fun disconnect()
}
