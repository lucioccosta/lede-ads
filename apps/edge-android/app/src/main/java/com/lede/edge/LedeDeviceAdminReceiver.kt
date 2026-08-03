package com.lede.edge

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class LedeDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin enabled")
        KioskPolicy.applyIfOwner(context)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        Log.i(TAG, "Device admin disabled")
    }

    companion object {
        private const val TAG = "LedeDeviceAdmin"
    }
}
