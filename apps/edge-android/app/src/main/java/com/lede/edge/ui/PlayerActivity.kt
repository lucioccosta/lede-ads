package com.lede.edge.ui

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.lede.edge.KioskPolicy
import com.lede.edge.data.DeviceStore
import com.lede.edge.data.EdgeApi
import com.lede.edge.data.ManifestStore
import com.lede.edge.data.MediaCache
import com.lede.edge.data.PopEvent
import com.lede.edge.data.ProofOfPlayQueue
import com.lede.edge.data.RemoteCommand
import com.lede.edge.data.SyncScene
import com.lede.edge.databinding.ActivityPlayerBinding
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.util.TimeZone

class PlayerActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPlayerBinding
    private lateinit var store: DeviceStore
    private lateinit var composer: ZoneComposer
    private lateinit var manifestStore: ManifestStore
    private lateinit var mediaCache: MediaCache
    private lateinit var popQueue: ProofOfPlayQueue
    private val api = EdgeApi()
    private val handler = Handler(Looper.getMainLooper())
    private var scenes: List<SyncScene> = emptyList()
    private var index = 0
    private var advanceToken = 0
    private var capturingScreenshot = false
    private var offlineMode = false

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            val token = store.deviceToken ?: return
            lifecycleScope.launch {
                runCatching {
                    val result = api.heartbeat(
                        token,
                        filesDir.usableSpace,
                        TimeZone.getDefault().id,
                    )
                    popQueue.flush(api, token)
                    result.commands.forEach { handleCommand(token, it) }
                }
            }
            handler.postDelayed(this, 30_000)
        }
    }

    private val syncRunnable = object : Runnable {
        override fun run() {
            syncNow()
            handler.postDelayed(this, 60_000)
        }
    }

    private val screenshotRunnable = object : Runnable {
        override fun run() {
            captureAndUploadScreenshot()
            handler.postDelayed(this, 120_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        store = DeviceStore(this)
        OrientationHelper.apply(this, store.orientation)
        composer = ZoneComposer(this)
        manifestStore = ManifestStore(this)
        mediaCache = MediaCache(this)
        popQueue = ProofOfPlayQueue(this)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    // Kiosk: ignora back
                }
            },
        )

        KioskPolicy.applyIfOwner(this)
        enterKioskMode()
        syncNow()
        handler.post(heartbeatRunnable)
        handler.postDelayed(syncRunnable, 60_000)
        handler.postDelayed(screenshotRunnable, 15_000)
    }

    override fun onResume() {
        super.onResume()
        KioskPolicy.applyIfOwner(this)
        enterKioskMode()
        runCatching { startLockTask() }
    }

    private suspend fun handleCommand(token: String, command: RemoteCommand) {
        when (command.type) {
            "resync" -> {
                try {
                    syncNow()
                    api.ackCommand(token, command.id, "done")
                } catch (e: Exception) {
                    runCatching {
                        api.ackCommand(token, command.id, "failed", e.message)
                    }
                }
            }
            "screenshot" -> {
                try {
                    val ok = captureAndUploadScreenshotSuspend()
                    if (ok) api.ackCommand(token, command.id, "done")
                    else api.ackCommand(token, command.id, "failed", "Captura falhou")
                } catch (e: Exception) {
                    runCatching {
                        api.ackCommand(token, command.id, "failed", e.message)
                    }
                }
            }
            "reboot" -> {
                if (KioskPolicy.tryReboot(this)) {
                    runCatching { api.ackCommand(token, command.id, "done") }
                } else {
                    runCatching {
                        api.ackCommand(
                            token,
                            command.id,
                            "failed",
                            "Reboot requer Device Owner",
                        )
                    }
                }
            }
            else -> {
                runCatching {
                    api.ackCommand(token, command.id, "failed", "Tipo desconhecido")
                }
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterKioskMode()
    }

    private fun enterKioskMode() {
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
    }

    private fun syncNow() {
        val token = store.deviceToken ?: return
        lifecycleScope.launch {
            val remote = runCatching { api.sync(token) }
            if (remote.isSuccess) {
                val manifest = remote.getOrThrow()
                if (!manifest.orientation.isNullOrBlank()) {
                    store.orientation = manifest.orientation
                    OrientationHelper.apply(this@PlayerActivity, manifest.orientation)
                }
                withContext(Dispatchers.IO) { manifestStore.save(manifest) }
                val local = mediaCache.materialize(manifest)
                offlineMode = false
                scenes = local.scenes
                runCatching { popQueue.flush(api, token) }
                if (scenes.isNotEmpty() && index >= scenes.size) index = 0
                if (scenes.isNotEmpty()) playCurrent()
                else showIdle("Sem cenas agendadas")
            } else {
                val cached = withContext(Dispatchers.IO) { manifestStore.load() }
                if (cached != null) {
                    if (!cached.orientation.isNullOrBlank()) {
                        store.orientation = cached.orientation
                        OrientationHelper.apply(this@PlayerActivity, cached.orientation)
                    }
                    val local = mediaCache.materialize(cached)
                    offlineMode = true
                    scenes = local.scenes
                    if (scenes.isNotEmpty() && index >= scenes.size) index = 0
                    if (scenes.isNotEmpty()) {
                        playCurrent()
                    } else {
                        showIdle("Offline — sem mídia em cache")
                    }
                } else if (scenes.isEmpty()) {
                    showIdle(remote.exceptionOrNull()?.message ?: "Offline / sync falhou")
                }
            }
        }
    }

    private fun playCurrent() {
        if (scenes.isEmpty()) return
        val scene = scenes[index % scenes.size]
        val startedAt = Instant.now().toString()
        val token = ++advanceToken

        hideIdle()
        // Kiosk: não exibe nome da cena / labels de debug sobre o conteúdo
        binding.statusText.visibility = View.GONE
        binding.statusText.text = ""

        val container = binding.zoneContainer
        val render = Runnable {
            if (isDestroyed) return@Runnable
            composer.compose(container, scene)
        }

        if (container.width == 0 || container.height == 0) {
            container.post(render)
        } else {
            render.run()
        }

        val mediaEntries = scene.zones.mapNotNull { z ->
            val m = z.media ?: return@mapNotNull null
            m.id to m.checksum
        }

        handler.postDelayed({
            if (token != advanceToken) return@postDelayed
            advance(scene, mediaEntries, startedAt)
        }, scene.durationMs.toLong().coerceAtLeast(1_000))
    }

    private fun advance(
        scene: SyncScene,
        mediaEntries: List<Pair<String, String>>,
        startedAt: String,
    ) {
        val token = store.deviceToken
        if (token != null && mediaEntries.isNotEmpty()) {
            val endedAt = Instant.now().toString()
            lifecycleScope.launch {
                val failed = mutableListOf<PopEvent>()
                mediaEntries.forEach { (mediaId, checksum) ->
                    val event = PopEvent(
                        sceneId = scene.id,
                        mediaId = mediaId,
                        startedAt = startedAt,
                        endedAt = endedAt,
                        checksum = checksum,
                    )
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
                    if (!ok) failed.add(event)
                }
                if (failed.isNotEmpty()) {
                    popQueue.enqueueAll(failed)
                }
            }
        }
        index = (index + 1) % maxOf(scenes.size, 1)
        playCurrent()
    }

    private fun showIdle(message: String) {
        advanceToken++
        composer.clear(binding.zoneContainer)
        binding.zoneContainer.setBackgroundColor(Color.BLACK)
        binding.idleOverlay.visibility = View.VISIBLE
        // Mantém mensagem técnica só para diagnóstico (offline / sync), oculta no idle comercial
        binding.statusText.visibility = View.GONE
        binding.statusText.text = message
    }

    private fun hideIdle() {
        binding.idleOverlay.visibility = View.GONE
    }

    private fun captureAndUploadScreenshot(force: Boolean = false) {
        if (!force && offlineMode) return
        lifecycleScope.launch {
            captureAndUploadScreenshotSuspend()
        }
    }

    private suspend fun captureAndUploadScreenshotSuspend(): Boolean {
        val token = store.deviceToken ?: return false
        if (capturingScreenshot) return false
        val root = window.decorView
        if (root.width <= 0 || root.height <= 0) return false

        capturingScreenshot = true
        val bitmap = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        val done = CompletableDeferred<Boolean>()

        try {
            PixelCopy.request(window, bitmap, { result ->
                if (result != PixelCopy.SUCCESS) {
                    bitmap.recycle()
                    capturingScreenshot = false
                    done.complete(false)
                    return@request
                }
                lifecycleScope.launch {
                    try {
                        val file = withContext(Dispatchers.IO) {
                            val out = File(cacheDir, "screenshot.jpg")
                            FileOutputStream(out).use { fos ->
                                bitmap.compress(Bitmap.CompressFormat.JPEG, 70, fos)
                            }
                            out
                        }
                        val ok = runCatching { api.uploadScreenshot(token, file) }.isSuccess
                        done.complete(ok)
                    } catch (_: Exception) {
                        done.complete(false)
                    } finally {
                        bitmap.recycle()
                        capturingScreenshot = false
                    }
                }
            }, handler)
        } catch (_: Exception) {
            bitmap.recycle()
            capturingScreenshot = false
            done.complete(false)
        }

        return done.await()
    }

    override fun onDestroy() {
        advanceToken++
        handler.removeCallbacksAndMessages(null)
        runCatching { stopLockTask() }
        composer.clear(binding.zoneContainer)
        super.onDestroy()
    }
}
