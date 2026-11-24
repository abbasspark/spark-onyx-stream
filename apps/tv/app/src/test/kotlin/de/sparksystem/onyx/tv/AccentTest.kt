// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv

import androidx.compose.ui.graphics.Color
import de.sparksystem.onyx.tv.ui.parseAccent
import de.sparksystem.onyx.tv.ui.theme.Onyx
import org.junit.Assert.assertEquals
import org.junit.Test

class AccentTest {
    @Test
    fun `an operator's colour is used as it is`() {
        assertEquals(Color(0xFF4FC3F7), parseAccent("#4fc3f7"))
        assertEquals(Color(0xFF4FC3F7), parseAccent("4FC3F7"))
    }

    @Test
    fun `anything that is not a colour falls back on the one the app ships with`() {
        assertEquals(Onyx.sard, parseAccent(null))
        assertEquals(Onyx.sard, parseAccent(""))
        assertEquals(Onyx.sard, parseAccent("red"))
        assertEquals(Onyx.sard, parseAccent("#fff"))
        assertEquals(Onyx.sard, parseAccent("#zzzzzz"))
    }
}
