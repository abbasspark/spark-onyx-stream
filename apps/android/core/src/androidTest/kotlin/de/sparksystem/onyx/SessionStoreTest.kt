// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import de.sparksystem.onyx.data.SessionStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The API client reads the session from a copy the store keeps in memory, on a
 * background thread, while nothing is collecting the store's flow. These run on
 * a device because the store is Android's DataStore.
 *
 * They exist because the copy was once only read at start-up: a viewer who had
 * just signed in was sent to the server without a token, got a 401, and the
 * app wiped the token it had just been given.
 */
@RunWith(AndroidJUnit4::class)
class SessionStoreTest {
    private lateinit var store: SessionStore

    @Before
    fun clean() {
        store = SessionStore(ApplicationProvider.getApplicationContext<Application>())
        runBlocking { store.forgetEverything() }
    }

    @Test
    fun a_token_is_there_at_once_after_signing_in() = runBlocking {
        assertNull(store.token())

        store.signIn("onyx_view_abc", "Mia")

        // Read the way the API client reads it: no flow, no wait.
        assertEquals("onyx_view_abc", store.token())
    }

    @Test
    fun signing_out_takes_the_token_away_at_once() = runBlocking {
        store.signIn("onyx_view_abc", "Mia")

        store.signOut()

        assertNull(store.token())
    }

    @Test
    fun the_server_and_the_profile_are_there_at_once() = runBlocking {
        store.setServer("https://stream.example.com/")
        store.setProfile("p1", "Mia")

        assertEquals("https://stream.example.com", store.serverUrl())

        store.forgetProfile()
        // The profile is gone, and the token that was never set is still not there.
        assertNull(store.token())
    }

    @Test
    fun the_installation_id_is_made_once_and_survives_signing_out() = runBlocking {
        val first = store.installationId()
        assertEquals(first, store.installationId())

        store.signIn("onyx_view_abc", "Mia")
        store.signOut()

        // The same device is the same device, signed in or not.
        assertEquals(first, store.installationId())
    }

    @Test
    fun a_device_that_is_handed_on_gets_an_id_of_its_own() = runBlocking {
        val first = store.installationId()

        store.forgetEverything()

        assertNotEquals(first, store.installationId())
    }
}
