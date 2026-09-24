package com.lede.edge.data

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.os.HardwarePropertiesManager
import android.os.StatFs
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.RandomAccessFile

data class DeviceTelemetry(
    val freeStorageBytes: Long,
    val totalStorageBytes: Long,
    val ramAvailBytes: Long,
    val ramTotalBytes: Long,
    val cpuUsagePercent: Float?,
    val uptimeMs: Long,
    val ipAddress: String? = null,
    val screenWidth: Int? = null,
    val screenHeight: Int? = null,
)

object DeviceTelemetryCollector {
    private const val TAG = "DeviceTelemetry"

    suspend fun collect(context: Context): DeviceTelemetry = withContext(Dispatchers.IO) {
        val disk = readDisk()
        val ram = readRam(context)
        val cpu = sampleCpuUsage(context)
        val screen = readScreenSize(context)
        DeviceTelemetry(
            freeStorageBytes = disk.first,
            totalStorageBytes = disk.second,
            ramAvailBytes = ram.first,
            ramTotalBytes = ram.second,
            cpuUsagePercent = cpu,
            uptimeMs = SystemClock.elapsedRealtime(),
            ipAddress = readPrimaryIpv4(),
            screenWidth = screen?.first,
            screenHeight = screen?.second,
        )
    }

    private fun readScreenSize(context: Context): Pair<Int, Int>? {
        return try {
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as? android.view.WindowManager
                ?: return null
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bounds = wm.currentWindowMetrics.bounds
                bounds.width() to bounds.height()
            } else {
                val metrics = android.util.DisplayMetrics()
                @Suppress("DEPRECATION")
                wm.defaultDisplay.getRealMetrics(metrics)
                metrics.widthPixels to metrics.heightPixels
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Primeiro IPv4 não-loopback (Wi‑Fi / Ethernet). */
    private fun readPrimaryIpv4(): String? {
        return try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces() ?: return null
            val candidates = mutableListOf<String>()
            while (interfaces.hasMoreElements()) {
                val nif = interfaces.nextElement()
                if (!nif.isUp || nif.isLoopback) continue
                val addrs = nif.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (addr.isLoopbackAddress || addr !is java.net.Inet4Address) continue
                    val host = addr.hostAddress ?: continue
                    if (host.startsWith("169.254.")) continue // link-local
                    candidates += host
                }
            }
            candidates.firstOrNull { it.startsWith("192.168.") }
                ?: candidates.firstOrNull { it.startsWith("10.") }
                ?: candidates.firstOrNull { it.startsWith("172.") }
                ?: candidates.firstOrNull()
        } catch (_: Exception) {
            null
        }
    }

    private fun readDisk(): Pair<Long, Long> {
        val path = Environment.getDataDirectory().absolutePath
        val stat = StatFs(path)
        val blockSize = stat.blockSizeLong
        val free = stat.availableBlocksLong * blockSize
        val total = stat.blockCountLong * blockSize
        return free to total
    }

    private fun readRam(context: Context): Pair<Long, Long> {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val info = ActivityManager.MemoryInfo()
        am.getMemoryInfo(info)
        return info.availMem to info.totalMem
    }

    /**
     * Estima % de CPU do sistema.
     * Ordem: HardwarePropertiesManager (Device Owner) → /proc/stat → CPU deste processo.
     */
    private suspend fun sampleCpuUsage(context: Context): Float? {
        sampleCpuHardware(context)?.let {
            Log.d(TAG, "CPU via HardwarePropertiesManager: $it%")
            return it
        }
        sampleCpuProcStat()?.let {
            Log.d(TAG, "CPU via /proc/stat: $it%")
            return it
        }
        sampleCpuSelfProc()?.let {
            Log.d(TAG, "CPU via /proc/self (processo): $it%")
            return it
        }
        Log.w(TAG, "CPU indisponível")
        return null
    }

