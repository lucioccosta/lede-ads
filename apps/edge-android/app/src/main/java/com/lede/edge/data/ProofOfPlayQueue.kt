package com.lede.edge.data

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File

data class PopEvent(
    val sceneId: String,
    val mediaId: String,
    val startedAt: String,
    val endedAt: String,
    val checksum: String,
)

class ProofOfPlayQueue(context: Context) {
    private val file = File(context.filesDir, "pop_queue.json")
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val type = Types.newParameterizedType(List::class.java, PopEvent::class.java)
    private val adapter = moshi.adapter<List<PopEvent>>(type)
    private val mutex = Mutex()

    companion object {
        private const val MAX_EVENTS = 500
    }

    suspend fun enqueue(event: PopEvent) = withContext(Dispatchers.IO) {
        mutex.withLock {
            val next = (loadUnlocked() + event).takeLast(MAX_EVENTS)
            saveUnlocked(next)
        }
    }

    suspend fun enqueueAll(events: List<PopEvent>) = withContext(Dispatchers.IO) {
        if (events.isEmpty()) return@withContext
        mutex.withLock {
            val next = (loadUnlocked() + events).takeLast(MAX_EVENTS)
            saveUnlocked(next)
        }
    }

    suspend fun flush(api: EdgeApi, token: String) = withContext(Dispatchers.IO) {
        val pending = mutex.withLock { loadUnlocked() }
        if (pending.isEmpty()) return@withContext

        val remaining = mutableListOf<PopEvent>()
        var stop = false
        for (event in pending) {
            if (stop) {
                remaining.add(event)
                continue
            }
            val ok = try {
                api.proofOfPlay(
                    token = token,
                    sceneId = event.sceneId,
                    mediaId = event.mediaId,
                    startedAt = event.startedAt,
                    endedAt = event.endedAt,
                    checksum = event.checksum,
                )
                true
            } catch (_: Exception) {
                false
            }
            if (!ok) {
                remaining.add(event)
                stop = true
            }
        }
        mutex.withLock { saveUnlocked(remaining) }
    }

    private fun loadUnlocked(): List<PopEvent> {
        if (!file.exists() || file.length() == 0L) return emptyList()
        return runCatching { adapter.fromJson(file.readText()) }.getOrNull().orEmpty()
    }

    private fun saveUnlocked(events: List<PopEvent>) {
        if (events.isEmpty()) {
            if (file.exists()) file.delete()
            return
        }
        file.writeText(adapter.toJson(events))
    }
}
