// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.data.TitleCard
import de.sparksystem.onyx.mobile.ui.theme.LocalAccent
import de.sparksystem.onyx.mobile.ui.theme.oneLine

/** How wide a poster is in a row on a phone. */
val POSTER_WIDTH = 124.dp
val WIDE_WIDTH = 248.dp

/**
 * One title in a row. The artwork carries it; the name underneath is for
 * when the artwork does not say enough.
 *
 * There is no focus border here, as there is on the television: a thumb
 * knows where it is going. What a card gets instead is a target big enough
 * to hit on a moving train.
 */
@Composable
fun PosterCard(title: TitleCard, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier = modifier.width(POSTER_WIDTH).clickable(onClick = onClick)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .background(Onyx.ash),
        ) {
            Artwork(url = title.poster?.url, name = title.name)
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = title.name,
            style = MaterialTheme.typography.labelLarge,
            maxLines = 2,
            overflow = oneLine,
        )
        val under = listOfNotNull(
            title.releaseYear?.toString(),
            if (title.isSeries && title.seasonCount > 0) {
                if (title.seasonCount == 1) "1 season" else "${title.seasonCount} seasons"
            } else {
                null
            },
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

/** A wide card, for something already started or for an episode. */
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
    Column(modifier = modifier.width(WIDE_WIDTH).clickable(onClick = onClick)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 9f)
                .background(Onyx.ash),
        ) {
            Artwork(url = imageUrl, name = heading)
            if (progress != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(3.dp)
                        .background(Onyx.vein.copy(alpha = 0.25f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progress.coerceIn(0f, 1f))
                            .height(3.dp)
                            .background(LocalAccent.current),
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
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

/** Artwork, or the name of the thing while it loads and if it never arrives. */
@Composable
fun Artwork(url: String?, name: String, modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
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
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.dust,
                textAlign = TextAlign.Center,
                maxLines = 3,
                overflow = oneLine,
                modifier = Modifier.padding(8.dp),
            )
        }
    }
}
