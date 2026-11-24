// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx

import android.view.KeyEvent
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent as ComposeKeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.nativeKeyCode

/**
 * The keys of a remote control.
 *
 * A television remote is not a keyboard. Besides the four arrows and the
 * centre, it has the media keys, which Android sends as their own codes and
 * which a player is expected to answer; some remotes also send the channel
 * keys. They are named here so that the screens can read plainly.
 */
object Remote {
    val playPause = Key(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
    val play = Key(KeyEvent.KEYCODE_MEDIA_PLAY)
    val pause = Key(KeyEvent.KEYCODE_MEDIA_PAUSE)
    val stop = Key(KeyEvent.KEYCODE_MEDIA_STOP)
    val forward = Key(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD)
    val rewind = Key(KeyEvent.KEYCODE_MEDIA_REWIND)
    val next = Key(KeyEvent.KEYCODE_MEDIA_NEXT)
    val previous = Key(KeyEvent.KEYCODE_MEDIA_PREVIOUS)
    val channelUp = Key(KeyEvent.KEYCODE_CHANNEL_UP)
    val channelDown = Key(KeyEvent.KEYCODE_CHANNEL_DOWN)
    val info = Key(KeyEvent.KEYCODE_INFO)
    val guide = Key(KeyEvent.KEYCODE_GUIDE)

    /** The digits 0 to 9, for tuning a channel by its number. */
    fun digitOf(key: Key): Int? {
        val code = key.nativeKeyCode
        return if (code in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9) code - KeyEvent.KEYCODE_0 else null
    }
}

/** True for the moment a key goes down, which is the one that should act. */
fun ComposeKeyEvent.isPress(wanted: Key): Boolean =
    type == KeyEventType.KeyDown && key == wanted

/** The same for a handful of keys that all do the same thing. */
fun ComposeKeyEvent.isPress(wanted: List<Key>): Boolean =
    type == KeyEventType.KeyDown && wanted.contains(key)
