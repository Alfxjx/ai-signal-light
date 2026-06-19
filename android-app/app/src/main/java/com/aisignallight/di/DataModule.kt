package com.aisignallight.di

import android.content.Context
import androidx.room.Room
import androidx.work.Configuration
import androidx.work.WorkManager
import com.aisignallight.data.local.AppDatabase
import com.aisignallight.data.local.PendingDao
import com.aisignallight.data.local.ProjectDao
import com.aisignallight.data.local.SecureConfigStore
import com.aisignallight.data.remote.DesktopSyncClient
import com.aisignallight.data.repository.ProjectSyncRepositoryImpl
import com.aisignallight.data.repository.UsageRepositoryImpl
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.ProjectSyncRepository
import com.aisignallight.domain.repository.UsageRepository
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {

    @Binds
    @Singleton
    abstract fun bindConfigRepository(impl: SecureConfigStore): ConfigRepository

    @Binds
    @Singleton
    abstract fun bindUsageRepository(impl: UsageRepositoryImpl): UsageRepository

    @Binds
    @Singleton
    abstract fun bindProjectSyncRepository(impl: ProjectSyncRepositoryImpl): ProjectSyncRepository

    companion object {
        @Provides
        @Singleton
        fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
            return Room.databaseBuilder(
                context,
                AppDatabase::class.java,
                "ai_signal_light.db"
            ).build()
        }

        @Provides
        fun provideProjectDao(database: AppDatabase): ProjectDao = database.projectDao()

        @Provides
        fun providePendingDao(database: AppDatabase): PendingDao = database.pendingDao()
    }
}

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideWorkManager(@ApplicationContext context: Context): WorkManager {
        return WorkManager.getInstance(context)
    }
}
