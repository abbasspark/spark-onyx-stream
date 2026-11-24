// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.sparksystem.onyx.tv.Container
import de.sparksystem.onyx.tv.data.Answer
import de.sparksystem.onyx.tv.data.TitleCard
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** How long typing stops before the server is asked. */
private const val SETTLE_MS = 400L
/** Fewer letters than this match too much to be worth a request. */
private const val ENOUGH = 2

data class SearchState(
    val text: String = "",
    val searching: Boolean = false,
    val results: List<TitleCard> = emptyList(),
    /** True once a search has run and found nothing. */
    val empty: Boolean = false,
    val trouble: String? = null,
)

/**
 * Searching from a remote control.
 *
 * Every letter is four or five presses away, so the app waits for the typing
 * to stop rather than asking on each one, and starts at two letters: one
 * matches half the catalog and tells a viewer nothing.
 */
class SearchModel(private val container: Container) : ViewModel() {

    private val state = MutableStateFlow(SearchState())
    val flow: StateFlow<SearchState> = state.asStateFlow()

    private var searching: Job? = null

    fun type(text: String) {
        state.update { it.copy(text = text) }
        searching?.cancel()
        if (text.trim().length < ENOUGH) {
            state.update { it.copy(searching = false, results = emptyList(), empty = false) }
            return
        }
        searching = viewModelScope.launch {
            delay(SETTLE_MS)
            state.update { it.copy(searching = true, trouble = null) }
            when (val answer = container.api.titles(q = text.trim(), pageSize = 40)) {
                is Answer.Ok -> state.update { current ->
                    // An answer to a search the viewer has since changed is
                    // of no use: they are typing something else by now.
                    if (current.text.trim() != text.trim()) {
                        current
                    } else {
                        current.copy(
                            searching = false,
                            results = answer.value.items,
                            empty = answer.value.items.isEmpty(),
                        )
                    }
                }
                is Answer.Refused -> state.update {
                    it.copy(searching = false, trouble = answer.message)
                }
                is Answer.Unreachable -> state.update {
                    it.copy(searching = false, trouble = "The service could not be reached.")
                }
                is Answer.TooOld -> state.update {
                    it.copy(searching = false, trouble = answer.message)
                }
            }
        }
    }

    fun clear() {
        searching?.cancel()
        state.value = SearchState()
    }

    override fun onCleared() {
        searching?.cancel()
        super.onCleared()
    }
}

data class SavedState(
    val loading: Boolean = true,
    val titles: List<TitleCard> = emptyList(),
    /** The slugs on the list, for marking a title page. */
    val slugs: Set<String> = emptySet(),
    val trouble: String? = null,
)

/**
 * The list a viewer saves. Kept apart from the catalog because it changes
 * from the title page as well as from its own screen, and both have to agree
 * at once.
 */
class SavedModel(private val container: Container) : ViewModel() {

    private val state = MutableStateFlow(SavedState())
    val flow: StateFlow<SavedState> = state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            state.update { it.copy(loading = it.titles.isEmpty(), trouble = null) }
            when (val answer = container.api.savedList()) {
                is Answer.Ok -> {
                    val titles = answer.value.items.map { it.title }
                    state.update {
                        it.copy(
                            loading = false,
                            titles = titles,
                            slugs = titles.map { title -> title.slug }.toSet(),
                        )
                    }
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

    fun has(slug: String): Boolean = state.value.slugs.contains(slug)

    /**
     * Puts a title on the list or takes it off. The screen is changed first
     * and put back if the server refuses: a list is the viewer's own, and it
     * should answer the moment they press.
     */
    fun toggle(title: TitleCard) {
        val had = has(title.slug)
        state.update { current ->
            current.copy(
                slugs = if (had) current.slugs - title.slug else current.slugs + title.slug,
                titles = if (had) {
                    current.titles.filterNot { it.slug == title.slug }
                } else {
                    listOf(title) + current.titles
                },
            )
        }
        viewModelScope.launch {
            val answer = if (had) {
                container.api.unsave(title.slug)
            } else {
                container.api.save(title.slug)
            }
            if (answer !is Answer.Ok) {
                // Put it back where it was, and say why.
                state.update { current ->
                    current.copy(
                        slugs = if (had) current.slugs + title.slug else current.slugs - title.slug,
                        trouble = when (answer) {
                            is Answer.Refused -> answer.message
                            is Answer.TooOld -> answer.message
                            else -> "The list could not be changed."
                        },
                    )
                }
                load()
            }
        }
    }
}
