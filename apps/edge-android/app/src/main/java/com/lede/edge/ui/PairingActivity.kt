package com.lede.edge.ui

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.lede.edge.data.DeviceStore
import com.lede.edge.data.EdgeApi
import com.lede.edge.databinding.ActivityPairingBinding
import kotlinx.coroutines.launch

class PairingActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPairingBinding
    private val api = EdgeApi()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = DeviceStore(this)
        if (!store.deviceToken.isNullOrBlank()) {
            startActivity(Intent(this, PlayerActivity::class.java))
            finish()
            return
        }

        binding = ActivityPairingBinding.inflate(layoutInflater)
        setContentView(binding.root)
        OrientationHelper.apply(this, binding.root, store.orientation)

        binding.pairButton.setOnClickListener {
            val code = binding.codeInput.text?.toString().orEmpty().trim()
            if (code.length < 4) {
                Toast.makeText(this, "Código inválido", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            binding.pairButton.isEnabled = false
            lifecycleScope.launch {
                try {
                    val result = api.pair(code, "Android Edge")
                    store.deviceToken = result.deviceToken
                    store.deviceId = result.deviceId
                    store.deviceName = result.name
                    if (result.shortCode.isNotBlank()) {
                        store.shortCode = result.shortCode
                    }
                    store.orientation = result.orientation
                    OrientationHelper.apply(
                        this@PairingActivity,
                        binding.root,
                        result.orientation,
                    )
                    startActivity(Intent(this@PairingActivity, PlayerActivity::class.java))
                    finish()
                } catch (e: Exception) {
                    Toast.makeText(
                        this@PairingActivity,
                        e.message ?: "Erro no pairing",
                        Toast.LENGTH_LONG,
                    ).show()
                    binding.pairButton.isEnabled = true
                }
            }
        }
    }
}
