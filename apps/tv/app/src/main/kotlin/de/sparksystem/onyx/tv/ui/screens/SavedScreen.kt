// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.tv.ui.SavedState
import de.sparksystem.onyx.tv.ui.components.PosterCard
import de.sparksystem.onyx.tv.ui.components.SectionHeading
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.tv.ui.theme.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe

/**
 * The titles a viewer put aside for later. One grid, newest first, because
 * that is the order a list of intentions is read in.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
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
            .padding(horizontal = Safe.horizontal, vertical = Safe.vertical),
    ) {
        SectionHeading(text = "My list")
        Spacer(Modifier.height(20.dp))

        if (state.trouble != null && state.titles.isEmpty()) {
            Trouble(state.trouble)
            return@Column
        }

        if (state.titles.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopStart) {
                Text(
                    text = "Nothing here yet. Open a title and press “Add to my list” to " +
                        "put it aside for later.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = Onyx.smoke,
                    textAlign = TextAlign.Start,
                    modifier = Modifier.width(620.dp),
                )
            }
            return@Column
        }

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 200.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalArrangement = Arrangement.spacedBy(26.dp),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            items(state.titles, key = { it.id }) { title ->
                PosterCard(title = title, onClick = { onOpen(title.slug) })
            }
        }
    }
}
