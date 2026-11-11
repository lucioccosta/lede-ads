package com.lede.edge.data

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Identidade do box para o auto-registro no Cloud.
 *
 * - [hardwareId]: estável por aparelho (ANDROID_ID — não muda com reinstalação
 *   do app; só com reset de fábrica). Prefixo `aid-` para não colidir com o
 *   Edge Linux (`sid-…`).
 * - [secret]: aleatório, gerado uma vez, em SharedPreferences PRÓPRIO — sobrevive
 *   ao [DeviceStore.clear] do re-pareamento.
 * - [registrationCode]: mesmo algoritmo de `registrationCode()` da API, para a
 *   TV mostrar o código mesmo sem rede.
 */
object DeviceIdentity {
    private const val PREFS = "lede_edge_registration"
    private const val KEY_SECRET = "secret"
    private const val CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

    @SuppressLint("HardwareIds")
    fun hardwareId(context: Context): String {
        val androidId = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID,
        )?.trim().orEmpty()
        if (androidId.length >= 8 && androidId != "9774d56d682e549c") {
            return "aid-$androidId"
        }
        // Fallback raro (ANDROID_ID ausente/bugado): hash estável do build
        val fingerprint = "${Build.MANUFACTURER}|${Build.MODEL}|${Build.FINGERPRINT}|${secret(context)}"
        return "aid-" + sha256Hex(fingerprint).take(24)
    }

    fun secret(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val existing = prefs.getString(KEY_SECRET, null)
        if (!existing.isNullOrBlank() && existing.length >= 32) return existing
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val created = bytes.joinToString("") { "%02x".format(it) }
        prefs.edit().putString(KEY_SECRET, created).apply()
        return created
    }

    fun registrationCode(hardwareId: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(hardwareId.toByteArray())
        val sb = StringBuilder()
        for (i in 0 until 6) {
            val b = digest[i].toInt() and 0xFF
            sb.append(CODE_ALPHABET[b % CODE_ALPHABET.length])
        }
        return sb.toString()
    }

    fun model(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    private fun sha256Hex(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray())
            .joinToString("") { "%02x".format(it) }
}
