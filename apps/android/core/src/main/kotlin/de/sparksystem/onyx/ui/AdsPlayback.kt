// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import de.sparksystem.onyx.data.AdBreak
import de.sparksystem.onyx.data.AdFailure
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** How long an ad has to put its first frame on the screen, in milliseconds. */
private const val START_TIMEOUT_MS = 8000L

/**
 * Plays a video and its ads through one player.
 *
 * The same player takes turns: an ad is loaded in place of the video, and the
 * video is loaded again where it stopped when the ad is over. The television
 * and the phone share this and differ only in what they draw over it.
 *
 * Whatever goes wrong with an ad, the video goes on. An ad that does not start
 * in time, a file the player cannot read and an answer that never comes all end
 * the same way: the break is over.
 */
class AdsPlayback(
    private val player: Player,
    private val director: AdsDirector?,
    private val contentUrl: String,
    private val startAtMs: Long,
    private val scope: CoroutineScope,
    private val onContentEnded: () -> Unit,
) : Player.Listener {

    /** The ad that is on the screen, or null while the video plays. */
    var current by mutableStateOf<ReadyAd?>(null)
        private set

    /** How far the ad has played, in milliseconds. */
    var elapsedMs by mutableLongStateOf(0L)
        private set

    /** Waiting for the answer of an ad server, with the video held. */
    var waiting by mutableStateOf(false)
        private set

    private var resumeAt = startAtMs
    private var afterTheEnd = false
    private var released = false

    fun attach() {
        player.addListener(this)
        director?.startedAt(startAtMs)
        scope.launch {
            waiting = true
            val ad = director?.before()
            waiting = false
            if (ad != null) {
                resumeAt = startAtMs
                playAd(ad)
            } else {
                playContent(startAtMs)
            }
        }
    }

    fun detach() {
        released = true
        player.removeListener(this)
    }

    /** Called often while playing. Sets off a break in the middle when one is reached. */
    fun tick() {
        val ad = current
        if (ad != null) {
            elapsedMs = player.currentPosition
            ad.run.progress(elapsedMs, player.duration.takeIf { it > 0 } ?: 0L)
            return
        }
        if (waiting || afterTheEnd) {
            return
        }
        val reached = director?.reached(player.currentPosition) ?: return
        interrupt(reached)
    }

    private fun interrupt(found: AdBreak) {
        resumeAt = player.currentPosition
        player.pause()
        scope.launch {
            waiting = true
            val ad = director?.resolve(found)
            waiting = false
            if (released) {
                return@launch
            }
            if (ad != null) {
                playAd(ad)
            } else {
                player.play()
            }
        }
    }

    /** Skips the ad, if it allows it now. */
    fun skip() {
        val ad = current ?: return
        if (ad.run.skip(elapsedMs)) {
            endAd()
        }
    }

    /** The viewer opened the advertiser's page. Gives its address, or null. */
    fun clickThrough(): String? {
        val ad = current ?: return null
        ad.run.click(elapsedMs)
        return ad.ad.clickThrough
    }

    private fun playContent(from: Long) {
        player.setMediaItem(MediaItem.fromUri(contentUrl))
        if (from > 0) {
            player.seekTo(from)
        }
        player.prepare()
        player.play()
    }

    private fun playAd(ready: ReadyAd) {
        current = ready
        elapsedMs = 0L
        player.setMediaItem(MediaItem.fromUri(ready.ad.mediaUrl))
        player.prepare()
        player.play()
        scope.launch {
            delay(START_TIMEOUT_MS)
            if (current === ready && !ready.run.hasStarted) {
                ready.run.fail(AdFailure.Timeout)
                endAd()
            }
        }
    }

    private fun endAd() {
        current = null
        elapsedMs = 0L
        if (afterTheEnd) {
            onContentEnded()
        } else {
            playContent(resumeAt)
        }
    }

    // --- What the player says ---------------------------------------------------

    override fun onPlaybackStateChanged(playbackState: Int) {
        val ad = current
        when {
            playbackState == Player.STATE_READY && ad != null -> {
                ad.run.begin(player.duration.takeIf { it > 0 } ?: 0L)
            }
            playbackState == Player.STATE_ENDED && ad != null -> {
                ad.run.complete()
                endAd()
            }
            playbackState == Player.STATE_ENDED && !afterTheEnd -> {
                afterTheEnd = true
                scope.launch {
                    waiting = true
                    val last = director?.after()
                    waiting = false
                    if (last != null) {
                        playAd(last)
                    } else {
                        onContentEnded()
                    }
                }
            }
        }
    }

    override fun onPlayerError(error: PlaybackException) {
        val ad = current ?: return
        ad.run.fail(AdFailure.Media)
        endAd()
    }
}
