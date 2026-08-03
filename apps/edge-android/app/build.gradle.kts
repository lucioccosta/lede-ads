plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** Produção (Dokploy). Override release: -Plede.apiBaseUrl=... */
val PROD_API_BASE_URL = "https://api.lede.tv.br/api"

/** Dev / debug na LAN (Aquario). Override: -Plede.devApiBaseUrl=... ou local.properties */
val DEV_API_BASE_URL = "http://192.168.55.2:3001/api"

/** Pasta do artefato deste tipo de edge (relativa à raiz do monorepo). */
val EDGE_RELEASE_DIR = "releases/edge/aquario-stv2000-plus"
val EDGE_APK_PREFIX = "lede-edge-aquario-stv2000-plus"

fun readLocalProp(key: String): String? {
    val localFile = rootProject.file("local.properties")
    if (!localFile.exists()) return null
    localFile.readLines().forEach { line ->
        val trimmed = line.trim()
        if (trimmed.startsWith("$key=")) {
            val v = trimmed.substringAfter("=").trim()
            if (v.isNotBlank()) return v
        }
    }
    return null
}

fun readApiBaseUrl(forDebug: Boolean): String {
    if (forDebug) {
        val fromProp = project.findProperty("lede.devApiBaseUrl") as String?
        if (!fromProp.isNullOrBlank()) return fromProp.trim()
        readLocalProp("lede.devApiBaseUrl")?.let { return it }
        return DEV_API_BASE_URL
    }

    val fromProp = project.findProperty("lede.apiBaseUrl") as String?
    if (!fromProp.isNullOrBlank()) return fromProp.trim()
    readLocalProp("lede.apiBaseUrl")?.let { return it }
    return PROD_API_BASE_URL
}

fun repoRoot(): java.io.File =
    rootProject.projectDir.resolve("../..").normalize()

val releaseApiBaseUrl = readApiBaseUrl(forDebug = false)
val debugApiBaseUrl = readApiBaseUrl(forDebug = true)

android {
    namespace = "com.lede.edge"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lede.edge"
        // Aquario STV-2000 Plus = Android 10 (API 29), ARM Cortex-A53
        minSdk = 29
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
        buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")

        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a")
        }
    }

    signingConfigs {
        create("sideload") {
            val ks = rootProject.file("keystore/lede-edge-sideload.jks")
            if (ks.exists()) {
                storeFile = ks
                storePassword = (project.findProperty("lede.storePassword") as String?) ?: "lede-edge"
                keyAlias = (project.findProperty("lede.keyAlias") as String?) ?: "lede-edge"
                keyPassword = (project.findProperty("lede.keyPassword") as String?) ?: "lede-edge"
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            buildConfigField("String", "API_BASE_URL", "\"$debugApiBaseUrl\"")
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            val sideload = signingConfigs.findByName("sideload")
            if (sideload?.storeFile?.exists() == true) {
                signingConfig = sideload
            }
            buildConfigField("String", "API_BASE_URL", "\"$releaseApiBaseUrl\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.1")
    implementation("androidx.media3:media3-exoplayer:1.2.1")
    implementation("androidx.media3:media3-ui:1.2.1")
    implementation("io.coil-kt:coil:2.5.0")
}

tasks.register<Copy>("exportSideloadApk") {
    dependsOn("assembleRelease")
    from(layout.buildDirectory.dir("outputs/apk/release"))
    include("*.apk")
    into(repoRoot().resolve(EDGE_RELEASE_DIR))
    rename { "$EDGE_APK_PREFIX-v${android.defaultConfig.versionName}.apk" }
    doLast {
        val out = repoRoot().resolve(EDGE_RELEASE_DIR)
            .resolve("$EDGE_APK_PREFIX-v${android.defaultConfig.versionName}.apk")
        println("APK: $out")
        println("API_BASE_URL=$releaseApiBaseUrl")
    }
}
