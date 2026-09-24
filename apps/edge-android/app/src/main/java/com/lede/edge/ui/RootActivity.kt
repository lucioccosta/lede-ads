package com.lede.edge.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.lede.edge.data.DeviceStore

/**
 * Entrada única (launcher + home). Encaminha para Player se já pareado,
 * senão para Pairing. Usado no boot e quando o sistema escolhe o app Home.
 */
class RootActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = DeviceStore(this)
        val target = if (!store.deviceToken.isNullOrBlank()) {
            PlayerActivity::class.java
        } else {
            PairingActivity::class.java
        }
        startActivity(
            Intent(this, target).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
        )
        finish()
    }
}
