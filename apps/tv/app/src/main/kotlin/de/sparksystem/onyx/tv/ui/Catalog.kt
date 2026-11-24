// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.sparksystem.onyx.tv.Container
import de.sparksystem.onyx.tv.data.Answer
import de.sparksystem.onyx.tv.data.Home
import de.sparksystem.onyx.tv.data.HomeRow
import de.sparksystem.onyx.tv.data.TitleCard
import de.sparksystem.onyx.tv.data.TitleDetail
import de.sparksystem.onyx.tv.data.WatchingItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CatalogState(
    val loading: Boolean = true,
    val trouble: String? = null,
    val hero: List<TitleCard> = emptyList(),
    val rows: List<HomeRow> = emptyList(),
    val watching: List<WatchingItem> = emptyList(),
)

data class TitleState(
    val loading: Boolean = true,
    val trouble: String? = null,
    val detail: TitleDetail? = null,
    /** Seconds into the video the viewer is, by the id of the video. */
    val positions: Map<String, Double> = emptyMap(),
    /** Which videos have been watched to the end. */
    val finished: Set<String> = emptySet(),
)

/**
 * The catalog as the television shows it: the home page, and a title when
 * one is opened.
 *
 * Both are kept here rather than in a model per screen, because the
 * television only ever shows one of them and because going back to the home
 * page should not fetch it again.
 */
class CatalogModel(private val container: Container) : ViewModel() {

    private val home = MutableStateFlow(CatalogState())
    val homeFlow: StateFlow<CatalogState> = home.asStateFlow()

    private val title = MutableStateFlow(TitleState())
    val titleFlow: StateFlow<TitleState> = title.asStateFlow()

    /** Raised when the token stopped working, so the app can sign in again. */
    private val signedOut = MutableStateFlow(false)
    val signedOutFlow: StateFlow<Boolean> = signedOut.asStateFlow()

    init {
        loadHome()
    }

    fun loadHome() {
        viewModelScope.launch {
            home.update { it.copy(loading = true, trouble = null) }
            when (val answer = container.api.home()) {
                is Answer.Ok -> {
                    val page: Home = answer.value
                    home.update {
                        it.copy(
                            loading = false,
                            hero = page.hero?.titles.orEmpty(),
                            // Rows the server leaves for the client to fill —
                            // "continue", "my list" — are dropped unless this
                            // app has something to put in them.
                            rows = page.rows.filter { row ->
                                row.kind == "titles" && row.titles.isNotEmpty()
                            },
                        )
                    }
                    loadWatching()
                }
                is Answer.Refused -> {
                    if (answer.status == 401) {
                        signedOut.value = true
                    }
                    home.update { it.copy(loading = false, trouble = answer.message) }
                }
                is Answer.Unreachable -> home.update {
                    it.copy(loading = false, trouble = "The service could not be reached.")
                }
                is Answer.TooOld -> home.update { it.copy(loading = false, trouble = answer.message) }
            }
        }
    }

    private suspend fun loadWatching() {
        val answer = container.api.watching()
        if (answer is Answer.Ok) {
            home.update { it.copy(watching = answer.value.items.filter { item -> item.duration > 0 }) }
        }
    }

    fun openTitle(slug: String) {
        viewModelScope.launch {
            title.value = TitleState(loading = true)
            when (val answer = container.api.title(slug)) {
                is Answer.Ok -> {
                    title.update { it.copy(loading = false, detail = answer.value) }
                    loadPositions(slug)
                }
                is Answer.Refused -> {
                    if (answer.status == 401) {
                        signedOut.value = true
                    }
                    title.update { it.copy(loading = false, trouble = answer.message) }
                }
                is Answer.Unreachable -> title.update {
                    it.copy(loading = false, trouble = "The service could not be reached.")
                }
                is Answer.TooOld -> title.update { it.copy(loading = false, trouble = answer.message) }
            }
        }
    }

    private suspend fun loadPositions(slug: String) {
        val answer = container.api.watchingTitle(slug)
        if (answer is Answer.Ok) {
            title.update { current ->
                current.copy(
                    positions = answer.value.items.associate { it.id to it.position },
                    finished = answer.value.items.filter { it.completed }.map { it.id }.toSet(),
                )
            }
        }
    }

    fun forgetTitle() {
        title.value = TitleState(loading = false)
    }

    /**
     * Where watching a title should start, and which video.
     *
     * A movie resumes where it was left. A series goes on with the episode
     * that was being watched, or with the first one that has not been
     * finished, or with the very first.
     */
    fun whatToPlay(state: TitleState): WhatToPlay? {
        val detail = state.detail ?: return null
        if (!detail.isSeries) {
            val position = state.positions[detail.id] ?: 0.0
            return WhatToPlay(
                episodeId = null,
                label = if (position > 30) "Resume" else "Play",
                positionSeconds = position,
                heading = detail.name,
                detail = null,
            )
        }
        val episodes = detail.seasons.sortedBy { it.number }.flatMap { season ->
            season.episodes.sortedBy { it.number }.map { season.number to it }
        }
        val started = episodes.firstOrNull { (_, episode) ->
            val position = state.positions[episode.id] ?: 0.0
            position > 30 && !state.finished.contains(episode.id)
        }
        val next = started
            ?: episodes.firstOrNull { (_, episode) -> !state.finished.contains(episode.id) }
            ?: episodes.firstOrNull()
            ?: return null
        val (seasonNumber, episode) = next
        val position = state.positions[episode.id] ?: 0.0
        return WhatToPlay(
            episodeId = episode.id,
            label = if (position > 30) "Resume" else if (started != null) "Continue" else "Play",
            positionSeconds = position,
            heading = detail.name,
            detail = "S$seasonNumber E${episode.number}  ${episode.name}",
        )
    }
}

data class WhatToPlay(
    val episodeId: String?,
    val label: String,
    val positionSeconds: Double,
    val heading: String,
    val detail: String?,
)
