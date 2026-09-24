plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** Pastas de artefato (relativas à raiz do monorepo). */
val EDGE_SB3000_DIR = "releases/edge/sb3000"
val EDGE_SB3000_FIOS_DIR = "releases/edge/sb3000-fios"
val EDGE_SB3000_CASA_DIR = "releases/edge/sb3000-casa"

/**
 * Convenção de APK:
 *   lede-edge-{targetId}-v{X.Y.Z}.apk
 *
 * targetId:
 *   sb3000       — produção (GitHub Releases + OTA)
 *   sb3000-fios  — desenvolvimento local (API Fios) — NÃO publicar no GitHub
 *   sb3000-casa  — desenvolvimento local (API Casa) — NÃO publicar no GitHub
 */
fun edgeApkName(targetId: String, version: String) =
    "lede-edge-$targetId-v$version.apk"

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
// Rede Fios / Proeletronic SB3000 (LAN do servidor de desenvolvimento)
val fiosApi = apiUrl("lede.fiosApiBaseUrl", "http://192.168.77.207:3001/api")

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
        versionCode = 22
        versionName = "0.5.4"

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
            // Proeletronic SB3000 — launcher nativo (produção)
            buildConfigField("String", "OEM_LAUNCHER_PACKAGE", "\"com.a.nova.launcher\"")
            buildConfigField("String", "OEM_LAUNCHER_ACTIVITY", "\"\"")
            buildConfigField("String", "OEM_LAUNCHER_LABEL", "\"Nova\"")
        }
        create("casa") {
            dimension = "env"
            applicationIdSuffix = ".casa"
            versionNameSuffix = "-casa"
            buildConfigField("String", "API_BASE_URL", "\"$casaApi\"")
            buildConfigField("String", "ENV_NAME", "\"casa\"")
            buildConfigField("String", "OEM_LAUNCHER_PACKAGE", "\"com.a.nova.launcher\"")
            buildConfigField("String", "OEM_LAUNCHER_ACTIVITY", "\"\"")
            buildConfigField("String", "OEM_LAUNCHER_LABEL", "\"Nova\"")
        }
        create("fios") {
            dimension = "env"
            applicationIdSuffix = ".fios"
            versionNameSuffix = "-fios"
            buildConfigField("String", "API_BASE_URL", "\"$fiosApi\"")
            buildConfigField("String", "ENV_NAME", "\"fios\"")
            buildConfigField("String", "OEM_LAUNCHER_PACKAGE", "\"com.a.nova.launcher\"")
            buildConfigField("String", "OEM_LAUNCHER_ACTIVITY", "\"\"")
            buildConfigField("String", "OEM_LAUNCHER_LABEL", "\"Nova\"")
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

val versionName = android.defaultConfig.versionName!!

/** Produção — publicar no GitHub Releases (OTA). */
registerExportApk(
    taskName = "exportSb3000Apk",
    assembleTask = "assembleProdRelease",
    apkDirVariant = "prod/release",
    outRelDir = EDGE_SB3000_DIR,
    apkFileName = edgeApkName("sb3000", versionName),
    apiUrl = prodApi,
)

/** Alias legado → produção SB3000. */
tasks.register("exportSideloadApk") {
    dependsOn("exportSb3000Apk")
}

/** Dev local Fios — NÃO publicar no GitHub. */
registerExportApk(
    taskName = "exportSb3000FiosApk",
    assembleTask = "assembleFiosRelease",
    apkDirVariant = "fios/release",
    outRelDir = EDGE_SB3000_FIOS_DIR,
    apkFileName = edgeApkName("sb3000-fios", versionName),
    apiUrl = fiosApi,
)

tasks.register("exportFiosProsb3000Apk") {
    dependsOn("exportSb3000FiosApk")
    doLast {
        logger.warn("exportFiosProsb3000Apk está deprecado — use exportSb3000FiosApk")
    }
}

tasks.register("exportFiosApk") {
    dependsOn("exportSb3000FiosApk")
    doLast {
        logger.warn("exportFiosApk está deprecado — use exportSb3000FiosApk")
    }
}

/** Dev local Casa — NÃO publicar no GitHub. */
registerExportApk(
    taskName = "exportSb3000CasaApk",
    assembleTask = "assembleCasaRelease",
    apkDirVariant = "casa/release",
    outRelDir = EDGE_SB3000_CASA_DIR,
    apkFileName = edgeApkName("sb3000-casa", versionName),
    apiUrl = casaApi,
)

tasks.register("exportCasaApk") {
    dependsOn("exportSb3000CasaApk")
    doLast {
        logger.warn("exportCasaApk está deprecado — use exportSb3000CasaApk")
    }
}
