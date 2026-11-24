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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.data.TitleCard
import de.sparksystem.onyx.data.WatchingItem
import de.sparksystem.onyx.mobile.ui.components.AccentButton
import de.sparksystem.onyx.mobile.ui.components.PosterCard
import de.sparksystem.onyx.mobile.ui.components.SectionHeading
import de.sparksystem.onyx.mobile.ui.components.Trouble
import de.sparksystem.onyx.mobile.ui.components.Waiting
import de.sparksystem.onyx.mobile.ui.components.WideCard
import de.sparksystem.onyx.mobile.ui.theme.GUTTER
import de.sparksystem.onyx.mobile.ui.theme.LocalAccent
import de.sparksystem.onyx.mobile.ui.theme.oneLine
import de.sparksystem.onyx.ui.CatalogState
import de.sparksystem.onyx.ui.SavedState
import de.sparksystem.onyx.ui.SearchState

/**
 * The home page on a phone: one title held up at the top, and rows
 * underneath that scroll sideways.
 *
 * The opening is shorter than the television's, because a phone held
 * upright has little height to spare and what matters is that the rows
 * begin above the fold.
 */
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
            modifier = Modifier.fillMaxSize().background(Onyx.onyx).padding(GUTTER),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Trouble(trouble)
                AccentButton(text = "Try again", onClick = onRetry)
            }
        }
        return
    }

    val featured = state.hero.firstOrNull()

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Onyx.onyx),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(26.dp),
    ) {
        if (featured != null) {
            item(key = "hero") { Hero(title = featured, onOpen = { onOpen(featured.slug) }) }
        }

        if (state.watching.isNotEmpty()) {
            item(key = "continue") {
                Rail(heading = "Continue watching") {
                    items(state.watching, key = { it.id }) { item ->
                        WideCard(
                            heading = item.title.name,
                            note = item.episode?.let { episode ->
                                "S${episode.seasonNumber} E${episode.number}"
                            },
                            imageUrl = item.image?.url,
                            progress = (item.position / item.duration).toFloat(),
                            onClick = { onResume(item) },
                        )
                    }
                }
            }
        }

        items(state.rows, key = { it.key }) { row ->
            Rail(heading = row.name) {
                items(row.titles, key = { it.id }) { title ->
                    PosterCard(title = title, onClick = { onOpen(title.slug) })
                }
            }
        }
    }
}

/** A heading with a row that scrolls sideways under it. */
@Composable
private fun Rail(
    heading: String,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    Column {
        SectionHeading(
            text = heading,
            modifier = Modifier.padding(start = GUTTER, bottom = 10.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = GUTTER),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}

/** The opening: artwork, the name over it, and one way in. */
@Composable
private fun Hero(title: TitleCard, onOpen: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(16f / 10f)
            .clickable(onClick = onOpen),
    ) {
        AsyncImage(
            model = title.backdrop?.url ?: title.poster?.url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxSize()
                .drawWithContent {
                    drawContent()
                    drawRect(
                        brush = Brush.verticalGradient(
                            0f to Onyx.onyx.copy(alpha = 0.1f),
                            0.6f to Onyx.onyx.copy(alpha = 0.7f),
                            1f to Onyx.onyx,
                        ),
                    )
                },
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = GUTTER, end = GUTTER, bottom = 14.dp),
        ) {
            val eyebrow = title.categories.firstOrNull()?.name
            if (eyebrow != null) {
                Text(
                    text = eyebrow.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = LocalAccent.current,
                )
                Spacer(Modifier.height(6.dp))
            }
            Text(
                text = title.name,
                style = MaterialTheme.typography.displayLarge,
                maxLines = 2,
                overflow = oneLine,
            )
            val facts = listOfNotNull(
                title.releaseYear?.toString(),
                title.ageRating,
            ).joinToString("   ·   ")
            if (facts.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    text = facts,
                    style = MaterialTheme.typography.labelMedium,
                    color = Onyx.smoke,
                )
            }
        }
    }
}

/**
 * Searching on a phone, which is simply searching: there is a keyboard, and
 * the results fill in as the typing settles.
 */
@Composable
fun SearchScreen(state: SearchState, onType: (String) -> Unit, onOpen: (slug: String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .padding(horizontal = GUTTER),
    ) {
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.text,
            onValueChange = onType,
            placeholder = { Text("Search", color = Onyx.dust) },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = LocalAccent.current,
                unfocusedBorderColor = Onyx.line,
                focusedContainerColor = Onyx.ash,
                unfocusedContainerColor = Onyx.ash,
                focusedTextColor = Onyx.vein,
                unfocusedTextColor = Onyx.vein,
                cursorColor = LocalAccent.current,
            ),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))

        val trouble = state.trouble
        when {
            trouble != null -> Trouble(trouble)

            state.text.trim().length < 2 -> Note("Type two letters or more.")

            state.searching && state.results.isEmpty() -> Note("Searching")

            state.empty -> Note("Nothing matches “${state.text.trim()}”.")

            else -> Grid(titles = state.results, onOpen = onOpen)
        }
    }
}

/** The titles a viewer put aside for later. */
@Composable
fun SavedScreen(state: SavedState, onOpen: (slug: String) -> Unit) {
    if (state.loading && state.titles.isEmpty()) {
        Waiting("Loading your list")
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .padding(horizontal = GUTTER),
    ) {
        Spacer(Modifier.height(16.dp))
        SectionHeading(text = "My list")
        Spacer(Modifier.height(16.dp))

        val trouble = state.trouble
        when {
            trouble != null && state.titles.isEmpty() -> Trouble(trouble)
            state.titles.isEmpty() -> Note(
                "Nothing here yet. Open a title and press “Add to my list” to put it aside.",
            )
            else -> Grid(titles = state.titles, onOpen = onOpen)
        }
    }
}

@Composable
private fun Note(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = Onyx.smoke,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** Posters in a grid, as wide as the phone allows. */
@Composable
private fun Grid(titles: List<TitleCard>, onOpen: (slug: String) -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 116.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        contentPadding = PaddingValues(bottom = 24.dp),
    ) {
        gridItems(titles, key = { it.id }) { title ->
            PosterCard(
                title = title,
                onClick = { onOpen(title.slug) },
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** A row of the live lineup: number, name, what is on, how far through. */
@Composable
fun ChannelRow(
    number: Int?,
    name: String,
    onAir: Boolean,
    running: String?,
    through: Float,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = number?.toString() ?: "–",
            style = MaterialTheme.typography.labelLarge,
            color = Onyx.smoke,
            modifier = Modifier.padding(end = 14.dp),
        )
        Column(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = name,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 1,
                overflow = oneLine,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                text = if (!onAir) "Off air" else running ?: "Nothing in the guide",
                style = MaterialTheme.typography.bodyMedium,
                color = if (onAir && running != null) Onyx.smoke else Onyx.dust,
                maxLines = 1,
                overflow = oneLine,
            )
            if (onAir && running != null) {
                Spacer(Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .background(Onyx.vein.copy(alpha = 0.2f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(through)
                            .height(2.dp)
                            .background(LocalAccent.current),
                    )
                }
            }
        }
    }
}
