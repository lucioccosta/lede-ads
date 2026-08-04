package com.lede.edge.data

import com.lede.edge.BuildConfig
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File

class EdgeApi {
    private val client = OkHttpClient()
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun pair(code: String, deviceName: String): PairResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("code", code)
            .put("deviceName", deviceName)
            .toString()
            .toRequestBody(json)
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/edge/pair")
            .post(body)
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) error(text.ifBlank { "Falha no pairing (${res.code})" })
            val obj = JSONObject(text)
            PairResult(
                deviceId = obj.getString("deviceId"),
                deviceToken = obj.getString("deviceToken"),
                name = obj.getString("name"),
                orientation = obj.optString("orientation", "landscape"),
            )
        }
    }

    suspend fun sync(token: String): SyncManifest = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/edge/sync")
            .header("x-device-token", token)
            .get()
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                if (res.code == 401) throw DeviceUnauthorizedException()
                error(text.ifBlank { "Falha no sync (${res.code})" })
            }
            moshi.adapter(SyncManifest::class.java).fromJson(text)
                ?: error("Manifest inválido")
        }
    }

    suspend fun heartbeat(
        token: String,
        telemetry: DeviceTelemetry,
        timezone: String? = null,
    ): HeartbeatResult = withContext(Dispatchers.IO) {
        val bodyJson = JSONObject()
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("freeStorageBytes", telemetry.freeStorageBytes)
            .put("totalStorageBytes", telemetry.totalStorageBytes)
            .put("ramAvailBytes", telemetry.ramAvailBytes)
            .put("ramTotalBytes", telemetry.ramTotalBytes)
            .put("uptimeMs", telemetry.uptimeMs)
        telemetry.cpuUsagePercent?.let {
            bodyJson.put("cpuUsagePercent", (it * 10).toInt() / 10.0)
        }
        if (!timezone.isNullOrBlank()) bodyJson.put("timezone", timezone)
        val body = bodyJson.toString().toRequestBody(json)
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/edge/heartbeat")
            .header("x-device-token", token)
            .post(body)
            .build()
        client.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                if (res.code == 401) throw DeviceUnauthorizedException()
                error(text.ifBlank { "Falha no heartbeat (${res.code})" })
            }
            val obj = if (text.isBlank()) JSONObject() else JSONObject(text)
            val commands = mutableListOf<RemoteCommand>()
            val arr = obj.optJSONArray("commands")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    val c = arr.getJSONObject(i)
                    commands.add(
                        RemoteCommand(
                            id = c.getString("id"),
                            type = c.getString("type"),
                        ),
                    )
                }
            }
            HeartbeatResult(commands = commands)
        }
    }

    suspend fun ackCommand(
        token: String,
        commandId: String,
        status: String,
        error: String? = null,
    ) = withContext(Dispatchers.IO) {
        val bodyJson = JSONObject().put("status", status)
        if (error != null) bodyJson.put("error", error)
        val body = bodyJson.toString().toRequestBody(json)
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/edge/commands/$commandId/ack")
            .header("x-device-token", token)
            .post(body)
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                val text = res.body?.string().orEmpty()
                error(text.ifBlank { "Falha no ack do comando (${res.code})" })
            }
        }
    }

    suspend fun proofOfPlay(
        token: String,
        sceneId: String,
        mediaId: String,
        startedAt: String,
        endedAt: String,
        checksum: String,
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("sceneId", sceneId)
            .put("mediaId", mediaId)
            .put("startedAt", startedAt)
            .put("endedAt", endedAt)
            .put("checksum", checksum)
            .toString()
            .toRequestBody(json)
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/edge/proof-of-play")
            .header("x-device-token", token)
            .post(body)
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                val text = res.body?.string().orEmpty()
                error(text.ifBlank { "Falha no proof-of-play (${res.code})" })
            }
        }
    }

    suspend fun uploadScreenshot(token: String, file: File) = withContext(Dispatchers.IO) {
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                "file",
                "screenshot.jpg",
                file.asRequestBody("image/jpeg".toMediaType()),
            )
            .build()
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/edge/screenshot-upload")
            .header("x-device-token", token)
            .post(body)
            .build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                val text = res.body?.string().orEmpty()
                error(text.ifBlank { "Falha no upload do screenshot (${res.code})" })
            }
        }
    }
}

data class PairResult(
    val deviceId: String,
    val deviceToken: String,
    val name: String,
    val orientation: String = "landscape",
)

data class HeartbeatResult(
    val commands: List<RemoteCommand> = emptyList(),
)

data class RemoteCommand(
    val id: String,
    val type: String,
)

data class SyncManifest(
    val version: String,
    val generatedAt: String,
    val deviceId: String,
    val timezone: String? = null,
    val orientation: String? = null,
    val scenes: List<SyncScene>,
)

data class SyncScene(
    val id: String,
    val name: String,
    val durationMs: Int,
    val layoutId: String,
    val layout: SyncLayout? = null,
    val zones: List<SyncZone>,
)

data class SyncLayout(
    val width: Int,
    val height: Int,
)

data class SyncZone(
    val id: String,
    val key: String,
    val label: String? = null,
    val x: Int? = null,
    val y: Int? = null,
    val width: Int? = null,
    val height: Int? = null,
    val media: SyncMedia?,
)

data class SyncMedia(
    val id: String,
    val type: String,
    val url: String,
    val checksum: String,
    val durationMs: Int,
    val mimeType: String,
)
