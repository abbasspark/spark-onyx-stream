// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
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
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.ListItem
import androidx.tv.material3.ListItemDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.data.Channel
import de.sparksystem.onyx.ui.LiveState
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.SectionHeading
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.ui.progressOf
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe
import de.sparksystem.onyx.tv.ui.theme.oneLine
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** A time of day as the viewer's own television writes it. */
internal fun clockOf(time: String?): String {
    val moment = time?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return ""
    return DateTimeFormatter.ofPattern("HH:mm")
        .withZone(ZoneId.systemDefault())
        .format(moment)
}

/**
 * The lineup: a channel to a row, with its number, what is on and how far
 * through it is. A list rather than a wall of cards, because a channel is
 * picked by its name and its number, not by a picture.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun LineupScreen(
    state: LiveState,
    onWatch: (Channel) -> Unit,
    onGuide: () -> Unit,
    onRetry: () -> Unit,
) {
    if (state.loading && state.channels.isEmpty()) {
        Waiting("Loading the channels")
        return
    }

    if (state.channels.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().background(Onyx.onyx),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Trouble(state.trouble ?: "This service has no live channels.")
                AccentButton(text = "Try again", onClick = onRetry)
            }
        }
        return
    }

    // The bars move while the viewer looks at the list, so the clock ticks.
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Onyx.onyx),
        contentPadding = PaddingValues(
            start = Safe.horizontal,
            end = Safe.horizontal,
            top = Safe.vertical,
            bottom = Safe.vertical,
        ),
    ) {
        item(key = "head") {
            Row(
                modifier = Modifier.fillMaxWidth().padding(bottom = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                SectionHeading(text = "Live")
                Spacer(Modifier.width(24.dp))
                AccentButton(text = "Guide", onClick = onGuide)
            }
        }

        items(state.channels, key = { it.slug }) { channel ->
            ChannelRow(
                channel = channel,
                now = now,
                playing = channel.slug == state.watching?.slug,
                onClick = { onWatch(channel) },
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ChannelRow(
    channel: Channel,
    now: Long,
    playing: Boolean,
    onClick: () -> Unit,
) {
    ListItem(
        selected = playing,
        onClick = onClick,
        colors = ListItemDefaults.colors(
            containerColor = Onyx.onyx,
            focusedContainerColor = Onyx.ash,
            selectedContainerColor = Onyx.coal,
            contentColor = Onyx.vein,
            focusedContentColor = Onyx.vein,
        ),
        border = ListItemDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(2.dp, LocalAccent.current),
            ),
        ),
        leadingContent = {
            Text(
                text = channel.number?.toString() ?: "–",
                style = MaterialTheme.typography.titleMedium,
                color = Onyx.smoke,
                modifier = Modifier.width(52.dp),
            )
        },
        headlineContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = oneLine,
                    modifier = Modifier.width(260.dp),
                )
                Spacer(Modifier.width(20.dp))
                val running = channel.now
                Column(modifier = Modifier.width(520.dp)) {
                    if (!channel.onAir) {
                        Text(
                            text = "Off air",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Onyx.dust,
                        )
                    } else if (running != null) {
                        Text(
                            text = running.title,
                            style = MaterialTheme.typography.bodyMedium,
                            maxLines = 1,
                            overflow = oneLine,
                        )
                        Spacer(Modifier.height(6.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(3.dp)
                                .background(Onyx.vein.copy(alpha = 0.2f)),
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(progressOf(running, now))
                                    .height(3.dp)
                                    .background(LocalAccent.current),
                            )
                        }
                    } else {
                        Text(
                            text = "Nothing in the guide",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Onyx.dust,
                        )
                    }
                }
            }
        },
        trailingContent = {
            val next = channel.next
            val right = when {
                !channel.onAir -> ""
                next != null -> "Then ${clockOf(next.startsAt)}  ${next.title}"
                else -> ""
            }
            Text(
                text = right,
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.smoke,
                maxLines = 1,
                overflow = oneLine,
                modifier = Modifier.width(300.dp),
            )
        },
        modifier = Modifier.padding(vertical = 4.dp),
    )
}
