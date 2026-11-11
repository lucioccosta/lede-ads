package com.lede.edge.ui

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.lede.edge.BuildConfig
import com.lede.edge.data.DeviceIdentity
import com.lede.edge.data.DeviceStore
import com.lede.edge.data.DeviceTelemetryCollector
import com.lede.edge.data.EdgeApi
import com.lede.edge.data.PairResult
import com.lede.edge.databinding.ActivityPairingBinding
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Auto-registro (substitui o pairing manual por código).
 *
 * O box se apresenta ao Cloud com hardwareId + segredo e consulta a decisão
 * a cada 10 s. Quando a LEDE aceita em Telas → Aguardando aprovação, recebe o
 * token e abre o Player. Sem rede / Cloud fora: tenta para sempre com backoff
 * (5 s → 60 s). A TV mostra só o logo e o código do box.
 */
class PairingActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPairingBinding
    private lateinit var store: DeviceStore
    private val api = EdgeApi()
    private var loop: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = DeviceStore(this)
        if (!store.deviceToken.isNullOrBlank()) {
            openPlayer()
            return
        }

        binding = ActivityPairingBinding.inflate(layoutInflater)
        setContentView(binding.root)
        OrientationHelper.apply(this, binding.root, store.orientation)

        val hardwareId = DeviceIdentity.hardwareId(this)
        binding.registrationCode.text = DeviceIdentity.registrationCode(hardwareId)
    }

    override fun onStart() {
        super.onStart()
        if (::binding.isInitialized && loop?.isActive != true) {
            loop = lifecycleScope.launch { registrationLoop() }
        }
    }

    override fun onStop() {
        loop?.cancel()
        loop = null
        super.onStop()
    }

    private suspend fun registrationLoop() {
        val hardwareId = DeviceIdentity.hardwareId(this)
        val secret = DeviceIdentity.secret(this)
        var status = "unknown"
        var lastRegisterAt = 0L
        var backoffMs = RETRY_MIN_MS

        while (lifecycleScope.isActive && store.deviceToken.isNullOrBlank()) {
            val waitMs = try {
                val now = System.currentTimeMillis()
                if (status == "unknown" || now - lastRegisterAt > REFRESH_MS) {
                    val reg = api.register(registrationPayload(hardwareId, secret))
                    lastRegisterAt = now
                    status = reg.status
                    reg.code?.let { binding.registrationCode.text = it }
                }
                val res = api.registerStatus(hardwareId, secret)
                status = res.status
                res.code?.let { binding.registrationCode.text = it }
                val approval = res.approval
                if (approval != null) {
                    applyApproval(approval)
                    return
                }
                Log.i(TAG, "Registro: $status${res.reason?.let { " ($it)" } ?: ""}")
                backoffMs = RETRY_MIN_MS
                if (status == "rejected") REJECTED_POLL_MS else POLL_MS
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Sem rede / DNS / Cloud fora / resposta inesperada: nunca desiste
                Log.i(TAG, "Registro: sem resposta do Cloud (${e.message}) — nova tentativa em ${backoffMs / 1000}s")
                status = "unknown"
                val wait = backoffMs
                backoffMs = (backoffMs * 2).coerceAtMost(RETRY_MAX_MS)
                wait
            }
            delay(waitMs)
        }
        if (!store.deviceToken.isNullOrBlank()) openPlayer()
    }

    private suspend fun registrationPayload(hardwareId: String, secret: String): JSONObject {
        val telemetry = runCatching { DeviceTelemetryCollector.collect(this) }.getOrNull()
        return JSONObject()
            .put("hardwareId", hardwareId)
            .put("secret", secret)
            .put("model", DeviceIdentity.model())
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("appFlavor", BuildConfig.ENV_NAME)
            .apply {
                telemetry?.ipAddress?.takeIf { it.isNotBlank() }?.let { put("ipAddress", it) }
                telemetry?.screenWidth?.let { put("screenWidth", it) }
                telemetry?.screenHeight?.let { put("screenHeight", it) }
            }
    }

    private fun applyApproval(result: PairResult) {
        Log.i(TAG, "Registro aprovado no Cloud: ${result.name} (${result.shortCode})")
        store.deviceToken = result.deviceToken
        store.deviceId = result.deviceId
        store.deviceName = result.name
        if (result.shortCode.isNotBlank()) store.shortCode = result.shortCode
        store.orientation = result.orientation
        openPlayer()
    }

    private fun openPlayer() {
        startActivity(Intent(this, PlayerActivity::class.java))
        finish()
    }

    companion object {
        private const val TAG = "Registration"
        private const val POLL_MS = 10_000L
        private const val REFRESH_MS = 5 * 60_000L
        private const val REJECTED_POLL_MS = 60_000L
        private const val RETRY_MIN_MS = 5_000L
        private const val RETRY_MAX_MS = 60_000L
    }
}
