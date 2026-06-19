package com.aisignallight.worker

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.aisignallight.data.notification.NotificationHelper
import com.aisignallight.domain.repository.ConfigRepository
import com.aisignallight.domain.repository.UsageRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

@HiltWorker
class UsagePollingWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val configRepository: ConfigRepository,
    private val usageRepository: UsageRepository,
    private val notificationHelper: NotificationHelper
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val snapshot = usageRepository.refresh()
            val config = configRepository.getConfig()
            notificationHelper.checkAndNotify(config, snapshot)
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val WORK_NAME = "usage_polling"

        fun enqueue(context: Context, intervalMinutes: Int) {
            val request = PeriodicWorkRequestBuilder<UsagePollingWorker>(
                intervalMinutes.coerceAtLeast(15).toLong(),
                TimeUnit.MINUTES
            )
                .setInitialDelay(1, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        }
    }
}
