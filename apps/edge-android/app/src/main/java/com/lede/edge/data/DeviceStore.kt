package com.lede.edge.data

import android.content.Context

class DeviceStore(context: Context) {
    private val prefs = context.getSharedPreferences("lede_edge", Context.MODE_PRIVATE)

    var deviceToken: String?
        get() = prefs.getString("device_token", null)
        set(value) = prefs.edit().putString("device_token", value).apply()

    var deviceId: String?
        get() = prefs.getString("device_id", null)
        set(value) = prefs.edit().putString("device_id", value).apply()

    var deviceName: String?
        get() = prefs.getString("device_name", null)
        set(value) = prefs.edit().putString("device_name", value).apply()

    /** "landscape" | "portrait" */
    var orientation: String
        get() = prefs.getString("orientation", "landscape") ?: "landscape"
        set(value) = prefs.edit().putString("orientation", value).apply()

    fun clear() {
        prefs.edit().clear().apply()
    }
}
