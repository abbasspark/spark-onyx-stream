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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.ui.SearchState
import de.sparksystem.onyx.tv.ui.components.PosterCard
import de.sparksystem.onyx.tv.ui.components.SectionHeading
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe

/**
 * The letters the keyboard offers, in the order a remote control walks them.
 *
 * Alphabetical and six to a row, which is what every television keyboard
 * does, because a viewer looking for the letter G should find it where they
 * expect it rather than somewhere a designer thought was clever.
 */
private val LETTERS = listOf(
    "A", "B", "C", "D", "E", "F",
    "G", "H", "I", "J", "K", "L",
    "M", "N", "O", "P", "Q", "R",
    "S", "T", "U", "V", "W", "X",
    "Y", "Z", "0", "1", "2", "3",
    "4", "5", "6", "7", "8", "9",
)
private const val SPACE = "Space"
private const val BACK = "Delete"

/**
 * Searching on a television: a keyboard on the left, what was found on the
 * right, filling in as the viewer types.
 *
 * The keyboard is drawn rather than asked of the system, because the system
 * one covers the screen and hides the very results the viewer is typing
 * towards.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SearchScreen(
    state: SearchState,
    onType: (String) -> Unit,
    onOpen: (slug: String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .padding(horizontal = Safe.horizontal, vertical = Safe.vertical),
        horizontalArrangement = Arrangement.spacedBy(44.dp),
    ) {
        Column(modifier = Modifier.width(336.dp)) {
            SectionHeading(text = "Search")
            Spacer(Modifier.height(18.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(60.dp)
                    .background(Onyx.ash)
                    .border(2.dp, if (state.text.isEmpty()) Onyx.line else LocalAccent.current)
                    .padding(horizontal = 16.dp, vertical = 16.dp),
            ) {
                Text(
                    text = state.text.ifEmpty { "What are you looking for?" },
                    style = MaterialTheme.typography.titleMedium,
                    color = if (state.text.isEmpty()) Onyx.dust else Onyx.vein,
                    maxLines = 1,
                )
            }

            Spacer(Modifier.height(18.dp))
            Keyboard(
                onLetter = { letter -> onType(state.text + letter) },
                onSpace = { if (state.text.isNotEmpty()) onType("${state.text} ") },
                onDelete = { onType(state.text.dropLast(1)) },
            )
        }

        Column(modifier = Modifier.fillMaxSize()) {
            val trouble = state.trouble
            when {
                trouble != null -> Trouble(trouble)

                state.text.trim().length < 2 -> Hint(
                    "Type two letters or more. The search looks at the name of a title.",
                )

                state.searching && state.results.isEmpty() -> Hint("Searching")

                state.empty -> Hint("Nothing matches “${state.text.trim()}”.")

                else -> {
                    Text(
                        text = if (state.results.size == 1) {
                            "One title"
                        } else {
                            "${state.results.size} titles"
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = Onyx.smoke,
                    )
                    Spacer(Modifier.height(14.dp))
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 200.dp),
                        horizontalArrangement = Arrangement.spacedBy(20.dp),
                        verticalArrangement = Arrangement.spacedBy(24.dp),
                        contentPadding = PaddingValues(bottom = 24.dp),
                    ) {
                        items(state.results, key = { it.id }) { title ->
                            PosterCard(title = title, onClick = { onOpen(title.slug) })
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Hint(text: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopStart) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = Onyx.smoke,
            modifier = Modifier.width(520.dp),
        )
    }
}

/** The keys, six to a row, with space and delete across the foot. */
@Composable
private fun Keyboard(
    onLetter: (String) -> Unit,
    onSpace: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LETTERS.chunked(6).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { letter ->
                    KeyCap(label = letter, onClick = { onLetter(letter) })
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KeyCap(label = SPACE, width = 164.dp, onClick = onSpace)
            KeyCap(label = BACK, width = 164.dp, onClick = onDelete)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun KeyCap(
    label: String,
    onClick: () -> Unit,
    width: androidx.compose.ui.unit.Dp = 48.dp,
) {
    Card(
        onClick = onClick,
        colors = CardDefaults.colors(
            containerColor = Onyx.ash,
            contentColor = Onyx.vein,
            // The key the remote is on turns to the accent, and its letter
            // to black, which is the only pairing on a television that reads
            // at a glance from across a room.
            focusedContainerColor = LocalAccent.current,
            focusedContentColor = Onyx.onyx,
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(2.dp, Onyx.vein),
            ),
        ),
        scale = CardDefaults.scale(focusedScale = 1.1f),
        modifier = Modifier.size(width = width, height = 48.dp),
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = label, style = MaterialTheme.typography.labelLarge)
        }
    }
}
