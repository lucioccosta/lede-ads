package com.lede.edge.ui

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.PixelCopy
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import com.lede.edge.ApkUpdateInstaller
import com.lede.edge.BuildConfig
import com.lede.edge.KioskPolicy
import com.lede.edge.R
import com.lede.edge.data.DeviceStore
import com.lede.edge.data.DeviceTelemetryCollector
import com.lede.edge.data.DeviceUnauthorizedException
import com.lede.edge.data.EdgeApi
import com.lede.edge.data.ManifestStore
import com.lede.edge.data.MediaCache
import com.lede.edge.data.PopEvent
import com.lede.edge.data.ProofOfPlayQueue
import com.lede.edge.data.RemoteCommand
import com.lede.edge.data.SyncScene
import com.lede.edge.data.TickerItem
import com.lede.edge.databinding.ActivityPlayerBinding
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.time.Instant
import java.util.Date
import java.util.Locale
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

    /** Escape do kiosk: Voltar ×7 em 3s, ou Volume+ segurado + Voltar ×3. */
    private var escapeBackCount = 0
    private var escapeWindowStart = 0L
    private var volumeUpHeld = false
    private var escapingKiosk = false
    private val tickerArrowAnims = mutableListOf<ObjectAnimator>()
    private val clockFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
    private var tickerAllItems: List<TickerItem> = emptyList()
    private var tickerPages: List<List<TickerItem>> = emptyList()
    private var tickerPageIndex = 0

    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            val token = store.deviceToken ?: return
            lifecycleScope.launch {
                runCatching {
                    val telemetry = DeviceTelemetryCollector.collect(this@PlayerActivity)
                    val result = api.heartbeat(
                        token,
                        telemetry,
                        TimeZone.getDefault().id,
                    )
                    popQueue.flush(api, token)
                    result.commands.forEach { handleCommand(token, it) }
                }.onFailure { err ->
                    if (err is DeviceUnauthorizedException) {
                        goToPairing()
                    }
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

    private val tickerRunnable = object : Runnable {
        override fun run() {
            refreshTicker()
            // Poll frequente: ligar/desligar no Cloud reflete sem atualizar o APK
            handler.postDelayed(this, 60_000L)
        }
    }

    private val clockRunnable = object : Runnable {
        override fun run() {
            if (binding.tickerBar.visibility == View.VISIBLE) {
                binding.tickerClock.text = clockFormat.format(Date())
            }
            handler.postDelayed(this, 1_000L)
        }
    }

    private val tickerPageRunnable = object : Runnable {
        override fun run() {
            if (binding.tickerBar.visibility == View.VISIBLE && tickerPages.size > 1) {
                tickerPageIndex = (tickerPageIndex + 1) % tickerPages.size
                showTickerPage(tickerPages[tickerPageIndex])
            }
            handler.postDelayed(this, TICKER_PAGE_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        binding = ActivityPlayerBinding.inflate(layoutInflater)
        setContentView(binding.root)

        store = DeviceStore(this)
        OrientationHelper.apply(this, binding.root, store.orientation)
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
        applyDeviceCode(store.shortCode)
        syncNow()
        handler.post(heartbeatRunnable)
        handler.postDelayed(syncRunnable, 60_000)
        handler.postDelayed(screenshotRunnable, 15_000)
        handler.post(tickerRunnable)
        handler.post(clockRunnable)
        handler.postDelayed(tickerPageRunnable, TICKER_PAGE_MS)
    }

    override fun onResume() {
        super.onResume()
        if (escapingKiosk) return
        KioskPolicy.applyIfOwner(this)
        enterKioskMode()
        runCatching { startLockTask() }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> {
                volumeUpHeld = event.action != KeyEvent.ACTION_UP
            }
            KeyEvent.KEYCODE_BACK -> {
                if (event.action == KeyEvent.ACTION_UP && registerEscapeBack()) {
                    escapeKiosk()
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    /**
     * Combinações de emergência para sair do kiosk:
     * 1) Segure Volume+ e aperte Voltar 3 vezes (em até 3s)
     * 2) Aperte Voltar 7 vezes seguidas (em até 3s)
     */
    private fun registerEscapeBack(): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (now - escapeWindowStart > ESCAPE_WINDOW_MS) {
            escapeBackCount = 0
            escapeWindowStart = now
        }
        escapeBackCount += 1
        val needed = if (volumeUpHeld) ESCAPE_BACK_WITH_VOLUME else ESCAPE_BACK_ONLY
        return escapeBackCount >= needed
    }

    private fun escapeKiosk() {
        if (escapingKiosk) return
        escapingKiosk = true
        escapeBackCount = 0
        volumeUpHeld = false

        handler.removeCallbacks(heartbeatRunnable)
        handler.removeCallbacks(syncRunnable)
        handler.removeCallbacks(screenshotRunnable)
        handler.removeCallbacks(tickerRunnable)
        handler.removeCallbacks(clockRunnable)
        handler.removeCallbacks(tickerPageRunnable)
        clearTickerArrowAnims()

        runCatching { stopLockTask() }

        Toast.makeText(
            this,
            "Abrindo launcher ${BuildConfig.OEM_LAUNCHER_LABEL}…",
            Toast.LENGTH_SHORT,
        ).show()

        val launched = runCatching { startOemLauncher() }.isSuccess
        if (!launched) {
            runCatching {
                startActivity(
                    Intent(Settings.ACTION_HOME_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }

        // Remove a task do LEDE para não voltar sozinho ao Home padrão
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            finishAndRemoveTask()
        } else {
            finishAffinity()
        }
    }

    /** Abre o launcher OEM do device (Aquario / Nova no SB3000). */
    private fun startOemLauncher() {
        val pkg = BuildConfig.OEM_LAUNCHER_PACKAGE
        val activity = BuildConfig.OEM_LAUNCHER_ACTIVITY
        if (activity.isNotBlank()) {
            val explicit = Intent(Intent.ACTION_MAIN).apply {
                component = ComponentName(pkg, activity)
                addCategory(Intent.CATEGORY_LAUNCHER)
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED,
                )
            }
            try {
                startActivity(explicit)
                return
            } catch (_: Exception) {
                // fallback abaixo
            }
        }

        val launch = packageManager.getLaunchIntentForPackage(pkg)
            ?: error("Launcher não encontrado ($pkg)")
        launch.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED,
        )
        startActivity(launch)
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
            "update" -> {
                val url = command.payload?.apkUrl?.trim().orEmpty()
                if (url.isBlank()) {
                    runCatching {
                        api.ackCommand(token, command.id, "failed", "URL do APK ausente")
                    }
                    return
                }
                Toast.makeText(
                    this,
                    "Atualizando Edge ${command.payload?.versionName ?: ""}…",
                    Toast.LENGTH_LONG,
                ).show()
                val result = ApkUpdateInstaller.downloadAndInstall(this, url)
                if (result.isSuccess) {
                    runCatching { api.ackCommand(token, command.id, "done") }
                } else {
                    runCatching {
                        api.ackCommand(
                            token,
                            command.id,
                            "failed",
                            result.exceptionOrNull()?.message ?: "Falha no update",
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
        if (hasFocus && !escapingKiosk) enterKioskMode()
    }

    private fun enterKioskMode() {
        if (escapingKiosk) return
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
                if (!manifest.shortCode.isNullOrBlank()) {
                    store.shortCode = manifest.shortCode
                    applyDeviceCode(manifest.shortCode)
                }
                if (!manifest.deviceName.isNullOrBlank()) {
                    store.deviceName = manifest.deviceName
                }
                if (!manifest.orientation.isNullOrBlank()) {
                    store.orientation = manifest.orientation
                    OrientationHelper.apply(
                        this@PlayerActivity,
                        binding.root,
                        manifest.orientation,
                    )
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
                val err = remote.exceptionOrNull()
                if (err is DeviceUnauthorizedException) {
                    goToPairing()
                    return@launch
                }
                val cached = withContext(Dispatchers.IO) { manifestStore.load() }
                if (cached != null) {
                    if (!cached.orientation.isNullOrBlank()) {
                        store.orientation = cached.orientation
                        OrientationHelper.apply(
                            this@PlayerActivity,
                            binding.root,
                            cached.orientation,
                        )
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

    private fun refreshTicker() {
        val token = store.deviceToken ?: return
        lifecycleScope.launch {
            runCatching { api.ticker(token) }
                .onSuccess { payload ->
                    if (!payload.shortCode.isNullOrBlank()) {
                        store.shortCode = payload.shortCode
                        applyDeviceCode(payload.shortCode)
                    }
                    if (!payload.deviceName.isNullOrBlank()) {
                        store.deviceName = payload.deviceName
                    }
                    if (payload.items.isEmpty() && payload.text.isBlank()) {
                        tickerAllItems = emptyList()
                        tickerPages = emptyList()
                        binding.tickerBar.visibility = View.GONE
                        applyDeviceCode(store.shortCode)
                        return@onSuccess
                    }
                    tickerAllItems = payload.items
                    binding.tickerClock.text = clockFormat.format(Date())
                    binding.tickerBar.visibility = View.VISIBLE
                    applyDeviceCode(store.shortCode)
                    binding.tickerItems.post {
                        rebuildTickerPagesAndShow()
                    }
                }
                .onFailure { err ->
                    if (err is DeviceUnauthorizedException) {
                        goToPairing()
                    }
                }
        }
    }

    /** Mostra o código curto na tarja (se visível) ou badge no canto. */
    private fun applyDeviceCode(code: String?) {
        val trimmed = code?.trim().orEmpty()
        if (trimmed.isEmpty()) {
            binding.tickerDeviceCode.text = ""
            binding.deviceCodeBadge.visibility = View.GONE
            return
        }
        binding.tickerDeviceCode.text = trimmed
        if (binding.tickerBar.visibility == View.VISIBLE) {
            binding.deviceCodeBadge.visibility = View.GONE
        } else {
            binding.deviceCodeBadge.text = trimmed
            binding.deviceCodeBadge.visibility = View.VISIBLE
        }
    }

    private fun rebuildTickerPagesAndShow() {
        val maxWidth = binding.tickerItems.width
        tickerPages = paginateTickerItems(tickerAllItems, maxWidth)
        tickerPageIndex = 0
        if (tickerPages.isNotEmpty()) {
            showTickerPage(tickerPages[0])
        }
    }

    private fun paginateTickerItems(
        items: List<TickerItem>,
        maxWidth: Int,
    ): List<List<TickerItem>> {
        if (items.isEmpty()) return emptyList()
        if (maxWidth <= 0) return listOf(items)

        val pages = mutableListOf<MutableList<TickerItem>>()
        var current = mutableListOf<TickerItem>()
        var used = 0
        val heightSpec = View.MeasureSpec.makeMeasureSpec(
            maxOf(binding.tickerItems.height, 1),
            View.MeasureSpec.EXACTLY,
        )
        val widthSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)

        for (item in items) {
            val probe = LayoutInflater.from(this)
                .inflate(R.layout.item_ticker, binding.tickerItems, false)
            bindTickerItemView(probe, item, animate = false)
            probe.measure(widthSpec, heightSpec)
            val w = probe.measuredWidth
            if (current.isNotEmpty() && used + w > maxWidth) {
                pages += current
                current = mutableListOf()
                used = 0
            }
            current += item
            used += w
        }
        if (current.isNotEmpty()) pages += current
        return pages
    }

    private fun showTickerPage(page: List<TickerItem>) {
        clearTickerArrowAnims()
        val row = binding.tickerItems
        row.removeAllViews()
        val inflater = LayoutInflater.from(this)
        for (item in page) {
            val view = inflater.inflate(R.layout.item_ticker, row, false)
            bindTickerItemView(view, item, animate = true)
            row.addView(view)
        }
    }

    private fun bindTickerItemView(view: View, item: TickerItem, animate: Boolean) {
        val iconText = view.findViewById<TextView>(R.id.tickerItemIconText)
        val label = view.findViewById<TextView>(R.id.tickerItemLabel)
        val arrow = view.findViewById<ImageView>(R.id.tickerItemArrow)
        val change = view.findViewById<TextView>(R.id.tickerItemChange)
        val value = view.findViewById<TextView>(R.id.tickerItemValue)

        val glyph = item.icon.trim().ifEmpty { "•" }
        iconText.text = glyph
        label.text = item.label.uppercase(Locale.getDefault())
        value.text = item.value

        val pct = item.changePct
        if (pct != null) {
            val up = pct >= 0
            arrow.setImageResource(if (up) R.drawable.ic_ticker_up else R.drawable.ic_ticker_down)
            arrow.visibility = View.VISIBLE
            change.setTextColor(if (up) 0xFF16A34A.toInt() else 0xFFDC2626.toInt())
            change.text = String.format(
                Locale.getDefault(),
                "%s%.2f%%",
                if (up) "+" else "",
                pct,
            )
            change.visibility = View.VISIBLE
            if (animate) startArrowAnim(arrow, up)
        } else {
            arrow.visibility = View.GONE
            change.visibility = View.GONE
        }
    }

    private fun startArrowAnim(arrow: ImageView, up: Boolean) {
        val delta = if (up) -3f else 3f
        val anim = ObjectAnimator.ofFloat(arrow, View.TRANSLATION_Y, 0f, delta, 0f).apply {
            duration = 1100L
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
        tickerArrowAnims += anim
    }

    private fun clearTickerArrowAnims() {
        tickerArrowAnims.forEach { it.cancel() }
        tickerArrowAnims.clear()
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

    private fun goToPairing() {
        if (isFinishing || isDestroyed) return
        store.clear()
        handler.removeCallbacksAndMessages(null)
        runCatching { stopLockTask() }
        startActivity(
            Intent(this, PairingActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            },
        )
        finish()
    }

    override fun onDestroy() {
        advanceToken++
        clearTickerArrowAnims()
        handler.removeCallbacksAndMessages(null)
        runCatching { stopLockTask() }
        composer.clear(binding.zoneContainer)
        super.onDestroy()
    }

    companion object {
        private const val ESCAPE_WINDOW_MS = 3_000L
        private const val ESCAPE_BACK_ONLY = 7
        private const val ESCAPE_BACK_WITH_VOLUME = 3
        private const val TICKER_PAGE_MS = 10_000L
    }
}
