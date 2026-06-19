package com.aisignallight.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects ORDER BY assistantId, name")
    fun observeAll(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects ORDER BY assistantId, name")
    suspend fun getAll(): List<ProjectEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(projects: List<ProjectEntity>)

    @Query("DELETE FROM projects")
    suspend fun clear()
}

@Dao
interface PendingDao {
    @Query("SELECT * FROM pending")
    fun observeAll(): Flow<List<PendingEntity>>

    @Query("SELECT * FROM pending")
    suspend fun getAll(): List<PendingEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(pending: List<PendingEntity>)

    @Query("DELETE FROM pending")
    suspend fun clear()

    @Query("DELETE FROM pending WHERE cwd = :cwd")
    suspend fun deleteByCwd(cwd: String)
}
