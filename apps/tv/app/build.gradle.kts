// SPDX-License-Identifier: AGPL-3.0-only

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

/** A setting an operator can change in gradle.properties or on the command line. */
fun property(name: String, fallback: String): String =
    (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: fallback

android {
    namespace = "de.sparksystem.onyx.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = property("onyx.applicationId", "de.sparksystem.onyx.tv")
        // Android 7. Below that the television is old enough that its browser,
        // its codecs and its Play Services are all a different piece of work.
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // What the app calls itself to the API, which can turn away versions
        // that are too old to be trusted with it.
        buildConfigField("String", "CLIENT_NAME", "\"android-tv\"")
        buildConfigField(
            "String",
            "DEFAULT_SERVER_URL",
            "\"${property("onyx.serverUrl", "")}\"",
        )
        resValue("string", "app_name", property("onyx.appName", "Onyx"))
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Dates and times come from the API as strings and are read with
        // java.time, which Android only has from version 8. Desugaring puts
        // it on the older televisions this app still supports, which is
        // cheaper than carrying a date library or raising the floor.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets {
        named("main") {
            kotlin.srcDir("src/main/kotlin")
        }
        named("test") {
            kotlin.srcDir("src/test/kotlin")
        }
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.tv.material)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.ui)
    implementation(libs.media3.session)

    implementation(libs.coil.compose)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.zxing.core)

    coreLibraryDesugaring(libs.desugar.jdk.libs)

    testImplementation(libs.junit)
}
