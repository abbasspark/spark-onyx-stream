// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv

import android.app.Application
import de.sparksystem.onyx.Container
import de.sparksystem.onyx.tv.BuildConfig

/** The television app. It holds the one container everything else is built from. */
/** What this app calls itself to the API, with its version. */
const val CLIENT = "android-tv/${BuildConfig.VERSION_NAME}"

class OnyxApp : Application() {
    lateinit var container: Container
        private set

    override fun onCreate() {
        super.onCreate()
        // What this app calls itself to the API, which an installation can
        // refuse by version. A television and a phone are told apart here.
        container = Container(this, client = CLIENT)
    }
}
