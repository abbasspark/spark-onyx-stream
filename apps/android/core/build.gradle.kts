// SPDX-License-Identifier: AGPL-3.0-only
//
// What the television and the phone share: the API, what a device
// remembers, and every decision that is the same in both places. No screens
// here — those are each app's own.

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

fun property(name: String, fallback: String): String =
    (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: fallback

android {
    namespace = "de.sparksystem.onyx"
    compileSdk = 35

    defaultConfig {
        minSdk = 24

        // What an app calls itself to the API, which can turn away versions
        // that are too old. Each app overrides the name.
        buildConfigField("String", "CLIENT_NAME", "\"android\"")
        buildConfigField(
            "String",
            "DEFAULT_SERVER_URL",
            "\"${property("onyx.serverUrl", "")}\"",
        )
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Dates and times come from the API as strings and are read with
        // java.time, which Android only has from version 8.
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
        named("main") { kotlin.srcDir("src/main/kotlin") }
        named("test") { kotlin.srcDir("src/test/kotlin") }
    }
}

dependencies {
    // These are api, not implementation: an app that depends on core works
    // with the models, the view models and Compose colours directly.
    api(libs.androidx.core.ktx)
    api(libs.androidx.lifecycle.runtime)
    api(libs.androidx.lifecycle.viewmodel.compose)
    api(libs.androidx.lifecycle.runtime.compose)
    api(platform(libs.androidx.compose.bom))
    api(libs.androidx.compose.ui)
    api(libs.androidx.datastore.preferences)
    api(libs.okhttp)
    // The ads of a video are played through the same player as the video.
    api(libs.media3.exoplayer)
    api(libs.kotlinx.serialization.json)

    coreLibraryDesugaring(libs.desugar.jdk.libs)

    testImplementation(libs.junit)
}
