package com.lede.edge.ui

import android.content.Context
import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
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
import com.lede.edge.data.SyncMedia
import com.lede.edge.data.SyncScene
import com.lede.edge.data.SyncZone
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Compõe uma cena multi-zona no container, escalando x/y/w/h do layout
 * lógico para a área de anúncio (acima da tarja de índices).
 *
 * Zona condo com [SyncZone.items] usa [CondoStoriesView] persistente entre
 * advances de cenas de ads (mesmo fingerprint = continua o índice).
 */
class ZoneComposer(private val context: Context) {
    private val players = mutableListOf<ExoPlayer>()
    private val storiesByZoneKey = mutableMapOf<String, CondoStoriesView>()

    fun clear(container: FrameLayout) {
        players.forEach { it.release() }
        players.clear()
        storiesByZoneKey.values.forEach { it.stop() }
        storiesByZoneKey.clear()
        container.removeAllViews()
    }

    /** Mídias atualmente visíveis (inclui story ativo da zona condo). */
    fun visibleMediaEntries(scene: SyncScene): List<Pair<String, String>> {
        val out = mutableListOf<Pair<String, String>>()
        scene.zones.forEach { zone ->
            val stories = storiesByZoneKey[zone.key]
            val playlist = zone.storyPlaylist()
            if (stories != null && playlist.size > 1) {
                val cur = stories.currentMedia()
                if (cur != null) {
                    out.add(cur.id to cur.checksum)
                    return@forEach
                }
            }
            val m = zone.media ?: playlist.firstOrNull()
            if (m != null) out.add(m.id to m.checksum)
        }
        return out
    }

    fun compose(container: FrameLayout, scene: SyncScene) {
        players.forEach { it.release() }
        players.clear()

        // Remove views não-stories; stories são reparentadas
        val keepStories = HashSet<CondoStoriesView>()
        val toRemove = mutableListOf<View>()
        for (i in 0 until container.childCount) {
            val child = container.getChildAt(i)
            if (child is CondoStoriesView) {
                keepStories.add(child)
            } else {
                toRemove.add(child)
            }
        }
        toRemove.forEach { container.removeView(it) }

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

        val usedKeys = mutableSetOf<String>()

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

            val lp = FrameLayout.LayoutParams(width, height).apply {
                leftMargin = left
                topMargin = top
            }

            val playlist = zone.storyPlaylist()
            val fp = zone.playlistFingerprint()
            val useStories = !zone.items.isNullOrEmpty() && playlist.isNotEmpty()
            if (useStories) {
                usedKeys.add(zone.key)
                val stories = storiesByZoneKey.getOrPut(zone.key) {
                    CondoStoriesView(context)
                }
                if (stories.parent !== container) {
                    (stories.parent as? ViewGroup)?.removeView(stories)
                    container.addView(stories, lp)
                } else {
                    stories.layoutParams = lp
                }
                stories.bind(playlist, fp)
                keepStories.remove(stories)
            } else {
                val view = createSingleMediaView(zone.media ?: playlist.firstOrNull())
                container.addView(view, lp)
            }
        }

        // Stories de zonas que sumiram do manifesto
        storiesByZoneKey.keys
            .filter { it !in usedKeys }
            .toList()
            .forEach { key ->
                storiesByZoneKey.remove(key)?.let { v ->
                    v.stop()
                    container.removeView(v)
                }
            }
    }

    private fun createSingleMediaView(media: SyncMedia?): View {
        if (media == null) {
            return View(context).apply { setBackgroundColor(Color.BLACK) }
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
                load(media.url) { crossfade(true) }
            }
        }
    }

    companion object {
        const val TICKER_BAR_DP = 36
        const val TICKER_REF_HEIGHT = 1080

        fun tickerReservePx(layoutH: Int): Int {
            return max(
                1,
                ((layoutH * TICKER_BAR_DP) / TICKER_REF_HEIGHT.toFloat()).roundToInt(),
            )
        }
    }
}
