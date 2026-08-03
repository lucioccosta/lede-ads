package com.lede.edge.ui

import android.app.Activity
import android.content.pm.ActivityInfo

object OrientationHelper {
    fun apply(activity: Activity, orientation: String?) {
        activity.requestedOrientation = when (orientation) {
            "portrait" -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
            else -> ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
    }
}
