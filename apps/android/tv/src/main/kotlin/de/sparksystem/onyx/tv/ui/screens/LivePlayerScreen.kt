// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui.screens

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.Remote
import de.sparksystem.onyx.data.Channel
import de.sparksystem.onyx.data.Programme
import de.sparksystem.onyx.isPress
import de.sparksystem.onyx.ui.LiveState
import de.sparksystem.onyx.ui.behindLive
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.ui.momentOf
import de.sparksystem.onyx.ui.positionAt
import de.sparksystem.onyx.ui.programmeAt
import de.sparksystem.onyx.ui.progressOf
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.tv.ui.theme.Safe
import de.sparksystem.onyx.tv.ui.theme.oneLine
import kotlinx.coroutines.delay

/** How long the banner stays after a change of channel. */
private const val BANNER_MS = 5000L
/** How long a typed number waits for another digit before it tunes. */
private const val TUNE_AFTER_MS = 1400L
private const val SKIP_MS = 30_000L

/**
 * A live channel on a television.
 *
 * The keys are the ones a viewer already knows: the digits tune, the channel
 * keys and the up and down arrows step through the lineup, left and right go
 * back and forward in what the channel keeps, and the guide key opens the
 * guide. After every change a banner says where they have landed.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun LivePlayerScreen(
    state: LiveState,
    programmes: List<Programme>,
    /** A moment of the world the viewer picked in the guide, or null. */
    goBackTo: Long?,
    onWentBack: () -> Unit,
    onZap: (Int) -> Unit,
    onNumber: (Int) -> Unit,
    onGuide: () -> Unit,
    onLineup: () -> Unit,
    onBack: () -> Unit,
) {
    val channel = state.watching ?: return
    val context = LocalContext.current
    val player = remember { ExoPlayer.Builder(context).build().apply { playWhenReady = true } }

    var playing by remember { mutableStateOf(true) }
    var position by remember { mutableLongStateOf(0L) }
    /** Where the live edge is in the video. */
    var edge by remember { mutableLongStateOf(0L) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var digits by remember { mutableStateOf("") }
    var bannerShown by remember { mutableStateOf(true) }
    var controlsShown by remember { mutableStateOf(false) }
    var wake by remember { mutableLongStateOf(0L) }
    val focus = remember { FocusRequester() }

    // Each address is signed and for one channel, so a change of channel
    // builds a new item rather than seeking inside the old one.
    val address = state.playback?.url
    DisposableEffect(address) {
        if (address == null) {
            return@DisposableEffect onDispose { }
        }
        player.setMediaItem(MediaItem.fromUri(address))
        player.prepare()
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
            }
        }
        player.addListener(listener)
        onDispose { player.removeListener(listener) }
    }

    DisposableEffect(player) {
        onDispose { player.release() }
    }

    LaunchedEffect(player) {
        while (true) {
            position = player.currentPosition
            // On a live stream the end of what can be sought to is the live
            // edge, and how much is before it is what the channel still keeps.
            val window = player.duration
            edge = if (window == C.TIME_UNSET) 0L else window
            now = System.currentTimeMillis()
            delay(500)
        }
    }

    // The banner comes up on every change and goes away by itself.
    LaunchedEffect(state.bannerSignal, channel.slug) {
        bannerShown = true
        delay(BANNER_MS)
        bannerShown = false
    }

    LaunchedEffect(wake) {
        if (wake == 0L) {
            return@LaunchedEffect
        }
        controlsShown = true
        delay(4500)
        controlsShown = false
    }

    // Digits are gathered the way a remote control gathers them: 1 waits, in
    // case 12 is coming, and tunes by itself when nothing longer could follow.
    LaunchedEffect(digits) {
        if (digits.isEmpty()) {
            return@LaunchedEffect
        }
        delay(TUNE_AFTER_MS)
        digits.toIntOrNull()?.let(onNumber)
        digits = ""
    }

    LaunchedEffect(Unit) { focus.requestFocus() }

    // A programme picked in the guide. Where it lies in the video can only be
    // worked out once the player knows how much of the channel it holds, so
    // the request waits here for that.
    LaunchedEffect(goBackTo, edge) {
        val moment = goBackTo ?: return@LaunchedEffect
        if (edge <= 0) {
            return@LaunchedEffect
        }
        val at = positionAt(moment, System.currentTimeMillis(), edge, edge)
        if (at != null) {
            player.seekTo(at)
            wake = System.currentTimeMillis()
        }
        // Met or not, the request is done: a moment the channel no longer
        // keeps is not worth holding on to.
        onWentBack()
    }

    val keeps = channel.keeps && edge > 0
    val behindMs = (edge - position).coerceAtLeast(0)
    /** What the picture is showing, which is not "now" once the viewer goes back. */
    val watching = programmeAt(programmes, now - behindMs) ?: channel.now

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .focusRequester(focus)
            .focusable()
            .onPreviewKeyEvent { event ->
                val digit = Remote.digitOf(event.key)
                when {
                    digit != null && event.type == KeyEventType.KeyDown -> {
                        digits = (digits + digit).take(4)
                        true
                    }
                    event.isPress(listOf(Key.DirectionUp, Remote.channelUp)) -> {
                        onZap(-1)
                        true
                    }
                    event.isPress(listOf(Key.DirectionDown, Remote.channelDown)) -> {
                        onZap(1)
                        true
                    }
                    event.isPress(listOf(Remote.guide, Key.G)) -> {
                        onGuide()
                        true
                    }
                    event.isPress(listOf(Key.Enter, Key.DirectionCenter, Remote.info)) -> {
                        wake = System.currentTimeMillis()
                        true
                    }
                    event.isPress(listOf(Remote.playPause, Remote.pause, Remote.play)) -> {
                        if (player.isPlaying) player.pause() else player.play()
                        wake = System.currentTimeMillis()
                        true
                    }
                    keeps && event.isPress(listOf(Key.DirectionLeft, Remote.rewind)) -> {
                        player.seekTo((player.currentPosition - SKIP_MS).coerceAtLeast(0))
                        wake = System.currentTimeMillis()
                        true
                    }
                    keeps && event.isPress(listOf(Key.DirectionRight, Remote.forward)) -> {
                        player.seekTo((player.currentPosition + SKIP_MS).coerceAtMost(edge))
                        wake = System.currentTimeMillis()
                        true
                    }
                    event.isPress(listOf(Remote.stop, Key.Back)) -> {
                        onBack()
                        true
                    }
                    else -> false
                }
            },
    ) {
        AndroidView(
            factory = { viewContext ->
                PlayerView(viewContext).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    setPlayer(player)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        val refusal = state.refusal
        if (refusal != null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(20.dp),
                ) {
                    Trouble(refusal)
                    AccentButton(text = "The channels", onClick = onLineup)
                }
            }
        } else if (state.playback == null) {
            Waiting("Tuning in to ${channel.name}")
        }

        if (digits.isNotEmpty()) {
            NumberTuner(
                digits = digits,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = Safe.vertical, end = Safe.horizontal),
            )
        }

        if (bannerShown || controlsShown) {
            Banner(
                channel = channel,
                watching = watching,
                behind = if (keeps && behindMs > 45_000) behindLive(behindMs / 1000) else null,
                now = now,
                modifier = Modifier.align(Alignment.TopStart),
            )
        }

        if (controlsShown) {
            LiveControls(
                keeps = keeps,
                playing = playing,
                position = position,
                edge = edge,
                programmes = programmes,
                now = now,
                onSeek = player::seekTo,
            )
        }
    }
}

