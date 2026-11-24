// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx

import android.app.Application
import de.sparksystem.onyx.data.ApiClient
import de.sparksystem.onyx.data.SessionStore

/**
 * The one place everything is built from, shared by both apps.
 *
 * No dependency-injection framework: there are two things to hand round, and
 * an operator who compiles this themselves should be able to follow where
 * each of them comes from by reading one file.
 */
class Container(application: Application, client: String) {
    val session = SessionStore(application)
    val api = ApiClient(session, client)
}
