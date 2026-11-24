// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.mobile.ui.screens

import android.app.Activity
import android.content.pm.ActivityInfo
import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.clock
import de.sparksystem.onyx.mobile.ui.components.AccentButton
import de.sparksystem.onyx.mobile.ui.components.Trouble
import de.sparksystem.onyx.mobile.ui.components.Waiting
import de.sparksystem.onyx.mobile.ui.theme.LocalAccent
import de.sparksystem.onyx.mobile.ui.theme.oneLine
import de.sparksystem.onyx.ui.PlayingState
import de.sparksystem.onyx.ui.endOf
import de.sparksystem.onyx.ui.runningMarker
import de.sparksystem.onyx.ui.skipLabel
import kotlinx.coroutines.delay

private const val HIDE_AFTER_MS = 3500L
private const val SKIP_MS = 10_000L

/**
 * The player in a hand.
 *
 * Nothing here is the television's. A phone is held sideways, the controls
 * come and go with a tap on the picture, the bar is dragged rather than
 * walked, and the buttons are sized for a thumb on a moving train.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    state: PlayingState,
    onProgress: (positionMs: Long, durationMs: Long) -> Unit,
    onEnded: () -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current

    // A video is watched sideways. The phone is turned for the player and
    // turned back on the way out, so the rest of the app stays upright.
    DisposableEffect(Unit) {
        val activity = context as? Activity
        val before = activity?.requestedOrientation
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        onDispose {
            activity?.requestedOrientation = before ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    if (state.loading) {
        Waiting("Starting ${state.heading}")
        return
    }
    val playback = state.playback
    if (playback == null) {
        Box(
            modifier = Modifier.fillMaxSize().background(Onyx.onyx).padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Trouble(state.trouble ?: "This could not be played.")
                AccentButton(text = "Back", onClick = onBack)
            }
        }
        return
    }

    val player = remember { ExoPlayer.Builder(context).build().apply { playWhenReady = true } }

    var playing by remember { mutableStateOf(true) }
    var position by remember { mutableLongStateOf(state.startAtMs) }
    var duration by remember { mutableLongStateOf(0L) }
    var shown by remember { mutableStateOf(true) }
    var wake by remember { mutableLongStateOf(0L) }
    /** Where the thumb is while the bar is being dragged, or -1 when it is not. */
    var dragging by remember { mutableFloatStateOf(-1f) }

    DisposableEffect(playback.manifestUrl) {
        player.setMediaItem(MediaItem.fromUri(playback.manifestUrl))
        if (state.startAtMs > 0) {
            player.seekTo(state.startAtMs)
        }
        player.prepare()
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    onEnded()
                }
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    LaunchedEffect(player) {
        while (true) {
            if (dragging < 0f) {
                position = player.currentPosition
            }
            val length = player.duration
            duration = if (length == C.TIME_UNSET) 0L else length
            onProgress(player.currentPosition, duration)
            delay(500)
        }
    }

    LaunchedEffect(wake, playing) {
        if (!playing) {
            shown = true
            return@LaunchedEffect
        }
        shown = true
        delay(HIDE_AFTER_MS)
        shown = false
    }

    val marker = runningMarker(playback.markers, position, duration)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .pointerInput(Unit) {
                detectTapGestures(
                    // A tap brings the controls up, or puts them away again.
                    onTap = {
                        shown = !shown
                        if (shown) {
                            wake = System.currentTimeMillis()
                        }
                    },
                    // A double tap on a side skips, the way every player on a
                    // phone does it, without having to find a small button.
                    onDoubleTap = { offset ->
                        val forward = offset.x > size.width / 2
                        val to = if (forward) {
                            (player.currentPosition + SKIP_MS).coerceAtMost(maxOf(duration, 0L))
                        } else {
                            (player.currentPosition - SKIP_MS).coerceAtLeast(0L)
                        }
                        player.seekTo(to)
                        position = to
                        wake = System.currentTimeMillis()
                    },
                )
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

        if (marker != null) {
            AccentButton(
                text = skipLabel(marker.kind),
                onClick = { player.seekTo(endOf(marker, duration)) },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 20.dp, bottom = if (shown) 104.dp else 24.dp),
            )
        }

        if (shown) {
            // Top: what is playing, and the way out.
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            0f to Onyx.onyx.copy(alpha = 0.8f),
                            1f to Onyx.onyx.copy(alpha = 0f),
                        ),
                    )
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Onyx.vein)
                }
                Column(modifier = Modifier.padding(start = 4.dp)) {
                    Text(
                        text = state.heading,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = oneLine,
                    )
                    val detail = state.detail
                    if (detail != null) {
                        Text(
                            text = detail,
                            style = MaterialTheme.typography.labelMedium,
                            color = Onyx.smoke,
                            maxLines = 1,
                            overflow = oneLine,
                        )
                    }
                }
            }

            // Middle: the three buttons a thumb reaches for.
            Row(
                modifier = Modifier.align(Alignment.Center),
                horizontalArrangement = Arrangement.spacedBy(28.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = {
                        player.seekTo((player.currentPosition - SKIP_MS).coerceAtLeast(0))
                        wake = System.currentTimeMillis()
                    },
                    modifier = Modifier.size(56.dp),
                ) {
                    Icon(
                        Icons.Default.Replay10,
                        contentDescription = "Back ten seconds",
                        tint = Onyx.vein,
                        modifier = Modifier.size(36.dp),
                    )
                }
                IconButton(
                    onClick = {
                        if (player.isPlaying) player.pause() else player.play()
                        wake = System.currentTimeMillis()
                    },
                    modifier = Modifier.size(68.dp),
                ) {
                    Icon(
                        if (playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (playing) "Pause" else "Play",
                        tint = Onyx.vein,
                        modifier = Modifier.size(48.dp),
                    )
                }
                IconButton(
                    onClick = {
                        player.seekTo((player.currentPosition + SKIP_MS).coerceAtMost(maxOf(duration, 0L)))
                        wake = System.currentTimeMillis()
                    },
                    modifier = Modifier.size(56.dp),
                ) {
                    Icon(
                        Icons.Default.Forward10,
                        contentDescription = "Forward ten seconds",
                        tint = Onyx.vein,
                        modifier = Modifier.size(36.dp),
                    )
                }
            }

            // Foot: where the viewer is, and a bar to drag.
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            0f to Onyx.onyx.copy(alpha = 0f),
                            1f to Onyx.onyx.copy(alpha = 0.85f),
                        ),
                    )
                    .padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Slider(
                    value = if (dragging >= 0f) dragging else position.toFloat(),
                    onValueChange = { value ->
                        dragging = value
                        position = value.toLong()
                    },
                    onValueChangeFinished = {
                        if (dragging >= 0f) {
                            player.seekTo(dragging.toLong())
                            dragging = -1f
                        }
                        wake = System.currentTimeMillis()
                    },
                    valueRange = 0f..maxOf(duration.toFloat(), 1f),
                    colors = SliderDefaults.colors(
                        thumbColor = LocalAccent.current,
                        activeTrackColor = LocalAccent.current,
                        inactiveTrackColor = Onyx.vein.copy(alpha = 0.25f),
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = clock(position),
                        style = MaterialTheme.typography.labelMedium,
                        color = Onyx.vein,
                    )
                    Text(
                        text = clock(duration),
                        style = MaterialTheme.typography.labelMedium,
                        color = Onyx.smoke,
                    )
                }
            }
        }
    }
}
