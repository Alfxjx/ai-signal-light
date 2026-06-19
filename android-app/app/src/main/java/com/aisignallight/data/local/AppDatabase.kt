package com.aisignallight.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [ProjectEntity::class, PendingEntity::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
    abstract fun pendingDao(): PendingDao
}
