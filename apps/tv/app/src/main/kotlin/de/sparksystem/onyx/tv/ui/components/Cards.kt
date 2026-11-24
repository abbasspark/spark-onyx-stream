// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import de.sparksystem.onyx.tv.data.TitleCard
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.tv.ui.theme.Onyx
import de.sparksystem.onyx.tv.ui.theme.oneLine

/** How wide a poster is on a television, and the 2:3 it is cut to. */
object CardSize {
    val posterWidth = 184.dp
    val posterHeight = 276.dp
    val wideWidth = 340.dp
    val wideHeight = 191.dp
}

/**
 * One title in a row. The artwork carries it; the name sits underneath and
 * only has to be read when the artwork does not say enough.
 *
 * The border of the accent is how a television says "this is the one the
 * remote is on", and it is the only focus mark used anywhere in the app.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PosterCard(
    title: TitleCard,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.width(CardSize.posterWidth)) {
        Card(
            onClick = onClick,
            colors = CardDefaults.colors(containerColor = Onyx.ash),
            border = CardDefaults.border(
                focusedBorder = Border(
                    border = androidx.compose.foundation.BorderStroke(3.dp, LocalAccent.current),
                ),
            ),
            scale = CardDefaults.scale(focusedScale = 1.06f),
            modifier = Modifier
                .width(CardSize.posterWidth)
                .height(CardSize.posterHeight),
        ) {
            Artwork(
                url = title.poster?.url,
                name = title.name,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = title.name,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = oneLine,
        )
        val under = listOfNotNull(
            title.releaseYear?.toString(),
            if (title.isSeries) seasonsOf(title) else null,
        ).joinToString("  ·  ")
        if (under.isNotEmpty()) {
            Text(
                text = under,
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.smoke,
                maxLines = 1,
                overflow = oneLine,
            )
        }
    }
}

private fun seasonsOf(title: TitleCard): String? = when {
    title.seasonCount > 1 -> "${title.seasonCount} seasons"
    title.seasonCount == 1 -> "1 season"
    else -> null
}

/**
 * A wide card, for a row of episodes or of videos already started. The
 * picture is a backdrop or a still, so it is cut to 16:9 rather than 2:3.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun WideCard(
    heading: String,
    note: String?,
    imageUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    /** How far through the video the viewer is, from 0 to 1. Null draws no bar. */
    progress: Float? = null,
) {
    Column(modifier = modifier.width(CardSize.wideWidth)) {
        Card(
            onClick = onClick,
            colors = CardDefaults.colors(containerColor = Onyx.ash),
            border = CardDefaults.border(
                focusedBorder = Border(
                    border = androidx.compose.foundation.BorderStroke(3.dp, LocalAccent.current),
                ),
            ),
            scale = CardDefaults.scale(focusedScale = 1.06f),
            modifier = Modifier
                .width(CardSize.wideWidth)
                .height(CardSize.wideHeight),
        ) {
            Box(modifier = Modifier.fillMaxSize()) {
                Artwork(url = imageUrl, name = heading, modifier = Modifier.fillMaxSize())
                if (progress != null) {
                    // The band at the foot of the card: the same mark the
                    // seek bar uses, so that "how far in" reads the same way
                    // wherever it appears.
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .fillMaxWidth()
                            .height(4.dp)
                            .background(Onyx.vein.copy(alpha = 0.25f)),
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progress.coerceIn(0f, 1f))
                                .height(4.dp)
                                .background(LocalAccent.current),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Text(
            text = heading,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 1,
            overflow = oneLine,
        )
        if (note != null) {
            Text(
                text = note,
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.smoke,
                maxLines = 1,
                overflow = oneLine,
            )
        }
    }
}

/**
 * Artwork, or something to look at while it loads and if it never arrives.
 * A missing poster shows the name rather than a broken frame.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun Artwork(url: String?, name: String, modifier: Modifier = Modifier) {
    Box(modifier = modifier.background(Onyx.ash), contentAlignment = Alignment.Center) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                text = name,
                style = MaterialTheme.typography.labelLarge,
                color = Onyx.dust,
                textAlign = TextAlign.Center,
                maxLines = 3,
                overflow = oneLine,
                modifier = Modifier.padding(12.dp),
            )
        }
    }
}
