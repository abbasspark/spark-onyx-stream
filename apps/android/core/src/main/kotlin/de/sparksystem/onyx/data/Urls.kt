// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.HttpUrl

/**
 * The API answers a browser with addresses such as `/v1/media/…/master.m3u8`,
 * which the browser reads against the site it is on. An app is on no site: the
 * player would read that as a file on the phone. So every address in an answer
 * is made whole against the server the answer came from.
 *
 * An address is a field called `url`, or one that ends in `Url`, whose value
 * starts with a single slash. Whole addresses are left as they are, and so is
 * everything else that merely looks like a path.
 */
internal fun absoluteUrls(element: JsonElement, server: HttpUrl): JsonElement = when (element) {
    is JsonObject -> JsonObject(
        element.mapValues { (name, value) ->
            if (isAddressField(name) && value is JsonPrimitive && value.isString) {
                JsonPrimitive(absoluteUrl(value.content, server))
            } else {
                absoluteUrls(value, server)
            }
        },
    )
    is JsonArray -> JsonArray(element.map { absoluteUrls(it, server) })
    else -> element
}

private fun isAddressField(name: String): Boolean =
    name == "url" || name.endsWith("Url")

/** The address against the server, when it is a path on it. Anything else comes back unchanged. */
internal fun absoluteUrl(value: String, server: HttpUrl): String {
    if (!value.startsWith("/") || value.startsWith("//")) {
        return value
    }
    return server.resolve(value)?.toString() ?: value
}
