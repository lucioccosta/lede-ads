package com.lede.edge

import android.app.Application

class LedeEdgeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        KioskPolicy.applyIfOwner(this)
    }
}
