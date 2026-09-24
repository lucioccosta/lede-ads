package com.lede.edge

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log
import com.lede.edge.ui.RootActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Baixa APK e instala via PackageInstaller.
 *
 * OTA 100% silenciosa (sem diálogos) exige Device Owner:
 *   adb shell dpm set-device-owner com.lede.edge.fios/com.lede.edge.LedeDeviceAdminReceiver
 *
 * Sem Device Owner o Android força confirmação ("fontes desconhecidas" / Instalar).
 */
object ApkUpdateInstaller {
    private const val TAG = "ApkUpdateInstaller"
    const val ACTION_INSTALL_STATUS = "com.lede.edge.UPDATE_INSTALL_STATUS"

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.MINUTES)
        .writeTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    suspend fun downloadAndInstall(context: Context, apkUrl: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            runCatching {
                val apk = download(context, apkUrl)
                installSession(context, apk)
                Unit
            }
        }

    private fun download(context: Context, apkUrl: String): File {
        val dir = File(context.cacheDir, "ota").apply { mkdirs() }
        val out = File(dir, "update.apk")
        if (out.exists()) out.delete()

        val req = Request.Builder().url(apkUrl).get().build()
        http.newCall(req).execute().use { res ->
            if (!res.isSuccessful) {
                error("Download APK falhou HTTP ${res.code}")
            }
            val body = res.body ?: error("Download APK vazio")
            out.outputStream().use { dest ->
                body.byteStream().use { src -> src.copyTo(dest) }
            }
        }
        if (!out.exists() || out.length() < 1024) {
            error("APK inválido após download")
        }
        Log.i(TAG, "APK baixado: ${out.length()} bytes")
        return out
    }

    private fun installSession(context: Context, apk: File) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL,
        )
        params.setAppPackageName(context.packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }

        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("lede-update", 0, apk.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val flags =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
            val intent = Intent(ACTION_INSTALL_STATUS).setPackage(context.packageName)
            val pi = PendingIntent.getBroadcast(context, sessionId, intent, flags)
            session.commit(pi.intentSender)
        }
        Log.i(TAG, "PackageInstaller session commitida ($sessionId)")
    }
}

class ApkInstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, Int.MIN_VALUE)
        val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Sem Device Owner o Android exige confirmação — abre o diálogo do sistema.
                val confirm = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                if (confirm != null) {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(confirm)
                }
            }
            PackageInstaller.STATUS_SUCCESS -> {
                Log.i("ApkInstallReceiver", "Update instalado com sucesso")
                // MY_PACKAGE_REPLACED também dispara BootReceiver; isto cobre o caso
                // em que o processo sobrevive ao replace (self-update).
                runCatching {
                    val launch = Intent(context, RootActivity::class.java).apply {
                        addFlags(
                            Intent.FLAG_ACTIVITY_NEW_TASK or
                                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                                Intent.FLAG_ACTIVITY_SINGLE_TOP,
                        )
                    }
                    context.startActivity(launch)
                }.onFailure {
                    Log.w("ApkInstallReceiver", "Não foi possível reabrir após update: ${it.message}")
                }
            }
            else ->
                Log.w("ApkInstallReceiver", "Install status=$status msg=$msg")
        }
    }
}
