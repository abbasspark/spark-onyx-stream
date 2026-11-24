// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.data

import de.sparksystem.onyx.tv.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * What came back, or why nothing did. Every call answers one of these, so
 * that a screen can say what went wrong instead of showing an empty page.
 */
sealed interface Answer<out T> {
    data class Ok<T>(val value: T) : Answer<T>

    /** The server answered, and said no. */
    data class Refused(val status: Int, val message: String, val code: String?) : Answer<Nothing>

    /** The server could not be reached at all. */
    data class Unreachable(val cause: String) : Answer<Nothing>

    /** This version of the app is too old for this installation. */
    data class TooOld(val message: String, val updateUrl: String?) : Answer<Nothing>
}

inline fun <T, R> Answer<T>.map(transform: (T) -> R): Answer<R> = when (this) {
    is Answer.Ok -> Answer.Ok(transform(value))
    is Answer.Refused -> this
    is Answer.Unreachable -> this
    is Answer.TooOld -> this
}

fun <T> Answer<T>.valueOrNull(): T? = (this as? Answer.Ok)?.value

/**
 * The viewer API, as much of it as a television uses.
 *
 * Written by hand over OkHttp rather than generated: an operator compiles
 * this app themselves, and a short client they can read through is worth
 * more here than the few lines a code generator would save.
 */
class ApiClient(
    private val session: SessionStore,
    private val http: OkHttpClient = defaultHttp(),
) {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    /** What the app calls itself, which the installation may refuse by version. */
    private val clientHeader = "${BuildConfig.CLIENT_NAME}/${BuildConfig.VERSION_NAME}"

    // --- Addresses -----------------------------------------------------------

    fun addressOf(raw: String): HttpUrl? = serverAddressOf(raw)

    private fun url(path: String, query: Map<String, String?> = emptyMap()): HttpUrl? {
        val base = session.serverUrl()?.let { addressOf(it) } ?: return null
        val builder = base.newBuilder()
        builder.addPathSegment("v1")
        for (segment in path.trim('/').split('/')) {
            builder.addPathSegment(segment)
        }
        for ((name, value) in query) {
            if (value != null) {
                builder.addQueryParameter(name, value)
            }
        }
        return builder.build()
    }

    // --- Calls ----------------------------------------------------------------

    private suspend inline fun <reified T> call(
        method: String,
        path: String,
        query: Map<String, String?> = emptyMap(),
        body: String? = null,
        /** Some calls are for a viewer who is not signed in yet. */
        withToken: Boolean = true,
    ): Answer<T> = withContext(Dispatchers.IO) {
        val address = url(path, query)
            ?: return@withContext Answer.Unreachable("No server address is set.")
        val request = Request.Builder()
            .url(address)
            .header("X-Onyx-Client", clientHeader)
            .header("Accept", "application/json")
            .apply {
                val token = if (withToken) session.token() else null
                if (token != null) {
                    header("Authorization", "Bearer $token")
                }
                when (method) {
                    "POST" -> post((body ?: "{}").toRequestBody(jsonType))
                    "PUT" -> put((body ?: "{}").toRequestBody(jsonType))
                    "DELETE" -> delete()
                    else -> get()
                }
            }
            .build()

        try {
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (response.isSuccessful) {
                    return@withContext if (T::class == Unit::class) {
                        @Suppress("UNCHECKED_CAST")
                        Answer.Ok(Unit as T)
                    } else {
                        Answer.Ok(json.decodeFromString<T>(text))
                    }
                }
                val failure = runCatching { json.decodeFromString<ApiError>(text) }.getOrNull()
                // The installation turns away versions it no longer trusts.
                // That is not an error to retry; it is a screen of its own.
                if (failure?.code == "client_too_old") {
                    return@withContext Answer.TooOld(failure.message, null)
                }
                // A token that is no longer good means the television has to
                // be signed in again, which the session store notices.
                if (response.code == 401 && withToken) {
                    session.forgetToken()
                }
                Answer.Refused(
                    response.code,
                    failure?.message?.takeIf { it.isNotBlank() } ?: "The server refused.",
                    failure?.code,
                )
            }
        } catch (error: IOException) {
            Answer.Unreachable(error.message ?: "The server could not be reached.")
        } catch (error: IllegalArgumentException) {
            // Something the server sent could not be read. Treat it as a
            // refusal rather than letting it take the app down.
            Answer.Refused(0, error.message ?: "The server sent something unexpected.", null)
        }
    }

    // --- What the television asks for -----------------------------------------

    suspend fun meta(): Answer<ApiMeta> = call("GET", "meta", withToken = false)

    /** The name, logo and colour the operator set, which the app wears. */
    suspend fun site(): Answer<PublicSite> = call("GET", "catalog/site", withToken = false)

    suspend fun home(): Answer<Home> = call("GET", "catalog/home")

    suspend fun titles(
        type: String? = null,
        page: Int = 1,
        pageSize: Int = 40,
        sort: String? = null,
        category: String? = null,
        genre: String? = null,
        /** Matches the name and the original name, ignoring case. */
        q: String? = null,
    ): Answer<Paged<TitleCard>> = call(
        "GET",
        "catalog/titles",
        mapOf(
            "type" to type,
            "page" to page.toString(),
            "pageSize" to pageSize.toString(),
            "sort" to sort,
            "category" to category,
            "genre" to genre,
            "q" to q,
        ),
    )

    suspend fun genres(): Answer<List<GenreRef>> = call("GET", "catalog/genres")

    suspend fun title(slug: String): Answer<TitleDetail> = call("GET", "catalog/titles/$slug")

    suspend fun playTitle(slug: String): Answer<Playback> =
        call("POST", "catalog/titles/$slug/playback")

    suspend fun playEpisode(id: String): Answer<Playback> =
        call("POST", "catalog/episodes/$id/playback")

    // --- Live channels ----------------------------------------------------------

    suspend fun channels(): Answer<List<Channel>> = call("GET", "catalog/channels")

    suspend fun channel(slug: String): Answer<Channel> = call("GET", "catalog/channels/$slug")

    /**
     * The programme guide. The stretch asked for starts an hour ago, which is
     * what the server does by itself, so that a viewer who opens the guide can
     * see what is finishing as well as what is next.
     */
    suspend fun guide(hours: Int = 12): Answer<Guide> =
        call("GET", "catalog/guide", mapOf("hours" to hours.toString()))

    suspend fun playChannel(slug: String): Answer<LivePlayback> =
        call("POST", "catalog/channels/$slug/playback")

    // --- Signing in ------------------------------------------------------------

    suspend fun startDeviceCode(name: String, model: String?): Answer<DeviceCodeStart> = call(
        method = "POST",
        path = "viewer/device-codes",
        body = json.encodeToString(
            DeviceStart.serializer(),
            DeviceStart(DeviceDescription(name, "TV", "android-tv", model)),
        ),
        withToken = false,
    )

    suspend fun pollDeviceCode(deviceCode: String): Answer<DeviceCodePoll> = call(
        method = "POST",
        path = "viewer/device-codes/token",
        body = json.encodeToString(DeviceCodeBody.serializer(), DeviceCodeBody(deviceCode)),
        withToken = false,
    )

    suspend fun profiles(): Answer<ProfilesView> = call("GET", "viewer/profiles")

    /** Takes a profile into use on this device. A PIN is asked for where one is set. */
    suspend fun selectProfile(id: String, pin: String?): Answer<Profile> = call(
        method = "POST",
        path = "viewer/profiles/$id/select",
        body = json.encodeToString(SelectProfileBody.serializer(), SelectProfileBody(pin)),
    )

    // --- The list a viewer saves -------------------------------------------------

    suspend fun savedList(): Answer<ViewerList> = call("GET", "viewer/list")

    /** Only the ids, which is enough to mark the titles of a page. */
    suspend fun savedIds(): Answer<SavedIds> = call("GET", "viewer/list/ids")

    /** Puts a title on the list. Safe to repeat. */
    suspend fun save(slug: String): Answer<Unit> = call("PUT", "viewer/list/$slug")

    suspend fun unsave(slug: String): Answer<Unit> = call("DELETE", "viewer/list/$slug")

    // --- Watching ---------------------------------------------------------------

    /** The "Continue watching" row, as the website shows it. */
    suspend fun watching(): Answer<WatchingList> = call("GET", "viewer/watching")

    /** How far the viewer is in each video of one title. */
    suspend fun watchingTitle(slug: String): Answer<TitleWatchStates> =
        call("GET", "viewer/watching/titles/$slug")

    /**
     * Says where the viewer is. Seconds, because that is what the API counts
     * in, and reported for the title rather than the video id.
     */
    suspend fun reportPosition(
        titleSlug: String,
        episodeId: String?,
        positionSeconds: Double,
        durationSeconds: Double,
    ): Answer<Unit> = call(
        method = "PUT",
        path = "viewer/watching",
        body = json.encodeToString(
            SaveWatchPositions.serializer(),
            SaveWatchPositions(
                listOf(WatchPosition(titleSlug, episodeId, positionSeconds, durationSeconds)),
            ),
        ),
    )

    companion object {
        fun defaultHttp(): OkHttpClient = OkHttpClient.Builder()
            // A television on a slow line still has to give up eventually, or
            // a screen waits for ever with nothing to show.
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
}

