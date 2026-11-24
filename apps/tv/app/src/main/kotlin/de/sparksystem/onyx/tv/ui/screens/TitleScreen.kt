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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import java.util.Locale
import de.sparksystem.onyx.tv.data.Episode
import de.sparksystem.onyx.tv.ui.TitleState
import de.sparksystem.onyx.tv.ui.WhatToPlay
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.SectionHeading
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.tv.ui.components.WideCard
import de.sparksystem.onyx.tv.ui.theme.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe
import de.sparksystem.onyx.tv.ui.theme.oneLine

/**
 * One title: what it is, and the one button that matters — play, resume, or
 * go on with the episode the viewer was in the middle of.
 *
 * A series lists its episodes under that, a season at a time.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TitleScreen(
    state: TitleState,
    whatToPlay: WhatToPlay?,
    onPlay: (episodeId: String?, positionSeconds: Double) -> Unit,
    onBack: () -> Unit,
) {
    if (state.loading) {
        Waiting("Loading")
        return
    }
    val detail = state.detail
    if (detail == null) {
        Box(
            modifier = Modifier.fillMaxSize().background(Onyx.onyx),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Trouble(state.trouble ?: "That title could not be loaded.")
                AccentButton(text = "Back", onClick = onBack)
            }
        }
        return
    }

    var season by remember(detail.id) { mutableIntStateOf(0) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Onyx.onyx),
        contentPadding = PaddingValues(bottom = Safe.vertical),
        verticalArrangement = Arrangement.spacedBy(32.dp),
    ) {
        item(key = "head") {
            Box(modifier = Modifier.fillMaxWidth().height(500.dp)) {
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
                                    0f to Onyx.onyx.copy(alpha = 0.3f),
                                    0.5f to Onyx.onyx.copy(alpha = 0.75f),
                                    1f to Onyx.onyx,
                                ),
                            )
                            drawRect(
                                brush = Brush.horizontalGradient(
                                    0f to Onyx.onyx.copy(alpha = 0.9f),
                                    0.65f to Onyx.onyx.copy(alpha = 0.05f),
                                    1f to Onyx.onyx.copy(alpha = 0f),
                                ),
                            )
                        },
                )

                Column(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = Safe.horizontal, bottom = 24.dp)
                        .width(760.dp),
                ) {
                    Text(
                        text = detail.name,
                        style = MaterialTheme.typography.displayLarge,
                        maxLines = 2,
                        overflow = oneLine,
                    )
                    Spacer(Modifier.height(12.dp))
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
                    if (detail.synopsis != null) {
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = detail.synopsis,
                            style = MaterialTheme.typography.bodyLarge,
                            color = Onyx.vein.copy(alpha = 0.9f),
                            maxLines = 4,
                            overflow = oneLine,
                        )
                    }
                    Spacer(Modifier.height(24.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (whatToPlay != null) {
                            AccentButton(
                                text = whatToPlay.label,
                                onClick = {
                                    onPlay(whatToPlay.episodeId, whatToPlay.positionSeconds)
                                },
                            )
                        }
                        AccentButton(text = "Back", onClick = onBack)
                        if (whatToPlay?.detail != null) {
                            Text(
                                text = whatToPlay.detail,
                                style = MaterialTheme.typography.labelMedium,
                                color = Onyx.smoke,
                            )
                        }
                    }
                }
            }
        }

        if (detail.isSeries && detail.seasons.isNotEmpty()) {
            val seasons = detail.seasons.sortedBy { it.number }
            val chosen = seasons.getOrNull(season) ?: seasons.first()

            if (seasons.size > 1) {
                item(key = "seasons") {
                    Column {
                        SectionHeading(
                            text = "Seasons",
                            modifier = Modifier.padding(start = Safe.horizontal, bottom = 12.dp),
                        )
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = Safe.horizontal),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items(seasons.size) { index ->
                                val entry = seasons[index]
                                AccentButton(
                                    text = entry.name ?: "Season ${entry.number}",
                                    onClick = { season = index },
                                )
                            }
                        }
                    }
                }
            }

            item(key = "episodes-${chosen.number}") {
                Column {
                    SectionHeading(
                        text = chosen.name ?: "Season ${chosen.number}",
                        modifier = Modifier.padding(start = Safe.horizontal, bottom = 14.dp),
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = Safe.horizontal),
                        horizontalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        items(chosen.episodes.sortedBy { it.number }, key = { it.id }) { episode ->
                            EpisodeCard(
                                episode = episode,
                                seasonNumber = chosen.number,
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
                Column(modifier = Modifier.padding(horizontal = Safe.horizontal)) {
                    SectionHeading(text = "Cast", modifier = Modifier.padding(bottom = 10.dp))
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
    }
}

@Composable
private fun EpisodeCard(
    episode: Episode,
    seasonNumber: Int,
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
        note = episode.durationMs?.let { "${it / 60000} min" } ?: "Season $seasonNumber",
        imageUrl = episode.still?.url,
        progress = progress,
        onClick = onPlay,
    )
}
