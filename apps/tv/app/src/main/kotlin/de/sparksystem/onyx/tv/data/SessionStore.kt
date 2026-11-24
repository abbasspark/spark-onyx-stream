// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import de.sparksystem.onyx.tv.BuildConfig
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking

private val Context.store by preferencesDataStore(name = "onyx")

/**
 * What this television remembers between evenings: which server it belongs
 * to, who is signed in, and which profile is watching.
 *
 * The token is the one piece worth guarding. It is kept in the same store as
 * the rest, which on Android is private to the app; a television has no lock
 * screen and no second user, so a keystore here would be ceremony rather
 * than safety.
 */
class SessionStore(private val context: Context) {

    private object Keys {
        val server = stringPreferencesKey("server")
        val token = stringPreferencesKey("token")
        val viewerName = stringPreferencesKey("viewer-name")
        val profileId = stringPreferencesKey("profile-id")
        val profileName = stringPreferencesKey("profile-name")
        val accent = stringPreferencesKey("accent")
        val siteName = stringPreferencesKey("site-name")
    }

    /** What is in the store, kept in memory so the API client can read it without waiting. */
    @Volatile
    private var current: Preferences? = null

    val changes: Flow<Session> = context.store.data.map { preferences ->
        current = preferences
        Session(
            serverUrl = preferences[Keys.server] ?: BuildConfig.DEFAULT_SERVER_URL.ifBlank { null },
            token = preferences[Keys.token],
            viewerName = preferences[Keys.viewerName],
            profileId = preferences[Keys.profileId],
            profileName = preferences[Keys.profileName],
            accent = preferences[Keys.accent],
            siteName = preferences[Keys.siteName],
        )
    }

    /** Reads what is stored once, before anything is shown. */
    suspend fun load(): Session = changes.first()

    // The API client runs on a background thread and needs these as plain
    // values. They come from the copy the flow above keeps up to date; only
    // the very first call, before anything has been read, has to wait.
    private fun preferences(): Preferences =
        current ?: runBlocking { context.store.data.first().also { current = it } }

    fun serverUrl(): String? =
        preferences()[Keys.server] ?: BuildConfig.DEFAULT_SERVER_URL.ifBlank { null }

    fun token(): String? = preferences()[Keys.token]

    suspend fun setServer(url: String) {
        context.store.edit { it[Keys.server] = url.trim().trimEnd('/') }
    }

    suspend fun signIn(token: String, viewerName: String?) {
        context.store.edit {
            it[Keys.token] = token
            if (viewerName != null) {
                it[Keys.viewerName] = viewerName
            }
        }
    }

    suspend fun setProfile(id: String, name: String) {
        context.store.edit {
            it[Keys.profileId] = id
            it[Keys.profileName] = name
        }
    }

    suspend fun setSite(name: String, accent: String?) {
        context.store.edit {
            it[Keys.siteName] = name
            if (accent != null) {
                it[Keys.accent] = accent
            } else {
                it.remove(Keys.accent)
            }
        }
    }

    /**
     * The token stopped working. Everything about the viewer goes with it,
     * and the server address stays: the television still belongs where it did.
     */
    fun forgetToken() {
        runBlocking { signOut() }
    }

    /** Forgets which profile is watching, so the app asks again. */
    suspend fun forgetProfile() {
        context.store.edit {
            it.remove(Keys.profileId)
            it.remove(Keys.profileName)
        }
    }

    suspend fun signOut() {
        context.store.edit {
            it.remove(Keys.token)
            it.remove(Keys.viewerName)
            it.remove(Keys.profileId)
            it.remove(Keys.profileName)
        }
    }

    /** Forgets the server as well: the television is handed on to somebody else. */
    suspend fun forgetEverything() {
        context.store.edit { it.clear() }
    }
}

data class Session(
    val serverUrl: String? = null,
    val token: String? = null,
    val viewerName: String? = null,
    val profileId: String? = null,
    val profileName: String? = null,
    val accent: String? = null,
    val siteName: String? = null,
) {
    val hasServer: Boolean get() = !serverUrl.isNullOrBlank()
    val signedIn: Boolean get() = !token.isNullOrBlank()
    val hasProfile: Boolean get() = !profileId.isNullOrBlank()
}
