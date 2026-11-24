// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx

import androidx.compose.ui.graphics.Color

/**
 * The colours of the site, which both apps wear.
 *
 * The same stone: true black, the warm white of the bands running through
 * it, and the amber of sardonyx as the one accent. Colour comes from the
 * artwork, not from the interface. How they are arranged differs between a
 * television across a room and a phone in a hand, and that part is each
 * app's own; these values are not.
 */
object Onyx {
    val onyx = Color(0xFF000000)
    val coal = Color(0xFF0D0D0E)
    val ash = Color(0xFF1A1A1C)
    val line = Color(0xFF2B2B2E)
    val vein = Color(0xFFF4F1EA)
    val smoke = Color(0xFFA9A6A0)
    val dust = Color(0xFF77746F)
    val sard = Color(0xFFE6A85C)
    val sardDeep = Color(0xFFC98A3B)
    val alarm = Color(0xFFFF8A7A)
}

/** "#e6a85c" as a colour, or the one the apps ship with. */
fun parseAccent(value: String?): Color {
    val hex = value?.trim()?.removePrefix("#")?.takeIf { it.length == 6 } ?: return Onyx.sard
    val number = hex.toLongOrNull(16) ?: return Onyx.sard
    return Color(0xFF000000 or number)
}

/** Milliseconds as a clock: 1:02:03, or 4:05 for anything under an hour. */
fun clock(milliseconds: Long): String {
    if (milliseconds <= 0) {
        return "0:00"
    }
    val whole = milliseconds / 1000
    val hours = whole / 3600
    val minutes = (whole % 3600) / 60
    val seconds = whole % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}
