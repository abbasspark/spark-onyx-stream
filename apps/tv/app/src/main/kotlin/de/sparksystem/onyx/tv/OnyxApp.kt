// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv

import android.app.Application
import de.sparksystem.onyx.tv.data.ApiClient
import de.sparksystem.onyx.tv.data.SessionStore

/**
 * The one place everything is built from.
 *
 * No dependency-injection framework: this app has three things to hand
 * round, and an operator who compiles it themselves should be able to follow
 * where each of them comes from by reading one file.
 */
class OnyxApp : Application() {
    lateinit var container: Container
        private set

    override fun onCreate() {
        super.onCreate()
        container = Container(this)
    }
}

class Container(application: Application) {
    val session = SessionStore(application)
    val api = ApiClient(session)
}
