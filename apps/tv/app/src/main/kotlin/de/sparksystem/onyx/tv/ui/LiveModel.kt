// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import de.sparksystem.onyx.tv.Container
import de.sparksystem.onyx.tv.data.Answer
import de.sparksystem.onyx.tv.data.Channel
import de.sparksystem.onyx.tv.data.Guide
import de.sparksystem.onyx.tv.data.LivePlayback
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LiveState(
    val loading: Boolean = true,
    val trouble: String? = null,
    val channels: List<Channel> = emptyList(),
    /** The channel that is playing, or null while the lineup is only being shown. */
    val watching: Channel? = null,
    val playback: LivePlayback? = null,
    /** Why the channel cannot be watched, when it cannot. */
    val refusal: String? = null,
    /** Raised on every change of channel, so the banner shows again. */
    val bannerSignal: Int = 0,
    val guide: Guide? = null,
    val guideLoading: Boolean = false,
)

/**
 * The live side of the television: the lineup, what is playing, and the
 * guide.
 *
 * Addresses from the server are signed and expire, so one is asked for on
 * every change of channel and never kept. The lineup is asked for again
 * every few minutes, because "now" and "next" go stale while a viewer sits
 * there.
 */
class LiveModel(private val container: Container) : ViewModel() {

    private val state = MutableStateFlow(LiveState())
    val flow: StateFlow<LiveState> = state.asStateFlow()

    private var refreshing: Job? = null
    private var tuning: Job? = null

    /**
     * A moment of the world the viewer picked in the guide, waiting for the
     * player to be able to reach it. The player cannot work out where that
     * is until it knows how much of the channel it has, so the request is
     * left here and taken when it can be met.
     */
    private val goingBackTo = MutableStateFlow<Long?>(null)
    val goBackFlow: StateFlow<Long?> = goingBackTo.asStateFlow()

    init {
        loadChannels()
    }

    fun loadChannels() {
        viewModelScope.launch {
            state.update { it.copy(loading = it.channels.isEmpty(), trouble = null) }
            when (val answer = container.api.channels()) {
                is Answer.Ok -> {
                    // By number where the operator gave one, and by name after
                    // those: the order a viewer expects on a remote control.
                    val lineup = answer.value.sortedWith(
                        compareBy({ it.number ?: Int.MAX_VALUE }, { it.name }),
                    )
                    state.update { current ->
                        current.copy(
                            loading = false,
                            channels = lineup,
                            // The channel being watched keeps its own place in
                            // the list, with whatever the guide now says is on.
                            watching = current.watching?.let { watching ->
                                lineup.firstOrNull { it.slug == watching.slug } ?: watching
                            },
                        )
                    }
                    startRefreshing()
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

    /**
     * What is on now moves on without anybody pressing anything, so the
     * lineup is read again while the viewer is here. Three minutes is often
     * enough for a banner to be right and rare enough to cost nothing.
     */
    private fun startRefreshing() {
        if (refreshing?.isActive == true) {
            return
        }
        refreshing = viewModelScope.launch {
            while (true) {
                delay(180_000)
                val answer = container.api.channels()
                if (answer is Answer.Ok) {
                    val lineup = answer.value.sortedWith(
                        compareBy({ it.number ?: Int.MAX_VALUE }, { it.name }),
                    )
                    state.update { current ->
                        current.copy(
                            channels = lineup,
                            watching = current.watching?.let { watching ->
                                lineup.firstOrNull { it.slug == watching.slug } ?: watching
                            },
                        )
                    }
                }
            }
        }
    }

    // --- Tuning -------------------------------------------------------------

    /**
     * Go back to a moment of the world, on the channel being watched or on
     * another one. On another channel the request waits until the picture is
     * there to be moved.
     */
    fun goBackTo(channel: Channel, moment: Long) {
        if (channel.slug != state.value.watching?.slug) {
            tuneTo(channel)
        }
        goingBackTo.value = moment
    }

    fun wentBack() {
        goingBackTo.value = null
    }

    fun tuneTo(channel: Channel) {
        tuning?.cancel()
        // A change of channel forgets where the viewer was going: the moment
        // belongs to the channel it was picked on.
        goingBackTo.value = null
        val refusal = refusalOf(channel)
        state.update {
            it.copy(
                watching = channel,
                playback = null,
                refusal = refusal,
                bannerSignal = it.bannerSignal + 1,
            )
        }
        if (refusal != null) {
            return
        }
        tuning = viewModelScope.launch {
            when (val answer = container.api.playChannel(channel.slug)) {
                is Answer.Ok -> state.update { current ->
                    // A viewer who kept pressing while this was in flight is
                    // already somewhere else; the answer is then stale.
                    if (current.watching?.slug != channel.slug) {
                        current
                    } else {
                        current.copy(playback = answer.value, refusal = null)
                    }
                }
                is Answer.Refused -> state.update {
                    if (it.watching?.slug != channel.slug) it else it.copy(refusal = answer.message)
                }
                is Answer.Unreachable -> state.update {
                    if (it.watching?.slug != channel.slug) {
                        it
                    } else {
                        it.copy(refusal = "The service could not be reached.")
                    }
                }
                is Answer.TooOld -> state.update {
                    if (it.watching?.slug != channel.slug) it else it.copy(refusal = answer.message)
                }
            }
        }
    }

    /** The channel before or after, as the channel keys of a remote do it. */
    fun zap(step: Int) {
        val watching = state.value.watching ?: return
        neighbour(state.value.channels, watching.slug, step)?.let(::tuneTo)
    }

    fun tuneToNumber(number: Int): Boolean {
        val wanted = channelByNumber(state.value.channels, number) ?: return false
        tuneTo(wanted)
        return true
    }

    fun stopWatching() {
        tuning?.cancel()
        state.update { it.copy(watching = null, playback = null, refusal = null) }
    }

    // --- The guide ------------------------------------------------------------

    /** Asked for once and kept, because a guide is read for a minute, not an evening. */
    fun loadGuide() {
        if (state.value.guide != null || state.value.guideLoading) {
            return
        }
        viewModelScope.launch {
            state.update { it.copy(guideLoading = true) }
            val answer = container.api.guide(hours = 12)
            state.update {
                it.copy(
                    guideLoading = false,
                    guide = (answer as? Answer.Ok)?.value ?: it.guide,
                )
            }
        }
    }

    /** The programmes of the channel being watched, for the bar and the banner. */
    fun ownRow(): List<de.sparksystem.onyx.tv.data.Programme> {
        val slug = state.value.watching?.slug ?: return emptyList()
        return state.value.guide?.channels?.firstOrNull { it.slug == slug }?.programmes.orEmpty()
    }

    override fun onCleared() {
        refreshing?.cancel()
        tuning?.cancel()
        super.onCleared()
    }
}
