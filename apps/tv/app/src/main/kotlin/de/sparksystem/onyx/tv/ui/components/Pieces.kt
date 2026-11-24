// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.ButtonDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.tv.ui.theme.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe

/**
 * The mark of the site: three bands of banded stone, the middle one amber.
 * The same mark the website signs its pages with.
 */
@Composable
fun BandMark(modifier: Modifier = Modifier, width: Int = 48) {
    Column(
        modifier = modifier.width(width.dp),
        verticalArrangement = Arrangement.spacedBy((width / 9).dp),
    ) {
        Spacer(
            Modifier
                .fillMaxWidth()
                .height((width / 4.5).dp)
                .background(Onyx.vein),
        )
        Spacer(
            Modifier
                .fillMaxWidth()
                .height((width / 11).dp)
                .background(LocalAccent.current),
        )
        Spacer(
            Modifier
                .fillMaxWidth()
                .height((width / 5).dp)
                .background(Onyx.vein.copy(alpha = 0.55f)),
        )
    }
}

/**
 * The small bands that stand before a heading, as on the website: three
 * weights with the amber on top.
 */
@Composable
fun HeadingBands(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.width(18.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Spacer(Modifier.fillMaxWidth().height(3.dp).background(LocalAccent.current))
        Spacer(Modifier.fillMaxWidth().height(3.dp).background(Onyx.vein.copy(alpha = 0.4f)))
        Spacer(Modifier.fillMaxWidth().height(3.dp).background(Onyx.vein.copy(alpha = 0.15f)))
    }
}

/** A heading over a row or a block, with the bands before it. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun SectionHeading(text: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        HeadingBands()
        Spacer(Modifier.width(12.dp))
        Text(text = text, style = MaterialTheme.typography.headlineMedium)
    }
}

/**
 * A screen that fills the television with one thing to read and, usually,
 * one thing to do. Used for signing in, for failures and for waiting.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun Page(
    heading: String,
    modifier: Modifier = Modifier,
    note: String? = null,
    content: @Composable () -> Unit = {},
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .padding(horizontal = Safe.horizontal, vertical = Safe.vertical),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            BandMark(width = 56)
            Spacer(Modifier.height(4.dp))
            Text(
                text = heading,
                style = MaterialTheme.typography.displayMedium,
                textAlign = TextAlign.Center,
            )
            if (note != null) {
                Text(
                    text = note,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Onyx.smoke,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.width(680.dp),
                )
            }
            content()
        }
    }
}

/** The one button a page of this kind carries, in the accent of the service. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun AccentButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        modifier = modifier,
        colors = ButtonDefaults.colors(
            containerColor = Onyx.ash,
            contentColor = Onyx.vein,
            focusedContainerColor = LocalAccent.current,
            focusedContentColor = Onyx.onyx,
        ),
    ) {
        Text(text = text, style = MaterialTheme.typography.labelLarge)
    }
}

/** What the app shows while it waits: a word, not a spinning wheel. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun Waiting(what: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize().background(Onyx.onyx),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BandMark(width = 44)
            Spacer(Modifier.height(20.dp))
            Text(text = what, style = MaterialTheme.typography.bodyLarge, color = Onyx.smoke)
        }
    }
}

/** A line of trouble, in the one colour kept for it. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun Trouble(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = Onyx.alarm,
        textAlign = TextAlign.Center,
        modifier = modifier.width(680.dp),
    )
}

/** The hairline the site separates things with. */
@Composable
fun Hairline(modifier: Modifier = Modifier, color: Color = Onyx.line) {
    Spacer(modifier.fillMaxWidth().height(1.dp).background(color))
}
