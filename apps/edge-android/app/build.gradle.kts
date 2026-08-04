plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** Pastas de artefato (relativas à raiz do monorepo). */
val EDGE_DEVICE_DIR = "releases/edge/aquario-stv2000-plus"
val EDGE_CASA_DIR = "releases/edge/casa"
val EDGE_FIOS_DIR = "releases/edge/fios"

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

fun apiUrl(propKey: String, default: String): String {
    val fromProp = project.findProperty(propKey) as String?
    if (!fromProp.isNullOrBlank()) return fromProp.trim()
    readLocalProp(propKey)?.let { return it }
    return default
}

val prodApi = apiUrl("lede.apiBaseUrl", "https://api.lede.tv.br/api")
val casaApi = apiUrl("lede.casaApiBaseUrl", "http://192.168.10.142:3001/api")
val fiosApi = apiUrl("lede.fiosApiBaseUrl", "http://192.168.55.2:3001/api")

fun repoRoot(): java.io.File =
    rootProject.projectDir.resolve("../..").normalize()

android {
    namespace = "com.lede.edge"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lede.edge"
        // Aquario STV-2000 Plus = Android 10 (API 29), ARM Cortex-A53
        minSdk = 29
        targetSdk = 35
        versionCode = 5
        versionName = "0.3.2"

        ndk {
            abiFilters += listOf("armeabi-v7a", "arm64-v8a")
        }
    }

    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            buildConfigField("String", "API_BASE_URL", "\"$prodApi\"")
            buildConfigField("String", "ENV_NAME", "\"prod\"")
        }
        create("casa") {
            dimension = "env"
            applicationIdSuffix = ".casa"
            versionNameSuffix = "-casa"
            resValue("string", "app_name", "LEDE Edge Casa")
            buildConfigField("String", "API_BASE_URL", "\"$casaApi\"")
            buildConfigField("String", "ENV_NAME", "\"casa\"")
        }
        create("fios") {
            dimension = "env"
            applicationIdSuffix = ".fios"
            versionNameSuffix = "-fios"
            resValue("string", "app_name", "LEDE Edge Fios")
            buildConfigField("String", "API_BASE_URL", "\"$fiosApi\"")
            buildConfigField("String", "ENV_NAME", "\"fios\"")
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
            // debug + flavor: ex. com.lede.edge.casa.debug
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
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

fun registerExportApk(
    taskName: String,
    assembleTask: String,
    apkDirVariant: String,
    outRelDir: String,
    apkFileName: String,
    apiUrl: String,
) {
    tasks.register<Copy>(taskName) {
        dependsOn(assembleTask)
        from(layout.buildDirectory.dir("outputs/apk/$apkDirVariant"))
        include("*.apk")
        into(repoRoot().resolve(outRelDir))
        rename { apkFileName }
        doLast {
            val out = repoRoot().resolve(outRelDir).resolve(apkFileName)
            println("APK: $out")
            println("API_BASE_URL=$apiUrl")
        }
    }
}

val versionName = android.defaultConfig.versionName

registerExportApk(
    taskName = "exportSideloadApk",
    assembleTask = "assembleProdRelease",
    apkDirVariant = "prod/release",
    outRelDir = EDGE_DEVICE_DIR,
    apkFileName = "lede-edge-aquario-stv2000-plus-v$versionName.apk",
    apiUrl = prodApi,
)

registerExportApk(
    taskName = "exportCasaApk",
    assembleTask = "assembleCasaRelease",
    apkDirVariant = "casa/release",
    outRelDir = EDGE_CASA_DIR,
    apkFileName = "lede-edge-casa-v$versionName-casa.apk",
    apiUrl = casaApi,
)

registerExportApk(
    taskName = "exportFiosApk",
    assembleTask = "assembleFiosRelease",
    apkDirVariant = "fios/release",
    outRelDir = EDGE_FIOS_DIR,
    apkFileName = "lede-edge-fios-v$versionName-fios.apk",
    apiUrl = fiosApi,
)
