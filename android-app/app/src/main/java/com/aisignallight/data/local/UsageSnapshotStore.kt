package com.aisignallight.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.aisignallight.domain.model.UsageSnapshot
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

private val Context.usageSnapshotDataStore: DataStore<Preferences> by
    preferencesDataStore(name = "usage_snapshot")

/**
 * 最近一次用量快照的磁盘缓存：冷启动时先渲染上次数据，
 * 桌面小组件（独立进程/无 Hilt 注入）也靠它拿数据。
 */
@Singleton
class UsageSnapshotStore @Inject constructor(
    @ApplicationContext private val context: Context
) {

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    val snapshotFlow: Flow<UsageSnapshot?> = context.usageSnapshotDataStore.data
        .catch { e ->
            if (e is IOException) emit(emptyPreferences()) else throw e
        }
        .map { prefs ->
            prefs[KEY_SNAPSHOT]?.let { raw ->
                runCatching { json.decodeFromString(UsageSnapshot.serializer(), raw) }.getOrNull()
            }
        }

    suspend fun save(snapshot: UsageSnapshot) {
        val raw = runCatching { json.encodeToString(UsageSnapshot.serializer(), snapshot) }
            .getOrNull() ?: return
        runCatching { context.usageSnapshotDataStore.edit { it[KEY_SNAPSHOT] = raw } }
    }

    private companion object {
        val KEY_SNAPSHOT = stringPreferencesKey("snapshot")
    }
}
