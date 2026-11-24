// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv

import de.sparksystem.onyx.tv.data.serverAddressOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AddressTest {
    @Test
    fun `a plain host is taken as https`() {
        assertEquals("https://stream.example.com/", serverAddressOf("stream.example.com")?.toString())
    }

    @Test
    fun `a trailing slash and stray spaces are forgiven`() {
        assertEquals(
            "https://stream.example.com/",
            serverAddressOf("  stream.example.com/  ")?.toString(),
        )
    }

    @Test
    fun `a scheme the viewer typed is kept`() {
        assertEquals("http://192.168.1.40:3000/", serverAddressOf("http://192.168.1.40:3000")?.toString())
    }

    @Test
    fun `a path is kept, for a service behind one`() {
        assertEquals("https://example.com/onyx", serverAddressOf("https://example.com/onyx")?.toString())
    }

    @Test
    fun `nothing is not an address`() {
        assertNull(serverAddressOf(""))
        assertNull(serverAddressOf("   "))
    }

    @Test
    fun `a word is not an address`() {
        // Somebody who stopped halfway through typing.
        assertNull(serverAddressOf("stream"))
        assertNull(serverAddressOf("https://stream"))
    }

    @Test
    fun `a host on this machine is allowed, for somebody testing`() {
        assertEquals("http://localhost:3000/", serverAddressOf("http://localhost:3000")?.toString())
    }

    @Test
    fun `a host with a port needs no dot`() {
        // A name on a home network, reached by port, is a real address.
        assertEquals("http://onyx-box:8080/", serverAddressOf("http://onyx-box:8080")?.toString())
    }
}
