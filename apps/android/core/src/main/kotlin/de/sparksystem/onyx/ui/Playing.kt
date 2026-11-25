// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.sparksystem.onyx.Container
import de.sparksystem.onyx.data.Answer
import de.sparksystem.onyx.data.Marker
import de.sparksystem.onyx.data.Playback
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What is being watched, and where the addresses for it came from. */
data class PlayingState(
    val loading: Boolean = true,
    val trouble: String? = null,
    val playback: Playback? = null,
    val heading: String = "",
    val detail: String? = null,
    /** Where to start, in milliseconds. */
    val startAtMs: Long = 0,
    /** Decides when ads play in this video. Null while nothing is playing. */
    val ads: AdsDirector? = null,
)

/**
 * Getting a video ready, and saying afterwards how far it was watched.
 *
 * Addresses from the server are signed and expire, so they are asked for
 * when playing starts and never kept.
 */
class PlayingModel(private val container: Container) : ViewModel() {

    private val state = MutableStateFlow(PlayingState())
    val flow: StateFlow<PlayingState> = state.asStateFlow()

    /** What is being watched, for the reports sent while it plays. */
    private var titleSlug: String? = null
    private var episodeId: String? = null
    private var reporting: Job? = null

    /** The newest position, which the loop below sends. */
    @Volatile
    private var positionSeconds: Double = 0.0

    @Volatile
    private var durationSeconds: Double = 0.0

    fun play(
        titleSlug: String,
        episodeId: String?,
        heading: String,
        detail: String?,
        startAtSeconds: Double,
    ) {
        this.titleSlug = titleSlug
        this.episodeId = episodeId
        positionSeconds = startAtSeconds
        durationSeconds = 0.0
        state.value = PlayingState(
            loading = true,
            heading = heading,
            detail = detail,
            startAtMs = (startAtSeconds * 1000).toLong(),
        )
        viewModelScope.launch {
            val answer = if (episodeId != null) {
                container.api.playEpisode(episodeId)
            } else {
                container.api.playTitle(titleSlug)
            }
            when (answer) {
                is Answer.Ok -> {
                    state.update {
                        it.copy(
                            loading = false,
                            playback = answer.value,
                            ads = AdsDirector(answer.value.ads, container.api, viewModelScope),
                        )
                    }
                    startReporting()
                }
                is Answer.Refused -> state.update {
                    it.copy(loading = false, trouble = answer.message)
                }
                is Answer.Unreachable -> state.update {
                    it.copy(loading = false, trouble = "The service could not be reached.")
                }
                is Answer.TooOld -> state.update {
                    it.copy(loading = false, trouble = answer.message)
                }
            }
        }
    }

    /** The player says where it is; the loop below decides when to tell the server. */
    fun at(positionMs: Long, durationMs: Long) {
        positionSeconds = positionMs / 1000.0
        if (durationMs > 0) {
            durationSeconds = durationMs / 1000.0
        }
    }

    /**
     * Says where the viewer is, every half minute and once at the end.
     *
     * Often enough that a television pulled from the wall loses little, and
     * rarely enough that an evening of watching is a handful of requests.
     */
    private fun startReporting() {
        reporting?.cancel()
        reporting = viewModelScope.launch {
            while (true) {
                delay(30_000)
                report()
            }
        }
    }

    private suspend fun report() {
        val slug = titleSlug ?: return
        if (durationSeconds <= 0 || positionSeconds <= 0) {
            return
        }
        container.api.reportPosition(slug, episodeId, positionSeconds, durationSeconds)
    }

    /** Leaving the player: the last position is worth more than the next tick. */
    fun stop() {
        reporting?.cancel()
        reporting = null
        viewModelScope.launch { report() }
        titleSlug = null
        episodeId = null
        state.value = PlayingState(loading = false)
    }

    override fun onCleared() {
        reporting?.cancel()
        super.onCleared()
    }
}

/**
 * The stretch of a video that is running, while skipping it still saves
 * something. The same rule the website follows, so that the two players
 * offer the skip at the same moments.
 */
fun runningMarker(markers: List<Marker>, positionMs: Long, durationMs: Long): Marker? {
    if (durationMs <= 0) {
        return null
    }
    return markers.firstOrNull { marker ->
        val end = marker.endMs ?: durationMs
        positionMs >= marker.startMs && positionMs < end - 2000
    }
}

/** Where a marked stretch ends. Credits without an end run to the end of the video. */
fun endOf(marker: Marker, durationMs: Long): Long =
    marker.endMs?.coerceAtMost(durationMs) ?: durationMs

/** What the button over the picture says. */
fun skipLabel(kind: String): String = when (kind) {
    "RECAP" -> "Skip recap"
    "INTRO" -> "Skip intro"
    else -> "Skip credits"
}
