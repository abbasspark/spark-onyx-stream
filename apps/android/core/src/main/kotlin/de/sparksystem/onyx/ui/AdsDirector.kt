// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.ui

import de.sparksystem.onyx.data.AdBreak
import de.sparksystem.onyx.data.AdEvent
import de.sparksystem.onyx.data.AdPlan
import de.sparksystem.onyx.data.AdReporter
import de.sparksystem.onyx.data.AdRun
import de.sparksystem.onyx.data.ApiClient
import de.sparksystem.onyx.data.ResolvedAd
import de.sparksystem.onyx.data.pendingBreak
import de.sparksystem.onyx.data.reachedBreak
import de.sparksystem.onyx.data.valueOrNull
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** How long a break waits for its ad before the film goes on, in milliseconds. */
const val RESOLVE_TIMEOUT_MS = 6000L

/** An ad that is ready to play, and the run that tells of it. */
class ReadyAd(val ad: ResolvedAd, val run: AdRun)

/**
 * Decides when ads play in one video, and hands the screen the ad to play.
 *
 * It does not touch the player: the television and the phone each play the ad
 * their own way. It remembers which breaks have played, so that a break never
 * comes twice in one viewing.
 */
class AdsDirector(
    private val plan: AdPlan?,
    private val api: ApiClient,
    private val scope: CoroutineScope,
) {
    private val played = mutableSetOf<String>()
    private var previousMs = 0L

    private val reporter = object : AdReporter {
        override fun ping(address: String) {
            scope.launch { api.ping(address) }
        }

        override fun count(sourceId: String, event: AdEvent) {
            scope.launch { api.countAd(sourceId, event) }
        }
    }

    /** Whether this video has any breaks at all. */
    val hasBreaks: Boolean get() = plan?.breaks?.isNotEmpty() == true

    /** The ad to play before the video starts, if there is one. */
    suspend fun before(): ReadyAd? = ready(pendingBreak(plan, "PRE", played))

    /** The ad to play after the video ended, if there is one. */
    suspend fun after(): ReadyAd? = ready(pendingBreak(plan, "POST", played))

    /**
     * Called as the video plays. Gives the break that playing just reached, or null.
     * The break counts as played from here on, whether or not an ad comes.
     */
    fun reached(positionMs: Long): AdBreak? {
        val found = reachedBreak(plan, played, previousMs, positionMs)
        previousMs = positionMs
        found?.let { played += it.id }
        return found
    }

    /** Where the video starts, so that a start in the middle does not set off a break. */
    fun startedAt(positionMs: Long) {
        previousMs = positionMs
    }

    /** The ad of a break in the middle that [reached] gave. */
    suspend fun resolve(found: AdBreak): ReadyAd? = fetch(found)

    private suspend fun ready(found: AdBreak?): ReadyAd? {
        if (found == null) {
            return null
        }
        played += found.id
        return fetch(found)
    }

    private suspend fun fetch(found: AdBreak): ReadyAd? {
        val ad = withTimeoutOrNull(RESOLVE_TIMEOUT_MS) {
            api.resolveAd(found.sourceId).valueOrNull()?.ad
        } ?: return null
        return ReadyAd(ad, AdRun(ad, found.sourceId, reporter))
    }
}