/** The digits of a channel number as they are typed. */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun NumberTuner(digits: String, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.background(Onyx.coal.copy(alpha = 0.92f)).padding(28.dp, 18.dp),
    ) {
        Text(
            text = digits,
            style = MaterialTheme.typography.displayLarge.copy(letterSpacing = 8.sp),
        )
    }
}

/**
 * What a television shows after a change of channel: the number, the name,
 * what is on and how far through it is, and what follows.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Banner(
    channel: Channel,
    watching: Programme?,
    behind: String?,
    now: Long,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxWidth()) {
        Spacer(
            Modifier
                .fillMaxWidth()
                .height(220.dp)
                .background(
                    Brush.verticalGradient(
                        0f to Onyx.onyx.copy(alpha = 0.88f),
                        1f to Onyx.onyx.copy(alpha = 0f),
                    ),
                ),
        )
        Column(
            modifier = Modifier.padding(horizontal = Safe.horizontal, vertical = Safe.vertical),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (channel.number != null) {
                    Text(
                        text = channel.number.toString(),
                        style = MaterialTheme.typography.displayMedium,
                        color = LocalAccent.current,
                    )
                    Spacer(Modifier.width(18.dp))
                }
                Text(
                    text = channel.name,
                    style = MaterialTheme.typography.headlineMedium,
                    maxLines = 1,
                    overflow = oneLine,
                    modifier = Modifier.width(620.dp),
                )
                if (behind != null) {
                    Spacer(Modifier.width(20.dp))
                    Text(
                        text = behind,
                        style = MaterialTheme.typography.labelMedium,
                        color = LocalAccent.current,
                    )
                }
            }
            if (watching != null) {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = watching.title,
                        style = MaterialTheme.typography.bodyLarge,
                        maxLines = 1,
                        overflow = oneLine,
                        modifier = Modifier.width(520.dp),
                    )
                    Spacer(Modifier.width(16.dp))
                    Text(
                        text = "${clockOf(watching.startsAt)}–${clockOf(watching.endsAt)}",
                        style = MaterialTheme.typography.labelMedium,
                        color = Onyx.smoke,
                    )
                }
                Spacer(Modifier.height(10.dp))
                Box(
                    modifier = Modifier
                        .width(560.dp)
                        .height(3.dp)
                        .background(Onyx.vein.copy(alpha = 0.2f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(progressOf(watching, now))
                            .height(3.dp)
                            .background(LocalAccent.current),
                    )
                }
            }
            val next = channel.next
            if (next != null) {
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "Then ${clockOf(next.startsAt)}  ${next.title}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Onyx.smoke,
                    maxLines = 1,
                    overflow = oneLine,
                    modifier = Modifier.width(560.dp),
                )
            }
        }
    }
}

/**
 * The bar of what the channel keeps, with a mark where each programme began,
 * so that going back lands on a beginning rather than in the middle.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun LiveControls(
    keeps: Boolean,
    playing: Boolean,
    position: Long,
    edge: Long,
    programmes: List<Programme>,
    now: Long,
    onSeek: (Long) -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Spacer(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .fillMaxHeight(0.34f)
                .background(
                    Brush.verticalGradient(
                        0f to Onyx.onyx.copy(alpha = 0f),
                        1f to Onyx.onyx.copy(alpha = 0.92f),
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = Safe.horizontal, vertical = Safe.vertical)
                .fillMaxWidth(),
        ) {
            if (keeps && edge > 0) {
                val through = (position.toFloat() / edge).coerceIn(0f, 1f)
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .background(Onyx.vein.copy(alpha = 0.25f)),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(through)
                            .height(6.dp)
                            .background(LocalAccent.current),
                    )
                    // Where each programme began inside what is kept. The
                    // marks are drawn rather than made focusable: a bar on a
                    // television is walked with the arrows, not tabbed through.
                    val windowStart = now - edge
                    for (programme in programmes) {
                        val began = momentOf(programme.startsAt) ?: continue
                        if (began <= windowStart || began >= now) {
                            continue
                        }
                        val at = (began - windowStart).toFloat() / edge
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(at)
                                .height(6.dp),
                            contentAlignment = Alignment.CenterEnd,
                        ) {
                            Spacer(
                                Modifier
                                    .width(2.dp)
                                    .height(12.dp)
                                    .background(Onyx.vein.copy(alpha = 0.8f)),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
            Text(
                text = when {
                    !playing -> "Paused   ·   OK plays   ·   ↑ ↓ change channel"
                    keeps -> "← → 30 seconds   ·   ↑ ↓ change channel   ·   digits tune   ·   Guide"
                    else -> "↑ ↓ change channel   ·   digits tune   ·   Guide"
                },
                style = MaterialTheme.typography.labelMedium,
                color = Onyx.smoke,
            )
        }
    }
}
