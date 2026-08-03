package com.lede.edge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.lede.edge.data.DeviceStore
import com.lede.edge.ui.PairingActivity
import com.lede.edge.ui.PlayerActivity

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val store = DeviceStore(context)
        val target = if (!store.deviceToken.isNullOrBlank()) {
            PlayerActivity::class.java
        } else {
            PairingActivity::class.java
        }
        val launch = Intent(context, target).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(launch)
    }
}
