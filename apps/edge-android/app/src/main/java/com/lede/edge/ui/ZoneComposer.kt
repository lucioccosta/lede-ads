package com.lede.edge.ui

import android.content.Context
import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.load
import com.lede.edge.R
import com.lede.edge.data.SyncScene
import com.lede.edge.data.SyncZone
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Compõe uma cena multi-zona no container, escalando x/y/w/h do layout
 * lógico para a área de anúncio (acima da tarja de índices).
 *
 * A faixa inferior do layout lógico (proporcional a [TICKER_BAR_DP] sobre
 * [TICKER_REF_HEIGHT]) é reservada — zonas que invadem essa faixa são
 * recortadas. O [container] já não inclui o slot físico da tarja (36dp).
 *
 * Vídeo usa [PlayerView] com TextureView (`zone_video.xml`) para respeitar a
 * rotação do [OrientationHelper] em boxes portrait — SurfaceView ignora
 * `View.rotation` do pai e aparece na orientação contrária.
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

        // Aguarda layout se ainda não medido (evita scale errado / “fullscreen”)
        if (container.width <= 0 || container.height <= 0) {
            container.post { compose(container, scene) }
            return
        }

        val screenW = max(1, container.width)
        val screenH = max(1, container.height)
        val layoutW = max(1, scene.layout?.width ?: screenW)
        val layoutH = max(1, scene.layout?.height ?: screenH)
        val contentLayoutH = max(1, layoutH - tickerReservePx(layoutH))
        val scaleX = screenW.toFloat() / layoutW
        val scaleY = screenH.toFloat() / contentLayoutH

        if (scene.zones.isEmpty()) {
            container.setBackgroundColor(Color.BLACK)
            return
        }

        scene.zones.forEach { zone ->
            val zX = (zone.x ?: 0).coerceIn(0, layoutW - 1)
            val zY = (zone.y ?: 0).coerceIn(0, contentLayoutH - 1)
            val zW = max(1, (zone.width ?: layoutW).coerceAtMost(layoutW - zX))
            val zH = max(1, (zone.height ?: contentLayoutH).coerceAtMost(contentLayoutH - zY))

            val left = (zX * scaleX).roundToInt().coerceIn(0, screenW)
            val top = (zY * scaleY).roundToInt().coerceIn(0, screenH)
            val width = max(
                1,
                (zW * scaleX).roundToInt().coerceAtMost(screenW - left),
            )
            val height = max(
                1,
                (zH * scaleY).roundToInt().coerceAtMost(screenH - top),
            )

            val view = createZoneView(zone)
            val lp = FrameLayout.LayoutParams(width, height).apply {
                leftMargin = left
                topMargin = top
            }
            container.addView(view, lp)
        }
    }

    companion object {
        /** Altura física da tarja no player (activity_player.xml). */
        const val TICKER_BAR_DP = 36

        /** Altura de referência dos layouts (ex.: 1920×1080). */
        const val TICKER_REF_HEIGHT = 1080

        fun tickerReservePx(layoutH: Int): Int {
            return max(
                1,
                ((layoutH * TICKER_BAR_DP) / TICKER_REF_HEIGHT.toFloat()).roundToInt(),
            )
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
            val playerView = LayoutInflater.from(context)
                .inflate(R.layout.zone_video, null, false) as PlayerView
            playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            val exo = ExoPlayer.Builder(context).build().also { p ->
                p.repeatMode = Player.REPEAT_MODE_ONE
                p.videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING
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
