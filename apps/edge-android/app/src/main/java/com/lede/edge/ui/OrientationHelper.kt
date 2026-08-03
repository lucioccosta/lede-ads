package com.lede.edge.ui

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.View
import android.view.ViewGroup

/**
 * Smart boxes / TV (ex.: Aquario) costumam ignorar [Activity.setRequestedOrientation]
 * em retrato. A rotação efetiva é aplicada no conteúdo (View), mantendo a Activity
 * em landscape nativo do painel HDMI.
 */
object OrientationHelper {
    fun degrees(orientation: String?): Int =
        when (orientation) {
            "portrait" -> 90
            "landscape_reverse" -> 180
            "portrait_reverse" -> 270
            else -> 0
        }

    fun apply(activity: Activity, content: View, orientation: String?) {
        // Surface nativo em landscape (comum em TV boxes).
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE

        val deg = degrees(orientation)
        val transform = Runnable {
            val parent = content.parent as? View ?: return@Runnable
            val displayW = parent.width
            val displayH = parent.height
            if (displayW <= 0 || displayH <= 0) return@Runnable

            val contentW: Int
            val contentH: Int
            when (deg) {
                90, 270 -> {
                    contentW = displayH
                    contentH = displayW
                }
                else -> {
                    contentW = displayW
                    contentH = displayH
                }
            }

            val lp = content.layoutParams
            lp.width = contentW
            lp.height = contentH
            content.layoutParams = lp

            content.pivotX = contentW / 2f
            content.pivotY = contentH / 2f
            content.rotation = deg.toFloat()
            content.translationX = (displayW - contentW) / 2f
            content.translationY = (displayH - contentH) / 2f
        }

        val parent = content.parent as? View
        if (parent != null && parent.width > 0 && parent.height > 0) {
            transform.run()
        } else {
            content.post(transform)
        }
    }

    /** Usa o content view já anexado (após setContentView). */
    fun apply(activity: Activity, orientation: String?) {
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        val content =
            activity.findViewById<ViewGroup>(android.R.id.content)?.getChildAt(0)
                ?: return
        apply(activity, content, orientation)
    }
}
