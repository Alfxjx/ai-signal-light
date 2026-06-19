package com.aisignallight.di

import android.content.Context
import androidx.work.Configuration
import androidx.work.WorkManager
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.UsageRepository
import com.aisignallight.data.local.SecureConfigStore
import com.aisignallight.data.repository.UsageRepositoryImpl
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
