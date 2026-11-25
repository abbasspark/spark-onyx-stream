// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.data

/** Where an ad run sends what it has to say. Calls must not block. */
interface AdReporter {
    /** Tells an address of an ad server that something happened. */
    fun ping(address: String)

    /** Counts something at our own server. */
    fun count(sourceId: String, event: AdEvent)
}

/** Why an ad could not be played. The numbers are the codes VAST gives for them. */
enum class AdFailure(val code: Int) {
    /** The file could not be played. */
    Media(405),

    /** The file did not start in time. */
    Timeout(402),
}

/**
 * One ad that is playing, from its first frame to its end.
 *
 * It does not play anything. The screen reports what the player does, and this
 * says to the ad server and to our own server what that means: started,
 * a quarter, half, three quarters, finished, skipped, clicked or failed. Each
 * is said once, and nothing is said after the ad is over.
 */
class AdRun(
    private val ad: ResolvedAd,
    private val sourceId: String,
    private val reporter: AdReporter,
) {
    private var started = false
    private var over = false
    private var lastMs = 0L
    private var lengthMs = 0L

    /** Whether the first frame has been shown. */
    val hasStarted: Boolean get() = started

    /** Whether the ad has finished, been skipped or failed. */
    val finished: Boolean get() = over

    private fun tell(event: String, positionMs: Long, extra: List<String> = emptyList()) {
        for (address in (ad.tracking[event].orEmpty() + extra)) {
            reporter.ping(fillPlayerMacros(address, positionMs))
        }
    }

    /** The first frame is on the screen. */
    fun begin(durationMs: Long) {
        if (started || over) {
            return
        }
        started = true
        lengthMs = if (durationMs > 0) durationMs else ad.durationMs ?: 0L
        tell("start", 0, ad.impressions)
        reporter.count(sourceId, AdEvent.Impression)
    }

    /** The player is at this moment of the ad. */
    fun progress(positionMs: Long, durationMs: Long = lengthMs) {
        if (!started || over) {
            return
        }
        if (durationMs > 0) {
            lengthMs = durationMs
        }
        for (quartile in quartilesCrossed(lastMs, positionMs, lengthMs)) {
            tell(quartile.tracked, positionMs)
            reporter.count(sourceId, quartile.counted)
        }
        lastMs = positionMs
    }

    /** The ad played to its end. */
    fun complete() {
        if (!started || over) {
            return
        }
        // A player that jumps from the last tick to the end has still passed the quartiles.
        progress(lengthMs.coerceAtLeast(lastMs))
        over = true
        tell("complete", lastMs)
        reporter.count(sourceId, AdEvent.Complete)
    }

    /** The viewer skipped. It only counts once the ad allows it. */
    fun skip(elapsedMs: Long): Boolean {
        if (!started || over || !skipState(ad.skipOffsetMs, elapsedMs).skippable) {
            return false
        }
        over = true
        tell("skip", elapsedMs)
        reporter.count(sourceId, AdEvent.Skip)
        return true
    }

    /** The viewer opened the advertiser's page. The ad goes on playing. */
    fun click(elapsedMs: Long) {
        if (!started || over || ad.clickThrough == null) {
            return
        }
        for (address in ad.clickTracking) {
            reporter.ping(fillPlayerMacros(address, elapsedMs))
        }
        reporter.count(sourceId, AdEvent.Click)
    }

    /** The ad could not be played. The film goes on without it. */
    fun fail(reason: AdFailure) {
        if (over) {
            return
        }
        over = true
        for (address in ad.errors) {
            reporter.ping(fillErrorCode(fillPlayerMacros(address, lastMs), reason.code))
        }
        reporter.count(sourceId, AdEvent.Error)
    }
}
