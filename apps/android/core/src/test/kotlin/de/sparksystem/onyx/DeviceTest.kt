// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx

import de.sparksystem.onyx.data.DeviceDescription
import de.sparksystem.onyx.data.phoneDevice
import de.sparksystem.onyx.data.tvDevice
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What the app says about its device when it signs in is a contract with the
 * server, which refuses anything else with "Validation failed". These tests
 * hold the app to it. Neither app could sign in until they did.
 */
class DeviceTest {
    private val json = Json { explicitNulls = false }

    /** The kinds the API's device schema accepts. */
    private val kinds = setOf("TV", "MOBILE", "TABLET", "DESKTOP", "OTHER")

    private fun fields(device: DeviceDescription) =
        json.parseToJsonElement(json.encodeToString(DeviceDescription.serializer(), device)).jsonObject

    @Test
    fun `a phone is a MOBILE with an installation id`() {
        val sent = fields(phoneDevice("0b9c7e2a-3c1d-4f6e-8a55-1d2e3f4a5b6c", "Pixel 8"))

        assertEquals("MOBILE", sent["kind"]?.jsonPrimitive?.content)
        assertEquals("android", sent["platform"]?.jsonPrimitive?.content)
        assertEquals("Pixel 8", sent["name"]?.jsonPrimitive?.content)
        assertEquals(
            "0b9c7e2a-3c1d-4f6e-8a55-1d2e3f4a5b6c",
            sent["installationId"]?.jsonPrimitive?.content,
        )
    }

    @Test
    fun `a television is a TV with an installation id and says its model`() {
        val sent = fields(tvDevice("0b9c7e2a-3c1d-4f6e-8a55-1d2e3f4a5b6c", "Living room", "Chromecast"))

        assertEquals("TV", sent["kind"]?.jsonPrimitive?.content)
        assertEquals("android-tv", sent["platform"]?.jsonPrimitive?.content)
        assertEquals("Chromecast", sent["model"]?.jsonPrimitive?.content)
        assertTrue(sent.containsKey("installationId"))
    }

    @Test
    fun `no field the server reads is left out or empty`() {
        for (device in listOf(phoneDevice(UUID.randomUUID().toString(), "Phone"), tvDevice(UUID.randomUUID().toString(), "TV", null))) {
            val sent = fields(device)
            for (required in listOf("installationId", "name", "kind", "platform")) {
                assertTrue("$required is sent", sent[required]?.jsonPrimitive?.content?.isNotBlank() == true)
            }
            assertTrue("the kind is one the server knows", sent["kind"]?.jsonPrimitive?.content in kinds)
        }
    }

    @Test
    fun `a model that is not known is left out and not sent as null`() {
        assertFalse(fields(phoneDevice("0b9c7e2a-3c1d-4f6e-8a55-1d2e3f4a5b6c", "Phone")).containsKey("model"))
    }

    @Test
    fun `a generated installation id is one the server accepts`() {
        // 8 to 64 letters, digits, hyphens and underscores.
        val accepted = Regex("^[A-Za-z0-9_-]{8,64}$")
        assertTrue(accepted.matches(UUID.randomUUID().toString()))
    }
}
