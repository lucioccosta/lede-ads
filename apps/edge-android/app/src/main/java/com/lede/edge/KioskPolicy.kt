package com.lede.edge

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build

object KioskPolicy {
    fun adminComponent(context: Context) =
        ComponentName(context, LedeDeviceAdminReceiver::class.java)

    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java) ?: return false
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    fun applyIfOwner(context: Context) {
        if (!isDeviceOwner(context)) return
        val dpm = context.getSystemService(DevicePolicyManager::class.java) ?: return
        val admin = adminComponent(context)
        try {
            dpm.setLockTaskPackages(admin, arrayOf(context.packageName))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                dpm.setLockTaskFeatures(
                    admin,
                    DevicePolicyManager.LOCK_TASK_FEATURE_NONE,
                )
            }
        } catch (e: Exception) {
            // Sem permissão / política — ignore
        }
    }

    fun tryReboot(context: Context): Boolean {
        if (!isDeviceOwner(context)) return false
        val dpm = context.getSystemService(DevicePolicyManager::class.java) ?: return false
        return try {
            dpm.reboot(adminComponent(context))
            true
        } catch (_: Exception) {
            false
        }
    }
}
