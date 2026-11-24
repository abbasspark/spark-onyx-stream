// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv

import de.sparksystem.onyx.tv.data.Marker
import de.sparksystem.onyx.tv.ui.endOf
import de.sparksystem.onyx.tv.ui.runningMarker
import de.sparksystem.onyx.tv.ui.screens.clock
import de.sparksystem.onyx.tv.ui.skipLabel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RunningMarkerTest {
    private val recap = Marker("RECAP", 0, 55_000)
    private val intro = Marker("INTRO", 60_000, 120_000)
    private val credits = Marker("CREDITS", 3_400_000, null)
    private val all = listOf(recap, intro, credits)
    private val length = 3_600_000L

    @Test
    fun `nothing is running between the marked stretches`() {
        assertNull(runningMarker(all, 600_000, length))
    }

    @Test
    fun `names the stretch a moment falls in`() {
        assertEquals(intro, runningMarker(all, 90_000, length))
        assertEquals(credits, runningMarker(all, 3_500_000, length))
    }

    @Test
    fun `offers nothing in the last moments of a stretch`() {
        // Skipping a second and a half is not worth a button.
        assertNull(runningMarker(all, 119_000, length))
    }

    @Test
    fun `offers nothing without a length to measure against`() {
        assertNull(runningMarker(all, 90_000, 0))
    }
}

class EndOfTest {
    @Test
    fun `a stretch ends where it says`() {
        assertEquals(120_000, endOf(Marker("INTRO", 60_000, 120_000), 3_600_000))
    }

    @Test
    fun `credits without an end run to the end of the video`() {
        assertEquals(3_600_000, endOf(Marker("CREDITS", 3_400_000, null), 3_600_000))
    }

    @Test
    fun `a stretch never ends after the video does`() {
        assertEquals(3_600_000, endOf(Marker("CREDITS", 3_000_000, 9_000_000), 3_600_000))
    }
}

class SkipLabelTest {
    @Test
    fun `each stretch is named as a viewer would name it`() {
        assertEquals("Skip recap", skipLabel("RECAP"))
        assertEquals("Skip intro", skipLabel("INTRO"))
        assertEquals("Skip credits", skipLabel("CREDITS"))
    }
}

class ClockTest {
    @Test
    fun `under an hour is minutes and seconds`() {
        assertEquals("4:05", clock(245_000))
        assertEquals("0:00", clock(0))
    }

    @Test
    fun `an hour and over carries the hours`() {
        assertEquals("1:02:03", clock(3_723_000))
    }

    @Test
    fun `a position before the start reads as the start`() {
        assertEquals("0:00", clock(-10))
    }
}
