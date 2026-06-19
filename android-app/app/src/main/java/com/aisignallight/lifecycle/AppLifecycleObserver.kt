package com.aisignallight.lifecycle

import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.aisignallight.domain.repository.ProjectSyncRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AppLifecycleObserver @Inject constructor(
    private val projectSyncRepository: ProjectSyncRepository
) : DefaultLifecycleObserver {

    fun start() {
        ProcessLifecycleOwner.get().lifecycle.addObserver(this)
    }

    override fun onStart(owner: LifecycleOwner) {
        projectSyncRepository.connect()
    }

    override fun onStop(owner: LifecycleOwner) {
        projectSyncRepository.disconnect()
    }
}
