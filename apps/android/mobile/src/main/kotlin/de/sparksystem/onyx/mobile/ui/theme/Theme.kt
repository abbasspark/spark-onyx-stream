// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
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
import de.sparksystem.onyx.Onyx

/**
 * The same stone in a hand.
 *
 * The palette is the shared one, and the arrangement is not. A television is
 * read from three metres away and a phone from thirty centimetres, so every
 * size here is smaller than its counterpart on the television and close to
 * the website's. What does not change is that the picture is the loud thing
 * and the interface is quiet around it.
 */

/** The accent an operator set for their service. */
val LocalAccent = staticCompositionLocalOf { Onyx.sard }

/** What a thumb can hit without looking. Android's own floor, and the right one. */
val TOUCH_TARGET = 48.dp

/** The margin the content keeps from the sides of a phone. */
val GUTTER = 20.dp

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
        outline = Onyx.line,
        outlineVariant = Onyx.line,
        error = Onyx.alarm,
        onError = Onyx.onyx,
        scrim = Onyx.onyx,
    )

/**
 * The type scale of the site, on a phone: a perfect fourth, set tight at the
 * display sizes and open in the body, with nothing below 12sp.
 */
private val typography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Black,
        fontSize = 34.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.7).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Black,
        fontSize = 26.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.4).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 23.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 18.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp,
    ),
)

@Composable
fun OnyxTheme(accent: Color = Onyx.sard, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalAccent provides accent) {
        MaterialTheme(colorScheme = colors, typography = typography, content = content)
    }
}

/** One line, cut with an ellipsis. Used wherever a title must not wrap. */
val oneLine = TextOverflow.Ellipsis
