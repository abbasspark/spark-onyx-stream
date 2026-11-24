// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.mobile.ui.theme.GUTTER
import de.sparksystem.onyx.mobile.ui.theme.LocalAccent
import de.sparksystem.onyx.mobile.ui.theme.TOUCH_TARGET

/** The mark of the site: three bands of banded stone, the middle one amber. */
@Composable
fun BandMark(modifier: Modifier = Modifier, width: Int = 32) {
    Column(
        modifier = modifier.width(width.dp),
        verticalArrangement = Arrangement.spacedBy((width / 9f).dp),
    ) {
        Spacer(Modifier.fillMaxWidth().height((width / 4.5f).dp).background(Onyx.vein))
        Spacer(Modifier.fillMaxWidth().height((width / 11f).dp).background(LocalAccent.current))
        Spacer(
            Modifier
                .fillMaxWidth()
                .height((width / 5f).dp)
                .background(Onyx.vein.copy(alpha = 0.55f)),
        )
    }
}

/** The small bands that stand before a heading, as on the website. */
@Composable
fun HeadingBands(modifier: Modifier = Modifier) {
    Column(modifier = modifier.width(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Spacer(Modifier.fillMaxWidth().height(2.dp).background(LocalAccent.current))
        Spacer(Modifier.fillMaxWidth().height(2.dp).background(Onyx.vein.copy(alpha = 0.4f)))
        Spacer(Modifier.fillMaxWidth().height(2.dp).background(Onyx.vein.copy(alpha = 0.15f)))
    }
}

/** A heading over a row or a block, with the bands before it. */
@Composable
fun SectionHeading(text: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        HeadingBands()
        Spacer(Modifier.width(10.dp))
        Text(text = text, style = MaterialTheme.typography.headlineMedium)
    }
}

/**
 * The button that does the main thing on a screen. Filled with the accent,
 * and never shorter than a thumb can hit without looking.
 */
@Composable
fun AccentButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(3.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = LocalAccent.current,
            contentColor = Onyx.onyx,
            disabledContainerColor = Onyx.ash,
            disabledContentColor = Onyx.dust,
        ),
        modifier = modifier.heightIn(min = TOUCH_TARGET),
    ) {
        Text(text = text, style = MaterialTheme.typography.labelLarge)
    }
}

/** The second button beside it: outlined, quiet. */
@Composable
fun QuietButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    OutlinedButton(
        onClick = onClick,
        shape = RoundedCornerShape(3.dp),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Onyx.vein),
        modifier = modifier.heightIn(min = TOUCH_TARGET),
    ) {
        Text(text = text, style = MaterialTheme.typography.labelLarge)
    }
}

/** A screen with one thing to read and, usually, one thing to do. */
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
            .padding(horizontal = GUTTER, vertical = 28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.widthIn(max = 460.dp),
        ) {
            BandMark(width = 40)
            Spacer(Modifier.height(2.dp))
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
                )
            }
            content()
        }
    }
}

/** What the app shows while it waits: a word, not a spinning wheel. */
@Composable
fun Waiting(what: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxSize().background(Onyx.onyx),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BandMark(width = 32)
            Spacer(Modifier.height(14.dp))
            Text(text = what, style = MaterialTheme.typography.bodyMedium, color = Onyx.smoke)
        }
    }
}

/** A line of trouble, in the one colour kept for it. */
@Composable
fun Trouble(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = Onyx.alarm,
        textAlign = TextAlign.Center,
        modifier = modifier,
    )
}

/** The hairline the site separates things with. */
@Composable
fun Hairline(modifier: Modifier = Modifier, color: Color = Onyx.line) {
    Spacer(modifier.fillMaxWidth().height(1.dp).background(color))
}
