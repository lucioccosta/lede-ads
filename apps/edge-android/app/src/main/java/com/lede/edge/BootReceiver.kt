package com.lede.edge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.lede.edge.ui.RootActivity

/**
 * Abre o player (ou pairing) após o boot.
 * TV boxes Amlogic/Proeletronic costumam enviar QUICKBOOT_POWERON em vez de
 * BOOT_COMPLETED, e às vezes bloqueiam startActivity imediato — por isso o atraso.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        if (action !in BOOT_ACTIONS) return

        val fromUpdate = action == Intent.ACTION_MY_PACKAGE_REPLACED
        val delayMs = if (fromUpdate) PACKAGE_REPLACED_DELAY_MS else BOOT_LAUNCH_DELAY_MS
        Log.i(TAG, "boot action=$action — agendando abertura do LEDE Edge (delay=${delayMs}ms)")
        val appCtx = context.applicationContext
        val pending = goAsync()
        scheduleLaunch(appCtx, pending, delayMs, retriesLeft = if (fromUpdate) 3 else 1)
    }

    private fun scheduleLaunch(
        appCtx: Context,
        pending: PendingResult,
        delayMs: Long,
        retriesLeft: Int,
    ) {
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                val launch = Intent(appCtx, RootActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP,
                    )
                    putExtra(EXTRA_FROM_BOOT, true)
                }
                appCtx.startActivity(launch)
                Log.i(TAG, "RootActivity iniciada")
                pending.finish()
            } catch (e: Exception) {
                Log.e(TAG, "Falha ao abrir (retriesLeft=$retriesLeft): ${e.message}", e)
                if (retriesLeft > 1) {
                    scheduleLaunch(appCtx, pending, PACKAGE_REPLACED_RETRY_MS, retriesLeft - 1)
                } else {
                    pending.finish()
                }
            }
        }, delayMs)
    }

    companion object {
        private const val TAG = "LedeBootReceiver"
        const val EXTRA_FROM_BOOT = "from_boot"
        private const val BOOT_LAUNCH_DELAY_MS = 8_000L
        /** Após OTA o processo já está vivo — abrir rápido e com retries. */
        private const val PACKAGE_REPLACED_DELAY_MS = 1_500L
        private const val PACKAGE_REPLACED_RETRY_MS = 2_500L

        val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON",
            "android.intent.action.REBOOT",
        )
    }
}
