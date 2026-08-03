package com.lede.edge.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

class MediaCache(
    context: Context,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val dir = File(context.filesDir, "media").also { it.mkdirs() }
    private val semaphore = Semaphore(2)

    suspend fun materialize(manifest: SyncManifest): SyncManifest = withContext(Dispatchers.IO) {
        val assets = linkedMapOf<String, SyncMedia>()
        manifest.scenes.forEach { scene ->
            scene.zones.forEach { zone ->
                val media = zone.media ?: return@forEach
                if (media.checksum.isNotBlank()) {
                    assets[media.checksum] = media
                }
            }
        }

        coroutineScope {
            assets.values.map { media ->
                async {
                    semaphore.withPermit {
                        runCatching { ensureCached(media) }
                    }
                }
            }.awaitAll()
        }

        val localScenes = manifest.scenes.map { scene ->
            scene.copy(
                zones = scene.zones.map { zone ->
                    val media = zone.media ?: return@map zone
                    val local = localUriIfPresent(media.checksum)
                    if (local != null) {
                        zone.copy(media = media.copy(url = local))
                    } else {
                        // Offline: remove mídia não cacheada para não quebrar o composer
                        zone.copy(media = null)
                    }
                },
            )
        }

        cleanup(assets.keys)
        manifest.copy(scenes = localScenes)
    }

    private fun localUriIfPresent(checksum: String): String? {
        val file = File(dir, checksum)
        return if (file.exists() && file.length() > 0L) file.toURI().toString() else null
    }

    private fun ensureCached(media: SyncMedia): String {
        val target = File(dir, media.checksum)
        if (target.exists() && target.length() > 0L) {
            return target.toURI().toString()
        }

        val tmp = File(dir, "${media.checksum}.part")
        if (tmp.exists()) tmp.delete()

        val req = Request.Builder().url(media.url).get().build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) error("Download falhou (${res.code}) ${media.url}")
            val body = res.body ?: error("Body vazio")
            tmp.outputStream().use { out ->
                body.byteStream().use { input -> input.copyTo(out) }
            }
        }

        if (!tmp.renameTo(target)) {
            tmp.copyTo(target, overwrite = true)
            tmp.delete()
        }
        return target.toURI().toString()
    }

    private fun cleanup(keep: Set<String>) {
        dir.listFiles()?.forEach { file ->
            if (!file.isFile) return@forEach
            val name = file.name.removeSuffix(".part")
            if (name !in keep) {
                runCatching { file.delete() }
            }
        }
    }
}
