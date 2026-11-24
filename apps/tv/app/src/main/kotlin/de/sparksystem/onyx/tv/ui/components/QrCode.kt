// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.components

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import de.sparksystem.onyx.tv.ui.theme.Onyx

/**
 * The address as a square a phone can read.
 *
 * Typing an address into a television with four arrows is the worst part of
 * signing in, so the app offers a square instead and the viewer finishes on
 * the phone already in their hand.
 *
 * It is drawn in the warm white of the site on true black, which readers
 * handle: what they need is contrast, not black on white.
 */
@Composable
fun QrCode(content: String, modifier: Modifier = Modifier, size: Int = 420) {
    val bitmap = remember(content, size) { encode(content, size) } ?: return
    Image(
        bitmap = bitmap.asImageBitmap(),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = modifier,
    )
}

private fun encode(content: String, size: Int): Bitmap? {
    if (content.isBlank()) {
        return null
    }
    return runCatching {
        val hints = mapOf(
            // A square that may be read from a sofa, across a room, by a
            // phone held at an angle: the highest correction is worth its size.
            EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.H,
            EncodeHintType.MARGIN to 2,
            EncodeHintType.CHARACTER_SET to "UTF-8",
        )
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, hints)
        val dark = Onyx.vein.toArgb()
        val light = Onyx.onyx.toArgb()
        val pixels = IntArray(size * size)
        for (y in 0 until size) {
            val row = y * size
            for (x in 0 until size) {
                pixels[row + x] = if (matrix.get(x, y)) dark else light
            }
        }
        Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888)
    }.getOrNull()
}
