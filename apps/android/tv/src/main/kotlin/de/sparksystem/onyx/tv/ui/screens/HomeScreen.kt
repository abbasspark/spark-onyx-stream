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
import androidx.compose.runtime.mutableStateOf
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
import de.sparksystem.onyx.data.TitleCard
import de.sparksystem.onyx.data.WatchingItem
import de.sparksystem.onyx.ui.CatalogState
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.CardSize
import de.sparksystem.onyx.tv.ui.components.PosterCard
import de.sparksystem.onyx.tv.ui.components.SectionHeading
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.tv.ui.components.WideCard
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe
import de.sparksystem.onyx.tv.ui.theme.oneLine

/**
 * The home page on a television: one title held up at the top, and rows
 * underneath that the remote walks along.
 *
 * The opening is a whole screen of artwork rather than a card, because on a
 * television the first thing a viewer sees should look like the thing they
 * came to watch, not like a menu.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun HomeScreen(
    state: CatalogState,
    siteName: String,
    onOpen: (slug: String) -> Unit,
    onResume: (WatchingItem) -> Unit,
    onRetry: () -> Unit,
) {
    if (state.loading && state.rows.isEmpty() && state.hero.isEmpty()) {
        Waiting("Loading $siteName")
        return
    }

    val trouble = state.trouble
    if (trouble != null && state.rows.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().background(Onyx.onyx),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Trouble(trouble)
                AccentButton(text = "Try again", onClick = onRetry)
            }
        }
        return
    }

    // The title the hero shows. It follows whatever the remote is on in the
    // first row, so moving along the row changes the picture behind it.
    var featured by remember(state.hero) { mutableStateOf(state.hero.firstOrNull()) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Onyx.onyx),
        contentPadding = PaddingValues(bottom = Safe.vertical),
        verticalArrangement = Arrangement.spacedBy(36.dp),
    ) {
        if (featured != null) {
            item(key = "hero") {
                Hero(title = featured!!, onOpen = { onOpen(featured!!.slug) })
            }
        }

        if (state.watching.isNotEmpty()) {
            item(key = "continue") {
                Column {
                    SectionHeading(
                        text = "Continue watching",
                        modifier = Modifier.padding(start = Safe.horizontal, bottom = 14.dp),
                    )
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = Safe.horizontal),
                        horizontalArrangement = Arrangement.spacedBy(20.dp),
                    ) {
                        items(state.watching, key = { it.id }) { item ->
                            WideCard(
                                heading = item.title.name,
                                note = item.episode?.let { episode ->
                                    "S${episode.seasonNumber} E${episode.number}  ${episode.name}"
                                },
                                imageUrl = item.image?.url,
                                progress = (item.position / item.duration).toFloat(),
                                onClick = { onResume(item) },
                            )
                        }
                    }
                }
            }
        }

        items(state.rows, key = { it.key }) { row ->
            Column {
                SectionHeading(
                    text = row.name,
                    modifier = Modifier.padding(start = Safe.horizontal, bottom = 14.dp),
                )
                LazyRow(
                    contentPadding = PaddingValues(horizontal = Safe.horizontal),
                    horizontalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    items(row.titles, key = { it.id }) { title ->
                        PosterCard(
                            title = title,
                            onClick = { onOpen(title.slug) },
                            modifier = Modifier.width(CardSize.posterWidth),
                        )
                    }
                }
            }
        }
    }
}

/** The opening: artwork across the screen, with the name and one button over it. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Hero(title: TitleCard, onOpen: () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth().height(460.dp)) {
        AsyncImage(
            model = title.backdrop?.url ?: title.poster?.url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxSize()
                // Two washes, one from the foot and one from the left, so the
                // words sit on black however bright the picture is behind them.
                .drawWithContent {
                    drawContent()
                    drawRect(
                        brush = Brush.verticalGradient(
                            0f to Onyx.onyx.copy(alpha = 0.25f),
                            0.55f to Onyx.onyx.copy(alpha = 0.72f),
                            1f to Onyx.onyx,
                        ),
                    )
                    drawRect(
                        brush = Brush.horizontalGradient(
                            0f to Onyx.onyx.copy(alpha = 0.92f),
                            0.6f to Onyx.onyx.copy(alpha = 0.1f),
                            1f to Onyx.onyx.copy(alpha = 0f),
                        ),
                    )
                },
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = Safe.horizontal, bottom = 28.dp)
                .width(720.dp),
        ) {
            val eyebrow = title.categories.firstOrNull()?.name
            if (eyebrow != null) {
                Text(
                    text = eyebrow.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = de.sparksystem.onyx.tv.ui.theme.LocalAccent.current,
                )
                Spacer(Modifier.height(10.dp))
            }
            Text(
                text = title.name,
                style = MaterialTheme.typography.displayLarge,
                maxLines = 2,
                overflow = oneLine,
            )
            val tagline = title.tagline
            if (tagline != null) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = tagline,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Onyx.smoke,
                    maxLines = 2,
                    overflow = oneLine,
                )
            }
            Spacer(Modifier.height(20.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AccentButton(text = "Open", onClick = onOpen)
                val facts = listOfNotNull(
                    title.releaseYear?.toString(),
                    title.ageRating,
                    if (title.isSeries && title.seasonCount > 0) {
                        if (title.seasonCount == 1) "1 season" else "${title.seasonCount} seasons"
                    } else {
                        null
                    },
                ).joinToString("   ·   ")
                if (facts.isNotEmpty()) {
                    Text(
                        text = facts,
                        style = MaterialTheme.typography.labelMedium,
                        color = Onyx.smoke,
                    )
                }
            }
        }
    }
}
