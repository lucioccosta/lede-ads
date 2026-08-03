package com.lede.edge.ui

import android.content.Context
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import coil.load
import com.lede.edge.data.SyncScene
import com.lede.edge.data.SyncZone
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Compõe uma cena multi-zona no container, escalando x/y/w/h do layout
 * lógico para o tamanho da tela.
 */
class ZoneComposer(private val context: Context) {
    private val players = mutableListOf<ExoPlayer>()

    fun clear(container: FrameLayout) {
        players.forEach { it.release() }
        players.clear()
        container.removeAllViews()
    }

    fun compose(container: FrameLayout, scene: SyncScene) {
        clear(container)

        val screenW = max(1, container.width)
        val screenH = max(1, container.height)
        val layoutW = max(1, scene.layout?.width ?: screenW)
        val layoutH = max(1, scene.layout?.height ?: screenH)
        val scaleX = screenW.toFloat() / layoutW
        val scaleY = screenH.toFloat() / layoutH

        if (scene.zones.isEmpty()) {
            container.setBackgroundColor(Color.BLACK)
            return
        }

        scene.zones.forEach { zone ->
            val left = ((zone.x ?: 0) * scaleX).roundToInt().coerceIn(0, screenW)
            val top = ((zone.y ?: 0) * scaleY).roundToInt().coerceIn(0, screenH)
            val width = max(
                1,
                ((zone.width ?: layoutW) * scaleX).roundToInt().coerceAtMost(screenW - left),
            )
            val height = max(
                1,
                ((zone.height ?: layoutH) * scaleY).roundToInt().coerceAtMost(screenH - top),
            )

            val view = createZoneView(zone)
            val lp = FrameLayout.LayoutParams(width, height).apply {
                leftMargin = left
                topMargin = top
            }
            container.addView(view, lp)
        }
    }

    private fun createZoneView(zone: SyncZone): View {
        val media = zone.media
        if (media == null) {
            return View(context).apply {
                setBackgroundColor(Color.BLACK)
            }
        }

        return if (media.type == "video") {
            val playerView = PlayerView(context).apply {
                useController = false
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }
            val exo = ExoPlayer.Builder(context).build().also { p ->
                p.repeatMode = Player.REPEAT_MODE_ONE
                p.setMediaItem(MediaItem.fromUri(media.url))
                p.prepare()
                p.playWhenReady = true
                players.add(p)
            }
            playerView.player = exo
            playerView
        } else {
            ImageView(context).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                setBackgroundColor(Color.BLACK)
                load(media.url) {
                    crossfade(true)
                }
            }
        }
    }
}
