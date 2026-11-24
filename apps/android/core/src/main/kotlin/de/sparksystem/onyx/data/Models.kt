// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// What the viewer API answers, as far as a television needs it.
//
// Every field the server may leave out has a default here, so that an app
// built against one version of the API keeps working against an older or a
// newer one. That is the same promise the website makes, and it matters more
// here: a television is updated when its owner gets round to it.

@Serializable
data class ApiMeta(
    val name: String = "",
    val client: ClientState? = null,
)

@Serializable
data class ClientState(
    val app: String = "",
    val version: String = "",
    val supported: Boolean = true,
    val refusal: ClientRefusal? = null,
)

@Serializable
data class ClientRefusal(
    val message: String? = null,
    val updateUrl: String? = null,
)

@Serializable
data class CatalogImage(
    val url: String,
    val width: Int = 0,
    val height: Int = 0,
)

@Serializable
data class CategoryRef(val slug: String, val name: String)

@Serializable
data class GenreRef(val slug: String, val name: String)

@Serializable
data class TitleCard(
    val id: String,
    val type: String = "MOVIE",
    val slug: String,
    val name: String,
    val tagline: String? = null,
    val releaseYear: Int? = null,
    val ageRating: String? = null,
    val access: String = "FREE",
    val poster: CatalogImage? = null,
    val backdrop: CatalogImage? = null,
    val logo: CatalogImage? = null,
    val categories: List<CategoryRef> = emptyList(),
    val durationMs: Long? = null,
    val seasonCount: Int = 0,
    val episodeCount: Int = 0,
) {
    val isSeries: Boolean get() = type == "SERIES"
}

@Serializable
data class Episode(
    val id: String,
    val number: Int,
    val name: String,
    val synopsis: String? = null,
    val still: CatalogImage? = null,
    val durationMs: Long? = null,
)

@Serializable
data class Season(
    val number: Int,
    val name: String? = null,
    val synopsis: String? = null,
    val episodes: List<Episode> = emptyList(),
)

@Serializable
data class Credit(
    val slug: String,
    val name: String,
    val role: String? = null,
)

@Serializable
data class TitleDetail(
    val id: String,
    val type: String = "MOVIE",
    val slug: String,
    val name: String,
    val tagline: String? = null,
    val synopsis: String? = null,
    val releaseYear: Int? = null,
    val ageRating: String? = null,
    val access: String = "FREE",
    val poster: CatalogImage? = null,
    val backdrop: CatalogImage? = null,
    val logo: CatalogImage? = null,
    val categories: List<CategoryRef> = emptyList(),
    val genres: List<GenreRef> = emptyList(),
    val durationMs: Long? = null,
    val runtimeMinutes: Int? = null,
    val rating: Double? = null,
    val hasTrailer: Boolean = false,
    val cast: List<Credit> = emptyList(),
    val seasons: List<Season> = emptyList(),
) {
    val isSeries: Boolean get() = type == "SERIES"
}

@Serializable
data class HomeRow(
    val key: String,
    val name: String,
    val kind: String = "titles",
    val layout: String = "poster",
    val category: CategoryRef? = null,
    val browse: String? = null,
    val titles: List<TitleCard> = emptyList(),
)

@Serializable
data class Hero(val titles: List<TitleCard> = emptyList())

@Serializable
data class Home(
    val hero: Hero? = null,
    val rows: List<HomeRow> = emptyList(),
)

@Serializable
data class Paged<T>(
    val items: List<T> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 0,
)

@Serializable
data class Marker(
    val kind: String,
    val startMs: Long,
    val endMs: Long? = null,
)

@Serializable
data class AudioTrack(
    val language: String,
    val label: String? = null,
    val isDefault: Boolean = false,
)

@Serializable
data class SubtitleTrack(
    val language: String,
    val label: String? = null,
    val isForced: Boolean = false,
)

@Serializable
data class StreamTicket(
    val id: String? = null,
    @SerialName("heartbeatSeconds") val heartbeatSeconds: Int = 0,
)

@Serializable
data class Playback(
    val protocol: String = "hls",
    val manifestUrl: String,
    val posterUrl: String? = null,
    val expiresAt: String? = null,
    val playId: String? = null,
    val qualityId: String? = null,
    val stream: StreamTicket? = null,
    val audio: List<AudioTrack> = emptyList(),
    val subtitles: List<SubtitleTrack> = emptyList(),
    val markers: List<Marker> = emptyList(),
)

// --- Signing in ------------------------------------------------------------

@Serializable
data class DeviceCodeStart(
    val deviceCode: String,
    val userCode: String,
    val verificationUrl: String,
    val verificationUrlComplete: String = "",
    val expiresIn: Int = 600,
    val interval: Int = 5,
)