/**
 * Whether an address could be a server at all, before anything is sent to it.
 *
 * Somebody typing this with a remote control leaves out the scheme, adds a
 * trailing slash, or stops halfway. A plain host is taken as https, because
 * that is what a service on the open internet is; anyone running one on their
 * own network without a certificate can still type http:// in full.
 */
fun serverAddressOf(raw: String): HttpUrl? {
    val trimmed = raw.trim().trimEnd('/')
    if (trimmed.isEmpty()) {
        return null
    }
    val withScheme = if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        trimmed
    } else {
        "https://$trimmed"
    }
    val url = withScheme.toHttpUrlOrNull() ?: return null
    // A host with no dot and no port is a word, not an address: somebody got
    // halfway through typing. "localhost" is the one exception worth making.
    val host = url.host
    val explicitPort = withScheme.substringAfter("://").contains(':')
    if (!host.contains('.') && host != "localhost" && !explicitPort) {
        return null
    }
    return url
}

@kotlinx.serialization.Serializable
private data class DeviceStart(val device: DeviceDescription)

@kotlinx.serialization.Serializable
private data class DeviceDescription(
    val name: String,
    val kind: String,
    val platform: String,
    val model: String?,
)

@kotlinx.serialization.Serializable
private data class DeviceCodeBody(val deviceCode: String)

@kotlinx.serialization.Serializable
private data class SelectProfileBody(val pin: String?)
