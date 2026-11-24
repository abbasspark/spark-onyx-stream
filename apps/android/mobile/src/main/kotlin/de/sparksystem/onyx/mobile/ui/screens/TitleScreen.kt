// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.data.Episode
import de.sparksystem.onyx.mobile.ui.components.AccentButton
import de.sparksystem.onyx.mobile.ui.components.QuietButton
import de.sparksystem.onyx.mobile.ui.components.SectionHeading
import de.sparksystem.onyx.mobile.ui.components.Trouble
import de.sparksystem.onyx.mobile.ui.components.Waiting
import de.sparksystem.onyx.mobile.ui.components.WideCard
import de.sparksystem.onyx.mobile.ui.theme.GUTTER
import de.sparksystem.onyx.mobile.ui.theme.oneLine
import de.sparksystem.onyx.ui.TitleState
import de.sparksystem.onyx.ui.WhatToPlay
import java.util.Locale

/**
 * One title on a phone: the artwork, what it is, and the button that
 * matters. A series lists its episodes below, a season at a time.
 *
 * The synopsis is folded to three lines with a way to open it, because a
 * paragraph of text pushes the episodes off a phone screen entirely.
 */
@Composable
fun TitleScreen(
    state: TitleState,
    whatToPlay: WhatToPlay?,
    saved: Boolean,
    onPlay: (episodeId: String?, positionSeconds: Double) -> Unit,
    onToggleSaved: () -> Unit,
    onBack: () -> Unit,
) {
    if (state.loading) {
        Waiting("Loading")
        return
    }
    val detail = state.detail
    if (detail == null) {
        Box(
            modifier = Modifier.fillMaxSize().background(Onyx.onyx).padding(GUTTER),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Trouble(state.trouble ?: "That title could not be loaded.")
                AccentButton(text = "Back", onClick = onBack)
            }
        }
        return
    }

    var season by remember(detail.id) { mutableIntStateOf(0) }
    var openSynopsis by remember(detail.id) { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Onyx.onyx),
        contentPadding = PaddingValues(bottom = 28.dp),
    ) {
        item(key = "head") {
            Box(modifier = Modifier.fillMaxWidth().aspectRatio(16f / 10f)) {
                AsyncImage(
                    model = detail.backdrop?.url ?: detail.poster?.url,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxSize()
                        .drawWithContent {
                            drawContent()
                            drawRect(
                                brush = Brush.verticalGradient(
                                    0f to Onyx.onyx.copy(alpha = 0.15f),
                                    0.65f to Onyx.onyx.copy(alpha = 0.7f),
                                    1f to Onyx.onyx,
                                ),
                            )
                        },
                )
                Text(
                    text = detail.name,
                    style = MaterialTheme.typography.displayLarge,
                    maxLines = 3,
                    overflow = oneLine,
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = GUTTER, end = GUTTER, bottom = 10.dp),
                )
            }
        }

        item(key = "facts") {
            Column(modifier = Modifier.padding(horizontal = GUTTER)) {
                val facts = listOfNotNull(
                    detail.releaseYear?.toString(),
                    detail.ageRating,
                    detail.runtimeMinutes?.let { "$it min" },
                    detail.rating?.let { String.format(Locale.getDefault(), "%.1f", it) },
                    detail.genres.take(2).joinToString(", ") { it.name }.ifBlank { null },
                ).joinToString("   ·   ")
                if (facts.isNotEmpty()) {
                    Text(
                        text = facts,
                        style = MaterialTheme.typography.labelMedium,
                        color = Onyx.smoke,
                    )
                }

                Spacer(Modifier.height(16.dp))
                if (whatToPlay != null) {
                    AccentButton(
                        text = whatToPlay.label,
                        onClick = { onPlay(whatToPlay.episodeId, whatToPlay.positionSeconds) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    val playDetail = whatToPlay.detail
                    if (playDetail != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = playDetail,
                            style = MaterialTheme.typography.labelMedium,
                            color = Onyx.smoke,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                QuietButton(
                    text = if (saved) "On my list" else "Add to my list",
                    onClick = onToggleSaved,
                    modifier = Modifier.fillMaxWidth(),
                )

                val synopsis = detail.synopsis
                if (synopsis != null) {
                    Spacer(Modifier.height(18.dp))
                    Text(
                        text = synopsis,
                        style = MaterialTheme.typography.bodyLarge,
                        color = Onyx.vein.copy(alpha = 0.9f),
                        maxLines = if (openSynopsis) Int.MAX_VALUE else 3,
                        overflow = oneLine,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { openSynopsis = !openSynopsis },
                    )
                    if (!openSynopsis && synopsis.length > 160) {
                        Text(
                            text = "More",
                            style = MaterialTheme.typography.labelMedium,
                            color = de.sparksystem.onyx.mobile.ui.theme.LocalAccent.current,
                            modifier = Modifier
                                .padding(top = 4.dp)
                                .clickable { openSynopsis = true },
                        )
                    }
                }
            }
        }

        if (detail.isSeries && detail.seasons.isNotEmpty()) {
            val seasons = detail.seasons.sortedBy { it.number }
            val chosen = seasons.getOrNull(season) ?: seasons.first()

            if (seasons.size > 1) {
                item(key = "seasons") {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = GUTTER, vertical = 18.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(seasons.size) { index ->
                            val entry = seasons[index]
                            val here = index == season
                            Text(
                                text = entry.name ?: "Season ${entry.number}",
                                style = MaterialTheme.typography.labelLarge,
                                color = if (here) Onyx.onyx else Onyx.vein,
                                modifier = Modifier
                                    .background(
                                        if (here) {
                                            de.sparksystem.onyx.mobile.ui.theme.LocalAccent.current
                                        } else {
                                            Onyx.ash
                                        },
                                    )
                                    .clickable { season = index }
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                            )
                        }
                    }
                }
            }

            item(key = "episodes-${chosen.number}") {
                Column(modifier = Modifier.padding(top = if (seasons.size > 1) 0.dp else 18.dp)) {
                    SectionHeading(
                        text = chosen.name ?: "Season ${chosen.number}",
                        modifier = Modifier.padding(start = GUTTER, bottom = 10.dp),
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = GUTTER),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        items(chosen.episodes.sortedBy { it.number }, key = { it.id }) { episode ->
                            EpisodeCard(
                                episode = episode,
                                positionSeconds = state.positions[episode.id] ?: 0.0,
                                finished = state.finished.contains(episode.id),
                                onPlay = { onPlay(episode.id, state.positions[episode.id] ?: 0.0) },
                            )
                        }
                    }
                }
            }
        }

        if (detail.cast.isNotEmpty()) {
            item(key = "cast") {
                Column(modifier = Modifier.padding(GUTTER)) {
                    SectionHeading(text = "Cast", modifier = Modifier.padding(bottom = 8.dp))
                    Text(
                        text = detail.cast.take(8).joinToString("   ·   ") { credit ->
                            credit.role?.let { "${credit.name} as $it" } ?: credit.name
                        },
                        style = MaterialTheme.typography.bodyMedium,
                        color = Onyx.smoke,
                    )
                }
            }
        }

        item(key = "back") {
            Row(modifier = Modifier.padding(horizontal = GUTTER, vertical = 8.dp)) {
                QuietButton(text = "Back", onClick = onBack, modifier = Modifier.width(140.dp))
            }
        }
    }
}

@Composable
private fun EpisodeCard(
    episode: Episode,
    positionSeconds: Double,
    finished: Boolean,
    onPlay: () -> Unit,
) {
    val duration = (episode.durationMs ?: 0L) / 1000.0
    val progress = when {
        finished -> 1f
        duration > 0 && positionSeconds > 30 -> (positionSeconds / duration).toFloat()
        else -> null
    }
    WideCard(
        heading = "${episode.number}. ${episode.name}",
        note = episode.durationMs?.let { "${it / 60000} min" },
        imageUrl = episode.still?.url,
        progress = progress,
        onClick = onPlay,
    )
}