    /** API 24+ — Device Owner / system. Duas amostras para taxa. */
    private suspend fun sampleCpuHardware(context: Context): Float? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return null
        val hpm = context.getSystemService(HardwarePropertiesManager::class.java) ?: return null
        return try {
            val first = readHardwareTotals(hpm) ?: return null
            delay(200)
            val second = readHardwareTotals(hpm) ?: return null
            val activeDelta = (second.first - first.first).toDouble()
            val totalDelta = (second.second - first.second).toDouble()
            if (totalDelta <= 0.0) return 0f
            ((activeDelta / totalDelta) * 100.0).toFloat().coerceIn(0f, 100f)
        } catch (e: SecurityException) {
            Log.d(TAG, "HardwarePropertiesManager sem permissão: ${e.message}")
            null
        } catch (e: Exception) {
            Log.d(TAG, "HardwarePropertiesManager falhou: ${e.message}")
            null
        }
    }

    /** @return Pair(activeNs, totalNs) somado de todos os cores */
    private fun readHardwareTotals(hpm: HardwarePropertiesManager): Pair<Long, Long>? {
        val usages = hpm.cpuUsages ?: return null
        if (usages.isEmpty()) return null
        var active = 0L
        var total = 0L
        for (u in usages) {
            if (u == null) continue
            active += u.active
            total += u.total
        }
        if (total <= 0L) return null
        return active to total
    }

    private suspend fun sampleCpuProcStat(): Float? {
        val first = readProcStat() ?: return null
        delay(150)
        val second = readProcStat() ?: return null
        val idleDelta = (second.first - first.first).toDouble()
        val totalDelta = (second.second - first.second).toDouble()
        if (totalDelta <= 0.0) return 0f
        val usage = ((totalDelta - idleDelta) / totalDelta * 100.0).toFloat()
        return usage.coerceIn(0f, 100f)
    }

    /** @return Pair(idle, total) */
    private fun readProcStat(): Pair<Long, Long>? {
        return try {
            RandomAccessFile("/proc/stat", "r").use { reader ->
                val line = reader.readLine() ?: return null
                val parts = line.trim().split(Regex("\\s+"))
                if (parts.isEmpty() || !parts[0].startsWith("cpu") || parts.size < 5) {
                    return null
                }
                val values = parts.drop(1).mapNotNull { it.toLongOrNull() }
                if (values.size < 4) return null
                val idle = values[3] + values.getOrElse(4) { 0L }
                val total = values.sum()
                idle to total
            }
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Fallback: % de CPU deste processo (jiffies).
     * Melhor que null quando /proc/stat está bloqueado.
     */
    private suspend fun sampleCpuSelfProc(): Float? {
        val first = readSelfCpuJiffies() ?: return null
        val t0 = SystemClock.elapsedRealtime()
        delay(200)
        val second = readSelfCpuJiffies() ?: return null
        val t1 = SystemClock.elapsedRealtime()
        val dtMs = (t1 - t0).toDouble()
        if (dtMs <= 0.0) return null
        val cores = Runtime.getRuntime().availableProcessors().coerceAtLeast(1)
        val hz = 100.0
        val cpuDelta = (second - first).toDouble()
        val usage = (cpuDelta / hz) / (dtMs / 1000.0) / cores * 100.0
        return usage.toFloat().coerceIn(0f, 100f)
    }

    private fun readSelfCpuJiffies(): Long? {
        return try {
            RandomAccessFile("/proc/self/stat", "r").use { reader ->
                val line = reader.readLine() ?: return null
                val close = line.lastIndexOf(')')
                if (close < 0 || close + 2 >= line.length) return null
                val rest = line.substring(close + 2).trim().split(Regex("\\s+"))
                if (rest.size < 14) return null
                val utime = rest[11].toLongOrNull() ?: return null
                val stime = rest[12].toLongOrNull() ?: return null
                utime + stime
            }
        } catch (_: Exception) {
            null
        }
    }
}
