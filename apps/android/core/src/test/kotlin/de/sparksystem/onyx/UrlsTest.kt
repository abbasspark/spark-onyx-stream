// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx

import de.sparksystem.onyx.data.absoluteUrl
import de.sparksystem.onyx.data.absoluteUrls
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The API gives a browser paths. A player on a phone reads a path as a file,
 * and fails with "No such file or directory". These tests keep every address
 * the app is given whole.
 */
class UrlsTest {
    private val server = "http://10.0.2.2:3000/v1/catalog/titles/x/playback".toHttpUrl()

    private fun read(text: String) = Json.parseToJsonElement(text)

    @Test
    fun `a path is made whole against the server`() {
        assertEquals(
            "http://10.0.2.2:3000/v1/media/a/b/hls/master.m3u8",
            absoluteUrl("/v1/media/a/b/hls/master.m3u8", server),
        )
    }

    @Test
    fun `a whole address, a protocol-relative one and plain text stay as they are`() {
        assertEquals("https://cdn.example.com/x.m3u8", absoluteUrl("https://cdn.example.com/x.m3u8", server))
        assertEquals("//cdn.example.com/x", absoluteUrl("//cdn.example.com/x", server))
        assertEquals("Test Pattern", absoluteUrl("Test Pattern", server))
        assertEquals("", absoluteUrl("", server))
    }

    @Test
    fun `a playback answer has every address made whole`() {
        val answer = read(
            """{"protocol":"hls","manifestUrl":"/v1/media/a/t/hls/master.m3u8",
               "posterUrl":"/v1/media/a/t/thumbs/poster.jpg","thumbnailTrackUrl":null,
               "audio":[{"language":"de","url":"/v1/media/a/t/hls/audio-de.m3u8"}],
               "subtitles":[{"label":"English","url":"https://elsewhere.example.com/en.vtt"}]}""",
        )

        val fixed = absoluteUrls(answer, server).jsonObject

        assertEquals("http://10.0.2.2:3000/v1/media/a/t/hls/master.m3u8", fixed["manifestUrl"]?.jsonPrimitive?.content)
        assertEquals("http://10.0.2.2:3000/v1/media/a/t/thumbs/poster.jpg", fixed["posterUrl"]?.jsonPrimitive?.content)
        assertEquals(
            "http://10.0.2.2:3000/v1/media/a/t/hls/audio-de.m3u8",
            fixed["audio"]?.jsonArray?.first()?.jsonObject?.get("url")?.jsonPrimitive?.content,
        )
        assertEquals(
            "https://elsewhere.example.com/en.vtt",
            fixed["subtitles"]?.jsonArray?.first()?.jsonObject?.get("url")?.jsonPrimitive?.content,
        )
        // Untouched: the protocol, and a field that is null.
        assertEquals("hls", fixed["protocol"]?.jsonPrimitive?.content)
    }

    @Test
    fun `only fields named url or ending in Url are changed`() {
        val answer = read("""{"name":"/not/an/address","slug":"/v1/x","url":"/v1/a","posterUrl":"/v1/b","note":"/v1/c"}""")

        val fixed = absoluteUrls(answer, server).jsonObject

        assertEquals("/not/an/address", fixed["name"]?.jsonPrimitive?.content)
        assertEquals("/v1/x", fixed["slug"]?.jsonPrimitive?.content)
        assertEquals("/v1/c", fixed["note"]?.jsonPrimitive?.content)
        assertEquals("http://10.0.2.2:3000/v1/a", fixed["url"]?.jsonPrimitive?.content)
        assertEquals("http://10.0.2.2:3000/v1/b", fixed["posterUrl"]?.jsonPrimitive?.content)
    }

    @Test
    fun `a service behind a path keeps its host and port`() {
        val behind = "https://example.com/onyx/v1/catalog/home".toHttpUrl()
        // As in a browser, a path that starts with a slash is on the host, not under the service's path.
        assertEquals("https://example.com/v1/media/a", absoluteUrl("/v1/media/a", behind))
    }
}