@Serializable
data class Profile(
    val id: String,
    val name: String,
    val color: String? = null,
    val isKids: Boolean = false,
    val hasPin: Boolean = false,
    val audioLanguage: String? = null,
    val subtitleLanguage: String? = null,
)

@Serializable
data class Viewer(
    val id: String,
    val email: String = "",
    val name: String? = null,
)

/** What comes back from signing in with an email address and a password. */
@Serializable
data class SignIn(
    val viewer: Viewer? = null,
    val profile: Profile? = null,
    val token: String = "",
    val expiresAt: String? = null,
    /** A profile has to be chosen first: the main one has a PIN. */
    val chooseProfile: Boolean = false,
)

@Serializable
data class DeviceCodePoll(
    val status: String,
    val token: String? = null,
    val viewer: Viewer? = null,
    val profile: Profile? = null,
    val chooseProfile: Boolean = false,
)

// --- Watching --------------------------------------------------------------

@Serializable
data class TitleRef(val slug: String, val name: String, val type: String = "MOVIE")

@Serializable
data class EpisodeRef(
    val id: String,
    val number: Int = 0,
    val name: String = "",
    val seasonNumber: Int = 0,
)

/** One row of "Continue watching". Seconds, not milliseconds, as the API counts. */
@Serializable
data class WatchingItem(
    val id: String,
    val title: TitleRef,
    val episode: EpisodeRef? = null,
    val image: CatalogImage? = null,
    val position: Double = 0.0,
    val duration: Double = 0.0,
)

@Serializable
data class WatchingList(val items: List<WatchingItem> = emptyList())

/** How far the viewer is in one video of a title. */
@Serializable
data class TitleWatchState(
    val id: String,
    val position: Double = 0.0,
    val duration: Double = 0.0,
    val completed: Boolean = false,
)

@Serializable
data class TitleWatchStates(val items: List<TitleWatchState> = emptyList())

/** What the app reports: a slug, maybe an episode, and seconds. */
@Serializable
data class WatchPosition(
    val title: String,
    val episodeId: String? = null,
    val position: Double,
    val duration: Double,
)

@Serializable
data class SaveWatchPositions(val items: List<WatchPosition>)

// --- Profiles and the site ---------------------------------------------------

@Serializable
data class ProfilesView(
    val profiles: List<Profile> = emptyList(),
    val currentId: String = "",
    val limit: Int = 5,
)

@Serializable
data class SiteLogo(val url: String, val width: Int = 0, val height: Int = 0)

@Serializable
data class SiteAccent(val color: String, val deep: String)

/** The name, logo and colour of the installation, which the app wears. */
@Serializable
data class PublicSite(
    val name: String = "",
    val description: String = "",
    val logo: SiteLogo? = null,
    val logoShowsName: Boolean = true,
    val accent: SiteAccent? = null,
)

/** What the server answers when it refuses, which the app shows as it is. */
@Serializable
data class ApiError(
    val statusCode: Int = 0,
    val message: String = "",
    val code: String? = null,
)

// --- The list a viewer saves -------------------------------------------------

@Serializable
data class ListItem(val title: TitleCard, val addedAt: String? = null)

@Serializable
data class ViewerList(
    val items: List<ListItem> = emptyList(),
    /** How many more titles the list takes. */
    val room: Int = 0,
)

@Serializable
data class SavedIds(val ids: List<String> = emptyList())

// --- Live channels -----------------------------------------------------------

@Serializable
data class Programme(
    val title: String,
    val subtitle: String? = null,
    val description: String? = null,
    val category: String? = null,
    val startsAt: String,
    val endsAt: String,
)

@Serializable
data class Channel(
    val slug: String,
    val name: String,
    val number: Int? = null,
    val description: String? = null,
    val access: String = "FREE",
    val minAge: Int? = null,
    val packageIds: List<String> = emptyList(),
    /** Whether the channel is sending right now. */
    val onAir: Boolean = false,
    /** Minutes a viewer can go back. 0 means only the present. */
    val dvrMinutes: Int = 0,
    val now: Programme? = null,
    val next: Programme? = null,
) {
    val keeps: Boolean get() = dvrMinutes > 0
}

@Serializable
data class GuideRow(val slug: String, val programmes: List<Programme> = emptyList())

@Serializable
data class Guide(
    val from: String,
    val to: String,
    val channels: List<GuideRow> = emptyList(),
)

/**
 * A live channel ready to play. The address is called `url` here, not
 * `manifestUrl`: live and recordings are two endpoints and they do not agree
 * on the name.
 */
@Serializable
data class LivePlayback(
    val protocol: String = "hls",
    val url: String,
    val expiresAt: String? = null,
    val qualityId: String? = null,
    val stream: StreamTicket? = null,
)
