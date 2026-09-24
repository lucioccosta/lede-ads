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

    /**
     * Aplica timezone IANA (ex.: America/Manaus) no sistema.
     * Com Device Owner usa [DevicePolicyManager.setTimeZone] (API 28+).
     * Sem owner tenta AlarmManager (falha na maioria dos STBs sem permissão de sistema).
     */
    fun trySetTimeZone(context: Context, timeZoneId: String): Boolean {
        val tz = timeZoneId.trim()
        if (tz.isEmpty()) return false
        val current = java.util.TimeZone.getDefault().id
        if (current == tz) return true

        if (isDeviceOwner(context) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val dpm = context.getSystemService(DevicePolicyManager::class.java) ?: return false
            return try {
                dpm.setTimeZone(adminComponent(context), tz)
                true
            } catch (_: Exception) {
                false
            }
        }

        return try {
            val am = context.getSystemService(android.app.AlarmManager::class.java) ?: return false
            am.setTimeZone(tz)
            true
        } catch (_: Exception) {
            false
        }
    }
}
