package com.aisignallight.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey
    val projectKey: String,
    val assistantId: String,
    val projectId: String,
    val name: String,
    val source: String,
    val cwd: String?,
    val lastResponseMs: Long?,
    val lastUpdateMs: Long?,
    val syncedAt: Long
)

@Entity(tableName = "pending")
data class PendingEntity(
    @PrimaryKey
    val cwd: String,
    val event: String,
    val ts: Long,
    val message: String?,
    val toolName: String?
)
