// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.data.Channel
import de.sparksystem.onyx.data.Programme
import de.sparksystem.onyx.ui.LiveState
import de.sparksystem.onyx.tv.ui.components.SectionHeading
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.ui.momentOf
import de.sparksystem.onyx.ui.progressOf
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe
import de.sparksystem.onyx.tv.ui.theme.oneLine
import kotlinx.coroutines.delay

/** How wide an hour is drawn. Wide enough for a title, narrow enough to see an evening. */
private val HOUR_WIDTH = 280.dp
private const val HOUR_MS = 3_600_000L
private val NAME_WIDTH = 220.dp
private val ROW_HEIGHT = 84.dp

/** What the viewer chose in the guide. */
data class GuidePick(
    val channel: Channel,
    val programme: Programme?,
    /** The moment it began, for a programme already sent on a channel that keeps it. */
    val beganAt: Long?,
)

/**
 * The guide: a row per channel, time running to the right, a line at the
 * present moment.
 *
 * A row is a row of cards rather than a grid of boxes, because that is what
 * a remote control walks: down the channels, along the evening, and the
 * centre key takes whatever it is on.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun GuideScreen(
    state: LiveState,
    onPick: (GuidePick) -> Unit,
    onBack: () -> Unit,
) {
    val guide = state.guide
    if (guide == null) {
        Waiting("Loading the guide")
        return
    }

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }

    val from = momentOf(guide.from) ?: now
    val rows = state.channels.map { channel ->
        channel to guide.channels.firstOrNull { it.slug == channel.slug }?.programmes.orEmpty()
    }
    val watching = state.watching?.slug
    val listState = rememberLazyListState()

    // Opens on the channel that is playing: a viewer who pressed the guide
    // key while watching wants to see this channel's evening first.
    LaunchedEffect(watching, rows.size) {
        val at = rows.indexOfFirst { it.first.slug == watching }
        if (at > 0) {
            listState.scrollToItem(at)
        }
    }

    Column(modifier = Modifier.fillMaxSize().background(Onyx.onyx.copy(alpha = 0.96f))) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Safe.horizontal, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SectionHeading(text = "Guide")
            Spacer(Modifier.width(24.dp))
            Text(
                text = clockOf(guide.from).let { "from $it" },
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.smoke,
            )
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = Safe.vertical),
        ) {
            items(rows, key = { it.first.slug }) { (channel, programmes) ->
                Row(
                    modifier = Modifier.fillMaxWidth().height(ROW_HEIGHT),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(
                        modifier = Modifier
                            .width(NAME_WIDTH)
                            .padding(start = Safe.horizontal, end = 16.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (channel.number != null) {
                                Text(
                                    text = channel.number.toString(),
                                    style = MaterialTheme.typography.labelMedium,
                                    color = Onyx.dust,
                                )
                                Spacer(Modifier.width(10.dp))
                            }
                            Text(
                                text = channel.name,
                                style = MaterialTheme.typography.labelLarge,
                                color = if (channel.slug == watching) {
                                    LocalAccent.current
                                } else {
                                    Onyx.vein
                                },
                                maxLines = 1,
                                overflow = oneLine,
                            )
                        }
                    }

                    if (programmes.isEmpty()) {
                        Text(
                            text = "Nothing in the guide for this channel",
                            style = MaterialTheme.typography.labelMedium,
                            color = Onyx.dust,
                        )
                    } else {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            contentPadding = PaddingValues(end = Safe.horizontal),
                        ) {
                            items(programmes, key = { it.startsAt + it.title }) { programme ->
                                ProgrammeCard(
                                    programme = programme,
                                    now = now,
                                    keeps = channel.keeps,
                                    onClick = {
                                        onPick(
                                            GuidePick(
                                                channel = channel,
                                                programme = programme,
                                                beganAt = momentOf(programme.startsAt),
                                            ),
                                        )
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * One programme. Its width says how long it runs, so an evening reads at a
 * glance; a short one still gets enough room to show its name.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ProgrammeCard(
    programme: Programme,
    now: Long,
    keeps: Boolean,
    onClick: () -> Unit,
) {
    val start = momentOf(programme.startsAt)
    val end = momentOf(programme.endsAt)
    val length = if (start != null && end != null) end - start else HOUR_MS
    val width = (HOUR_WIDTH * (length.toFloat() / HOUR_MS)).coerceAtLeast(132.dp)
    val running = start != null && end != null && now in start until end
    val past = end != null && end <= now
    // A programme already sent is only worth choosing where the channel keeps it.
    val reachable = !past || keeps

    Card(
        onClick = onClick,
        colors = CardDefaults.colors(
            containerColor = if (running) Onyx.ash else Onyx.coal,
            focusedContainerColor = Onyx.ash,
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(3.dp, LocalAccent.current),
            ),
        ),
        scale = CardDefaults.scale(focusedScale = 1.03f),
        modifier = Modifier.width(width).height(68.dp),
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                Text(
                    text = programme.title,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (reachable) Onyx.vein else Onyx.dust,
                    maxLines = 1,
                    overflow = oneLine,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = clockOf(programme.startsAt),
                    style = MaterialTheme.typography.labelMedium,
                    color = Onyx.smoke,
                )
            }
            if (running) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth(progressOf(programme, now))
                        .height(3.dp)
                        .background(LocalAccent.current),
                )
            }
        }
    }
}
