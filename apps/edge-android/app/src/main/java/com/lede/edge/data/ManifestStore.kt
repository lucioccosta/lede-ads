package com.lede.edge.data

import android.content.Context
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.io.File

class ManifestStore(context: Context) {
    private val file = File(context.filesDir, "manifest.json")
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val adapter = moshi.adapter(SyncManifest::class.java)

    fun save(manifest: SyncManifest) {
        file.writeText(adapter.toJson(manifest))
    }

    fun load(): SyncManifest? {
        if (!file.exists() || file.length() == 0L) return null
        return runCatching { adapter.fromJson(file.readText()) }.getOrNull()
    }
}
