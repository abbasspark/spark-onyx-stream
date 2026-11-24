// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.LocalContentColor
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import de.sparksystem.onyx.Onyx

/*
 * The look of the site, carried onto a television.
 *
 * The palette is the shared one. What changes across the room is scale, not
 * taste: every size here is larger than its counterpart on the web, because
 * a television is watched from three metres away and because a remote
 * control needs targets it can reach with four arrows rather than a pointer.
 */


/**
 * The accent an operator set for their service. The app reads it once, from
 * the server, and everything that marks what can be played follows it.
 */
val LocalAccent = staticCompositionLocalOf { Onyx.sard }

/**
 * How far in from the edge of the screen the picture may be trusted. Some
 * televisions still cut off the outermost part of what they are sent, so
 * nothing that has to be read sits closer to the edge than this.
 */
object Safe {
    val horizontal = 48.dp
    val vertical = 27.dp
}

private val colors
    @Composable get() = darkColorScheme(
        primary = LocalAccent.current,
        onPrimary = Onyx.onyx,
        secondary = Onyx.vein,
        onSecondary = Onyx.onyx,
        background = Onyx.onyx,
        onBackground = Onyx.vein,
        surface = Onyx.coal,
        onSurface = Onyx.vein,
        surfaceVariant = Onyx.ash,
        onSurfaceVariant = Onyx.smoke,
        border = Onyx.line,
        error = Onyx.alarm,
    )

/**
 * The type scale: the same perfect fourth the site is set on, read at the
 * distance a television is watched from. Nothing below 14sp, because below
 * that a caption cannot be read across a room.
 */
private val typography
    @Composable get() = MaterialTheme.typography.copy(
        displayLarge = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Black,
            fontSize = 56.sp,
            lineHeight = 60.sp,
            letterSpacing = (-1).sp,
        ),
        displayMedium = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Black,
            fontSize = 40.sp,
            lineHeight = 46.sp,
            letterSpacing = (-0.5).sp,
        ),
        headlineMedium = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Bold,
            fontSize = 28.sp,
            lineHeight = 34.sp,
        ),
        titleMedium = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.SemiBold,
            fontSize = 20.sp,
            lineHeight = 26.sp,
        ),
        bodyLarge = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 18.sp,
            lineHeight = 27.sp,
        ),
        bodyMedium = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Normal,
            fontSize = 16.sp,
            lineHeight = 24.sp,
        ),
        labelLarge = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
            lineHeight = 20.sp,
        ),
        labelMedium = TextStyle(
            fontFamily = FontFamily.SansSerif,
            fontWeight = FontWeight.Medium,
            fontSize = 14.sp,
            lineHeight = 18.sp,
            letterSpacing = 0.5.sp,
        ),
    )

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun OnyxTheme(accent: Color = Onyx.sard, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalAccent provides accent) {
        MaterialTheme(colorScheme = colors, typography = typography) {
            CompositionLocalProvider(LocalContentColor provides Onyx.vein, content = content)
        }
    }
}

/** The border a card wears while the remote control is on it. */
@Composable
fun focusBorder(): Border = Border(
    border = androidx.compose.foundation.BorderStroke(3.dp, LocalAccent.current),
)

/** One line, cut with an ellipsis. Used wherever a title must not wrap. */
val oneLine = TextOverflow.Ellipsis
