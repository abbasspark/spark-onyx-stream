// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile

import android.app.Application
import de.sparksystem.onyx.Container

/** What this app calls itself to the API, with its version. */
const val CLIENT = "android/${BuildConfig.VERSION_NAME}"

/** The phone app. It holds the one container everything else is built from. */
class OnyxApp : Application() {
    lateinit var container: Container
        private set

    override fun onCreate() {
        super.onCreate()
        container = Container(this, client = CLIENT)
    }
}
