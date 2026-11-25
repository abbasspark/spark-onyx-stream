// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx

import de.sparksystem.onyx.data.AdBreak
import de.sparksystem.onyx.data.AdEvent
import de.sparksystem.onyx.data.AdFailure
import de.sparksystem.onyx.data.AdPlan
import de.sparksystem.onyx.data.AdReporter
import de.sparksystem.onyx.data.AdRun
import de.sparksystem.onyx.data.ResolvedAd
import de.sparksystem.onyx.data.fillErrorCode
import de.sparksystem.onyx.data.fillPlayerMacros
import de.sparksystem.onyx.data.pendingBreak
import de.sparksystem.onyx.data.quartilesCrossed
import de.sparksystem.onyx.data.reachedBreak
import de.sparksystem.onyx.data.skipState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private val pre = AdBreak("pre", "PRE", null, "s1")
private val mid = AdBreak("mid", "MID", 600_000, "s1")
private val post = AdBreak("post", "POST", null, "s2")
private val plan = AdPlan(listOf(pre, mid, post))

class BreaksTest {
    @Test
    fun `finds the break of a position that has not played`() {
        assertEquals(pre, pendingBreak(plan, "PRE", emptySet()))
        assertNull(pendingBreak(plan, "PRE", setOf("pre")))
        assertEquals(post, pendingBreak(plan, "POST", setOf("pre")))
        assertNull(pendingBreak(null, "PRE", emptySet()))
    }

    @Test
    fun `a break in the middle comes when playing reaches it`() {
        assertEquals(mid, reachedBreak(plan, emptySet(), 599_500, 600_100))
        assertNull(reachedBreak(plan, emptySet(), 590_000, 590_500))
        assertNull(reachedBreak(plan, setOf("mid"), 599_500, 600_100))
    }

    @Test
    fun `a jump over a break does not set it off`() {
        assertNull(reachedBreak(plan, emptySet(), 100_000, 700_000))
        assertNull(reachedBreak(plan, emptySet(), 700_000, 600_100))
    }
}

class QuartilesTest {
    @Test
    fun `each quartile is passed once`() {
        assertEquals(
            listOf("firstQuartile"),
            quartilesCrossed(9_000, 11_000, 40_000).map { it.tracked },
        )
        assertEquals(
            listOf("firstQuartile", "midpoint", "thirdQuartile"),
            quartilesCrossed(0, 40_000, 40_000).map { it.tracked },
        )
        assertTrue(quartilesCrossed(11_000, 12_000, 40_000).isEmpty())
        assertTrue(quartilesCrossed(0, 5_000, 0).isEmpty())
    }
}

class SkipStateTest {
    @Test
    fun `counts down and then allows it`() {
        assertEquals(5, skipState(5_000, 0).secondsLeft)
        assertEquals(1, skipState(5_000, 4_100).secondsLeft)
        assertTrue(skipState(5_000, 5_000).skippable)
        assertFalse(skipState(null, 99_000).skippable)
    }
}

class MacrosTest {
    @Test
    fun `fills what a player knows`() {
        assertEquals(
            "https://a.example/t?r=42&p=1500&a=",
            fillPlayerMacros(
                "https://a.example/t?r=[CACHEBUSTING]&p=[CONTENTPLAYHEAD]&a=[ASSETURI]",
                positionMs = 1500,
                random = 42,
            ),
        )
        assertEquals("https://a.example/e?c=405", fillErrorCode("https://a.example/e?c=[ERRORCODE]", 405))
        assertEquals("https://a.example/e?c=405", fillErrorCode("https://a.example/e?c=%5BERRORCODE%5D", 405))
    }
}

private class Recorder : AdReporter {
    val pings = mutableListOf<String>()
    val counts = mutableListOf<AdEvent>()
    override fun ping(address: String) {
        pings += address
    }
    override fun count(sourceId: String, event: AdEvent) {
        counts += event
    }
}

private fun ad(skipAfter: Long? = 5_000, click: String? = "https://sponsor.example") = ResolvedAd(
    mediaUrl = "https://cdn.example/ad.mp4",
    mimeType = "video/mp4",
    durationMs = 40_000,
    skipOffsetMs = skipAfter,
    clickThrough = click,
    clickTracking = listOf("https://t.example/click"),
    impressions = listOf("https://t.example/imp"),
    errors = listOf("https://t.example/err?c=[ERRORCODE]"),
    tracking = mapOf(
        "start" to listOf("https://t.example/start"),
        "firstQuartile" to listOf("https://t.example/q1"),
        "complete" to listOf("https://t.example/done"),
        "skip" to listOf("https://t.example/skip"),
    ),
)

class AdRunTest {
    @Test
    fun `tells of the start, the quartiles and the end, each once`() {
        val recorder = Recorder()
        val run = AdRun(ad(), "s1", recorder)
        run.begin(40_000)
        run.begin(40_000)
        run.progress(10_500)
        run.progress(10_900)
        run.complete()
        run.complete()
        assertEquals(
            listOf(
                AdEvent.Impression,
                AdEvent.FirstQuartile,
                AdEvent.Midpoint,
                AdEvent.ThirdQuartile,
                AdEvent.Complete,
            ),
            recorder.counts,
        )
        assertEquals(1, recorder.pings.count { it.endsWith("/imp") })
        assertEquals(1, recorder.pings.count { it.endsWith("/done") })
        assertTrue(run.finished)
    }

    @Test
    fun `says nothing before the start`() {
        val recorder = Recorder()
        val run = AdRun(ad(), "s1", recorder)
        run.progress(10_000)
        run.complete()
        assertTrue(recorder.counts.isEmpty())
    }

    @Test
    fun `a skip counts only when the ad allows it`() {
        val recorder = Recorder()
        val run = AdRun(ad(skipAfter = 5_000), "s1", recorder)
        run.begin(40_000)
        assertFalse(run.skip(2_000))
        assertTrue(run.skip(5_500))
        assertEquals(listOf(AdEvent.Impression, AdEvent.Skip), recorder.counts)
        assertTrue(recorder.pings.contains("https://t.example/skip"))
        // Nothing is said after the ad is over.
        run.complete()
        assertEquals(2, recorder.counts.size)
    }

    @Test
    fun `an ad that cannot be skipped refuses`() {
        val run = AdRun(ad(skipAfter = null), "s1", Recorder())
        run.begin(40_000)
        assertFalse(run.skip(99_000))
    }

    @Test
    fun `a click is counted and the ad goes on`() {
        val recorder = Recorder()
        val run = AdRun(ad(), "s1", recorder)
        run.begin(40_000)
        run.click(3_000)
        assertTrue(AdEvent.Click in recorder.counts)
        assertTrue(recorder.pings.contains("https://t.example/click"))
        assertFalse(run.finished)
    }

    @Test
    fun `a click on an ad without a link is ignored`() {
        val recorder = Recorder()
        val run = AdRun(ad(click = null), "s1", recorder)
        run.begin(40_000)
        run.click(3_000)
        assertFalse(AdEvent.Click in recorder.counts)
    }

    @Test
    fun `a failure reports its code`() {
        val recorder = Recorder()
        val run = AdRun(ad(), "s1", recorder)
        run.fail(AdFailure.Media)
        assertEquals(listOf(AdEvent.Error), recorder.counts)
        assertEquals(listOf("https://t.example/err?c=405"), recorder.pings)
        run.fail(AdFailure.Timeout)
        assertEquals(1, recorder.counts.size)
    }
}
