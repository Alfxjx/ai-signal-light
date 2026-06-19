package com.aisignallight.domain.repository

import com.aisignallight.domain.model.UsageSnapshot
import kotlinx.coroutines.flow.Flow

interface UsageRepository {
    suspend fun fetchAll(): UsageSnapshot
    fun observeUsage(): Flow<UsageSnapshot>
    suspend fun refresh(): UsageSnapshot
}
