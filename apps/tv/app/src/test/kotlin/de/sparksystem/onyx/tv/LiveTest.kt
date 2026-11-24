// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv

import de.sparksystem.onyx.tv.data.Channel
import de.sparksystem.onyx.tv.data.Programme
import de.sparksystem.onyx.tv.ui.behindLive
import de.sparksystem.onyx.tv.ui.channelByNumber
import de.sparksystem.onyx.tv.ui.moreBeginWith
import de.sparksystem.onyx.tv.ui.momentOf
import de.sparksystem.onyx.tv.ui.neighbour
import de.sparksystem.onyx.tv.ui.positionAt
import de.sparksystem.onyx.tv.ui.programmeAt
import de.sparksystem.onyx.tv.ui.progressOf
import de.sparksystem.onyx.tv.ui.refusalOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

private fun channel(slug: String, number: Int?, onAir: Boolean = true, dvr: Int = 0) =
    Channel(slug = slug, name = slug, number = number, onAir = onAir, dvrMinutes = dvr)

private val lineup = listOf(
    channel("nord-one", 1),
    channel("nord-two", 2),
    channel("harbour", 12),
    channel("unnumbered", null),
)

class ChannelByNumberTest {
    @Test
    fun `finds a channel by its whole number`() {
        assertEquals("harbour", channelByNumber(lineup, 12)?.slug)
    }

    @Test
    fun `does not take 1 for the start of 12`() {
        assertEquals("nord-one", channelByNumber(lineup, 1)?.slug)
    }

    @Test
    fun `gives nothing for a number no channel has`() {
        assertNull(channelByNumber(lineup, 7))
    }
}

class MoreBeginWithTest {
    @Test
    fun `waits while a longer number could still follow`() {
        assertEquals(true, moreBeginWith(lineup, "1"))
    }

    @Test
    fun `tunes once nothing longer could follow`() {
        assertEquals(false, moreBeginWith(lineup, "2"))
        assertEquals(false, moreBeginWith(lineup, "12"))
    }

    @Test
    fun `is false for digits that are not a number`() {
        assertEquals(false, moreBeginWith(lineup, ""))
    }
}

class NeighbourTest {
    @Test
    fun `steps to the channel after and before`() {
        assertEquals("nord-two", neighbour(lineup, "nord-one", 1)?.slug)
        assertEquals("nord-one", neighbour(lineup, "nord-two", -1)?.slug)
    }

    @Test
    fun `wraps round at both ends, as the channel keys do`() {
        assertEquals("nord-one", neighbour(lineup, "unnumbered", 1)?.slug)
        assertEquals("unnumbered", neighbour(lineup, "nord-one", -1)?.slug)
    }

    @Test
    fun `falls back on the first channel when this one is gone`() {
        assertEquals("nord-one", neighbour(lineup, "vanished", 1)?.slug)
    }

    @Test
    fun `gives nothing out of an empty lineup`() {
        assertNull(neighbour(emptyList(), "nord-one", 1))
    }
}

class ProgrammeTimesTest {
    private val news = Programme(
        title = "News",
        startsAt = "2026-11-24T20:00:00.000Z",
        endsAt = "2026-11-24T20:30:00.000Z",
    )
    private val film = Programme(
        title = "Film",
        startsAt = "2026-11-24T20:30:00.000Z",
        endsAt = "2026-11-24T22:00:00.000Z",
    )
    private val evening = listOf(news, film)
    private val eight = momentOf("2026-11-24T20:00:00.000Z")!!

    @Test
    fun `reads a moment of the world`() {
        assertEquals(1795550400000L, eight)
    }

    @Test
    fun `gives nothing for a time it cannot read`() {
        assertNull(momentOf("the day before yesterday"))
    }

    @Test
    fun `measures how far through a programme is`() {
        assertEquals(0f, progressOf(news, eight), 0.001f)
        assertEquals(0.5f, progressOf(news, eight + 900_000), 0.001f)
        assertEquals(1f, progressOf(news, eight + 1_800_000), 0.001f)
    }

    @Test
    fun `holds progress inside the programme it belongs to`() {
        assertEquals(0f, progressOf(news, eight - 600_000), 0.001f)
        assertEquals(1f, progressOf(news, eight + 9_000_000), 0.001f)
    }

    @Test
    fun `names what is on at a moment`() {
        assertEquals("News", programmeAt(evening, eight + 600_000)?.title)
        // The moment one ends belongs to the one that follows.
        assertEquals("Film", programmeAt(evening, eight + 1_800_000)?.title)
    }

    @Test
    fun `gives nothing outside what the guide says`() {
        assertNull(programmeAt(evening, eight - 3_600_000))
    }
}

class PositionAtTest {
    private val now = 1_795_550_400_000L
    private val edge = 7_200_000L
    private val window = 3_600_000L

    @Test
    fun `turns a moment of the world into a place in the video`() {
        assertEquals(edge - 600_000, positionAt(now - 600_000, now, edge, window))
    }

    @Test
    fun `gives nothing for a moment the channel no longer keeps`() {
        assertNull(positionAt(now - 7_200_000, now, edge, window))
    }

    @Test
    fun `gives nothing for the live edge itself, which is not a place to go back to`() {
        assertNull(positionAt(now, now, edge, window))
    }

    @Test
    fun `gives nothing on a channel that keeps nothing`() {
        assertNull(positionAt(now - 600_000, now, 0, 0))
    }
}

class BehindLiveTest {
    @Test
    fun `a few seconds behind is still live`() {
        assertEquals("Live", behindLive(0))
        assertEquals("Live", behindLive(44))
    }

    @Test
    fun `says minutes, rounded as a person would`() {
        assertEquals("A minute behind", behindLive(60))
        assertEquals("5 minutes behind", behindLive(300))
        assertEquals("3 minutes behind", behindLive(170))
    }

    @Test
    fun `says hours once there are any`() {
        assertEquals("An hour behind", behindLive(3600))
        assertEquals("2 hours behind", behindLive(7200))
        assertEquals("1h 30m behind", behindLive(5400))
    }
}

class RefusalTest {
    @Test
    fun `a channel that is sending can be watched`() {
        assertNull(refusalOf(channel("nord-one", 1)))
    }

    @Test
    fun `a channel that is off air says so`() {
        assertEquals(
            "This channel is not sending at the moment.",
            refusalOf(channel("nord-one", 1, onAir = false)),
        )
    }
}
