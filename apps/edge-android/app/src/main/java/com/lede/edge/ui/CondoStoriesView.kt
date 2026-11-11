package com.lede.edge.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import androidx.core.view.setPadding
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.load
import com.lede.edge.R
import com.lede.edge.data.SyncMedia
import kotlin.math.max

/**
 * Zona condo estilo Instagram Stories: ciclo de mídias com barrinhas de progresso.
 * Mantém o índice ao reanexar se a playlist (fingerprint) não mudou.
 */
class CondoStoriesView(context: Context) : FrameLayout(context) {
    private val handler = Handler(Looper.getMainLooper())
    private val progressRow = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(10), dp(8), dp(10), 0)
    }
    private val content = FrameLayout(context)
    private var exo: ExoPlayer? = null
    private var imageView: ImageView? = null

    private var playlist: List<SyncMedia> = emptyList()
    private var fingerprint: String = ""
    private var index = 0
    private var segmentViews: List<View> = emptyList()
    private var fillAnim: ValueAnimator? = null
    private var advanceRunnable: Runnable? = null

    init {
        addView(
            content,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
        addView(
            progressRow,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply {
                gravity = Gravity.TOP
            },
        )
        setBackgroundColor(Color.BLACK)
    }

    fun currentMedia(): SyncMedia? = playlist.getOrNull(index)

    fun bind(items: List<SyncMedia>, nextFingerprint: String) {
        if (items.isEmpty()) {
            stop()
            playlist = emptyList()
            fingerprint = ""
            content.removeAllViews()
            progressRow.removeAllViews()
            return
        }
        if (fingerprint == nextFingerprint && playlist.isNotEmpty()) {
            // Reanexado com a mesma playlist — continua de onde parou
            ensurePlaying()
            return
        }
        fingerprint = nextFingerprint
        playlist = items
        index = 0
        rebuildBars()
        showCurrent(animate = false)
    }

    fun stop() {
        advanceRunnable?.let { handler.removeCallbacks(it) }
        advanceRunnable = null
        fillAnim?.cancel()
        fillAnim = null
        releasePlayer()
    }

    override fun onDetachedFromWindow() {
        // Não para o timer se só reparentamos; release só em stop()/clear
        super.onDetachedFromWindow()
    }

    private fun ensurePlaying() {
        if (advanceRunnable == null && playlist.isNotEmpty()) {
            showCurrent(animate = false)
        }
    }

    private fun rebuildBars() {
        progressRow.removeAllViews()
        val gap = dp(4)
        segmentViews = playlist.mapIndexed { i, _ ->
            val track = View(context).apply {
                background = GradientDrawable().apply {
                    cornerRadius = dp(2).toFloat()
                    setColor(0x66FFFFFF)
                }
            }
            val fill = View(context).apply {
                background = GradientDrawable().apply {
                    cornerRadius = dp(2).toFloat()
                    setColor(Color.WHITE)
                }
                layoutParams = FrameLayout.LayoutParams(0, LayoutParams.MATCH_PARENT)
            }
            val wrap = FrameLayout(context).apply {
                addView(track, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
                addView(fill)
                layoutParams = LinearLayout.LayoutParams(0, dp(3), 1f).apply {
                    if (i > 0) marginStart = gap
                }
            }
            progressRow.addView(wrap)
            fill
        }
    }

    private fun showCurrent(animate: Boolean) {
        advanceRunnable?.let { handler.removeCallbacks(it) }
        fillAnim?.cancel()

        val media = playlist.getOrNull(index) ?: return
        renderMedia(media)
        paintBarsBefore(index)

        val duration = max(1_000L, media.durationMs.toLong())
        val fill = segmentViews.getOrNull(index)
        if (fill != null) {
            val parent = fill.parent as View
            parent.post {
                val w = parent.width
                fill.layoutParams = FrameLayout.LayoutParams(0, LayoutParams.MATCH_PARENT)
                fill.requestLayout()
                fillAnim = ValueAnimator.ofInt(0, w).apply {
                    this.duration = duration
                    interpolator = LinearInterpolator()
                    addUpdateListener { anim ->
                        val lp = fill.layoutParams as FrameLayout.LayoutParams
                        lp.width = anim.animatedValue as Int
                        fill.layoutParams = lp
                    }
                    start()
                }
            }
        }

        val next = Runnable {
            index = (index + 1) % playlist.size
            showCurrent(animate = true)
        }
        advanceRunnable = next
        handler.postDelayed(next, duration)
    }

    private fun paintBarsBefore(current: Int) {
        segmentViews.forEachIndexed { i, fill ->
            val parent = fill.parent as? View ?: return@forEachIndexed
            val full = parent.width.takeIf { it > 0 } ?: return@forEachIndexed
            val lp = fill.layoutParams as FrameLayout.LayoutParams
            lp.width = when {
                i < current -> full
                else -> 0
            }
            fill.layoutParams = lp
        }
    }

    private fun renderMedia(media: SyncMedia) {
        releasePlayer()
        content.removeAllViews()
        if (media.type == "video") {
            val playerView = LayoutInflater.from(context)
                .inflate(R.layout.zone_video, null, false) as PlayerView
            playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            exo = ExoPlayer.Builder(context).build().also { p ->
                p.repeatMode = Player.REPEAT_MODE_ONE
                p.videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
                p.setMediaItem(MediaItem.fromUri(media.url))
                p.prepare()
                p.playWhenReady = true
            }
            playerView.player = exo
            content.addView(
                playerView,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )
        } else {
            val iv = ImageView(context).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                setBackgroundColor(Color.BLACK)
                load(media.url) { crossfade(true) }
            }
            imageView = iv
            content.addView(
                iv,
                LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
            )
        }
    }

    private fun releasePlayer() {
        exo?.release()
        exo = null
        imageView = null
    }

    private fun dp(v: Int): Int =
        (v * resources.displayMetrics.density).toInt()
}
