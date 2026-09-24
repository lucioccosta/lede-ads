package com.lede.edge.data

import android.app.ActivityManager
import android.content.Context
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
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
)

object DeviceTelemetryCollector {
    suspend fun collect(context: Context): DeviceTelemetry = withContext(Dispatchers.IO) {
        val disk = readDisk()
        val ram = readRam(context)
        val cpu = sampleCpuUsage()
        DeviceTelemetry(
            freeStorageBytes = disk.first,
            totalStorageBytes = disk.second,
            ramAvailBytes = ram.first,
            ramTotalBytes = ram.second,
            cpuUsagePercent = cpu,
            uptimeMs = SystemClock.elapsedRealtime(),
            ipAddress = readPrimaryIpv4(),
        )
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
            // Prefere LAN privada típica
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
     * Amostra /proc/stat com intervalo curto para estimar % de CPU do sistema.
     * Retorna null se o arquivo não estiver acessível.
     */
    private suspend fun sampleCpuUsage(): Float? {
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
                // cpu  user nice system idle iowait irq softirq steal ...
                val parts = line.trim().split(Regex("\\s+"))
                if (parts.isEmpty() || !parts[0].startsWith("cpu") || parts.size < 5) {
                    return null
                }
                val values = parts.drop(1).mapNotNull { it.toLongOrNull() }
                if (values.size < 4) return null
                val idle = values[3] + values.getOrElse(4) { 0L } // idle + iowait
                val total = values.sum()
                idle to total
            }
        } catch (_: Exception) {
            null
        }
    }
}
