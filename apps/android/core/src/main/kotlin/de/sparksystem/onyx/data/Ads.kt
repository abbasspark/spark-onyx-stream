// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.data

import kotlinx.serialization.Serializable

// Ads, as the API describes them and as the rules of the website's player
// apply them. The two players follow the same rules on purpose, so that a
// break comes at the same moment on a television and in a browser.

/** One place in a video where an ad plays. */
@Serializable
data class AdBreak(
    val id: String,
    /** "PRE", "MID" or "POST". */
    val position: String,
    /** Where a break in the middle comes, in milliseconds. */
    val atMs: Long? = null,
    val sourceId: String,
)

/** What the API tells a player about the ads of one video. */
@Serializable
data class AdPlan(val breaks: List<AdBreak> = emptyList())

/** The ad a break plays: the file, and everyone to tell about it. */
@Serializable
data class ResolvedAd(
    val mediaUrl: String,
    val mimeType: String = "",
    val durationMs: Long? = null,
    /** After how many milliseconds the ad may be skipped. Null: it cannot be. */
    val skipOffsetMs: Long? = null,
    val clickThrough: String? = null,
    val clickTracking: List<String> = emptyList(),
    val impressions: List<String> = emptyList(),
    /** Addresses to call when the ad fails, with [ERRORCODE] where the code goes. */
    val errors: List<String> = emptyList(),
    /** By event: start, firstQuartile, midpoint, thirdQuartile, complete, skip. */
    val tracking: Map<String, List<String>> = emptyMap(),
)

@Serializable
data class ResolvedAdAnswer(val ad: ResolvedAd? = null)

/** What our own server counts, per source. */
enum class AdEvent(val wire: String) {
    Impression("IMPRESSION"),
    FirstQuartile("FIRST_QUARTILE"),
    Midpoint("MIDPOINT"),
    ThirdQuartile("THIRD_QUARTILE"),
    Complete("COMPLETE"),
    Skip("SKIP"),
    Click("CLICK"),
    Error("ERROR"),
}

/** A jump in the video is not a break that was reached by watching. */
private const val NATURAL_STEP_MS = 2000L

/** The break of the given position that has not played yet. */
fun pendingBreak(plan: AdPlan?, position: String, played: Set<String>): AdBreak? =
    plan?.breaks?.firstOrNull { it.position == position && it.id !in played }

/**
 * The break in the middle that the video just reached. Only watching into it
 * counts: whoever seeks past a break, or starts further on, is not stopped
 * for it afterwards.
 */
fun reachedBreak(plan: AdPlan?, played: Set<String>, previousMs: Long, nowMs: Long): AdBreak? {
    if (plan == null || nowMs <= previousMs || nowMs - previousMs > NATURAL_STEP_MS) {
        return null
    }
    return plan.breaks.firstOrNull {
        val at = it.atMs
        it.position == "MID" && at != null && it.id !in played && at > previousMs && at <= nowMs
    }
}

/** A quartile of an ad that playing passed, with the event that tells of it. */
data class Quartile(val tracked: String, val counted: AdEvent)

private val QUARTILES = listOf(
    Triple("firstQuartile", 0.25, AdEvent.FirstQuartile),
    Triple("midpoint", 0.5, AdEvent.Midpoint),
    Triple("thirdQuartile", 0.75, AdEvent.ThirdQuartile),
)

/** The quartiles that playing from one moment to the next passed. */
fun quartilesCrossed(previousMs: Long, nowMs: Long, durationMs: Long): List<Quartile> {
    if (durationMs <= 0 || nowMs <= previousMs) {
        return emptyList()
    }
    return QUARTILES
        .filter { (_, share, _) -> previousMs < durationMs * share && nowMs >= durationMs * share }
        .map { (tracked, _, counted) -> Quartile(tracked, counted) }
}

/** Whether the viewer may skip now, and how many seconds are left until they may. */
data class SkipState(val skippable: Boolean, val secondsLeft: Int)

fun skipState(skipOffsetMs: Long?, elapsedMs: Long): SkipState {
    if (skipOffsetMs == null) {
        return SkipState(skippable = false, secondsLeft = 0)
    }
    val left = skipOffsetMs - elapsedMs
    return if (left <= 0) {
        SkipState(skippable = true, secondsLeft = 0)
    } else {
        SkipState(skippable = false, secondsLeft = ((left + 999) / 1000).toInt())
    }
}

private val ERROR_CODE = Regex("\\[ERRORCODE]|%5BERRORCODE%5D", RegexOption.IGNORE_CASE)
private val RANDOM = Regex("\\[(?:CACHEBUSTING|RANDOM)]|%5B(?:CACHEBUSTING|RANDOM)%5D", RegexOption.IGNORE_CASE)
private val TIMESTAMP = Regex("\\[TIMESTAMP]|%5BTIMESTAMP%5D", RegexOption.IGNORE_CASE)
private val ASSET_URI = Regex("\\[ASSETURI]|%5BASSETURI%5D", RegexOption.IGNORE_CASE)
private val PLAYHEAD = Regex("\\[CONTENTPLAYHEAD]|%5BCONTENTPLAYHEAD%5D", RegexOption.IGNORE_CASE)

/** Puts the code of what went wrong where an error address asks for it. */
fun fillErrorCode(url: String, code: Int): String = url.replace(ERROR_CODE, code.toString())

/** Fills the macros of an address that is called while the ad plays. */
fun fillPlayerMacros(
    url: String,
    positionMs: Long = 0,
    random: Long = (Math.random() * 1e10).toLong(),
    timestamp: String = java.time.Instant.now().toString(),
): String = url
    .replace(RANDOM, random.toString())
    .replace(TIMESTAMP, timestamp)
    .replace(ASSET_URI, "")
    .replace(PLAYHEAD, positionMs.toString())

@Serializable
internal data class AdSourceBody(val sourceId: String)

@Serializable
internal data class AdEventBody(val sourceId: String, val event: String)
