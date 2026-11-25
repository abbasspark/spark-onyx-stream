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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.onPreviewKeyEvent
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
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import de.sparksystem.onyx.Remote
import de.sparksystem.onyx.isPress
import de.sparksystem.onyx.data.skipState
import de.sparksystem.onyx.ui.AdsPlayback
import de.sparksystem.onyx.ui.PlayingState
import de.sparksystem.onyx.tv.ui.components.AccentButton
import de.sparksystem.onyx.tv.ui.components.Trouble
import de.sparksystem.onyx.tv.ui.components.Waiting
import de.sparksystem.onyx.ui.endOf
import de.sparksystem.onyx.ui.runningMarker
import de.sparksystem.onyx.ui.skipLabel
import de.sparksystem.onyx.tv.ui.theme.LocalAccent
import de.sparksystem.onyx.Onyx
import de.sparksystem.onyx.clock
import de.sparksystem.onyx.tv.ui.theme.Safe
import de.sparksystem.onyx.tv.ui.theme.oneLine
import kotlinx.coroutines.delay

/** How long the controls stay after the last press of the remote. */
private const val HIDE_AFTER_MS = 4000L
private const val SKIP_MS = 10_000L

/**
 * The player on a television.
 *
 * A remote control has four arrows and a centre, so everything here is built
 * out of those: left and right skip, the centre plays and pauses, down opens
 * the controls, and back leaves. The media keys some remotes carry do what
 * they say. Nothing needs a pointer.
 */
/*
 * The player view and its resize modes are marked unstable by Media3, which
 * means they may change between versions of the library, not that they are
 * unfinished. Every player built on Media3 uses them, and the version is
 * pinned here, so the opt-in is taken deliberately.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun PlayerScreen(
    state: PlayingState,
    onProgress: (positionMs: Long, durationMs: Long) -> Unit,
    onEnded: () -> Unit,
    onBack: () -> Unit,
) {
    if (state.loading) {
        Waiting("Starting ${state.heading}")
        return
    }
    val playback = state.playback
    if (playback == null) {
        Box(
            modifier = Modifier.fillMaxSize().background(Onyx.onyx),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Trouble(state.trouble ?: "This could not be played.")
                AccentButton(text = "Back", onClick = onBack)
            }
        }
        return
    }

    val context = LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            playWhenReady = true
        }
    }

    var playing by remember { mutableStateOf(true) }
    var position by remember { mutableLongStateOf(state.startAtMs) }
    var duration by remember { mutableLongStateOf(0L) }
    var buffered by remember { mutableLongStateOf(0L) }
    var controlsShown by remember { mutableStateOf(true) }
    var wake by remember { mutableLongStateOf(0L) }
    val focus = remember { FocusRequester() }

    val scope = rememberCoroutineScope()
    val ads = remember(playback.manifestUrl) {
        AdsPlayback(
            player = player,
            director = state.ads,
            contentUrl = playback.manifestUrl,
            startAtMs = state.startAtMs,
            scope = scope,
            onContentEnded = onEnded,
        )
    }

    DisposableEffect(ads) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
            }
        }
        player.addListener(listener)
        // The video, and the ads around it, start here.
        ads.attach()
        onDispose {
            ads.detach()
            player.removeListener(listener)
            player.release()
        }
    }

    // Where the video is, read often enough for a seek bar to look alive and
    // rarely enough to cost nothing.
    LaunchedEffect(player) {
        while (true) {
            position = player.currentPosition
            buffered = player.bufferedPosition
            val length = player.duration
            duration = if (length == C.TIME_UNSET) 0L else length
            ads.tick()
            // What an ad does is not what the viewer watched.
            if (ads.current == null) {
                onProgress(position, duration)
            }
            delay(500)
        }
    }

    // The controls go away by themselves while the picture runs.
    LaunchedEffect(wake, playing) {
        if (!playing) {
            controlsShown = true
            return@LaunchedEffect
        }
        controlsShown = true
        delay(HIDE_AFTER_MS)
        controlsShown = false
    }

    LaunchedEffect(Unit) { focus.requestFocus() }

    val inAd = ads.current != null
    val marker = if (inAd) null else runningMarker(playback.markers, position, duration)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .focusRequester(focus)
            .focusable()
            .onPreviewKeyEvent { event ->
                val playPause = listOf(Remote.playPause, Remote.play, Remote.pause, Key.Enter, Key.DirectionCenter)
                val forward = listOf(Key.DirectionRight, Remote.forward)
                val back = listOf(Key.DirectionLeft, Remote.rewind)
                when {
                // During an ad the remote does two things: leave, and skip when allowed.
                inAd -> when {
                    event.isPress(listOf(Remote.stop, Key.Back)) -> {
                        onBack()
                        true
                    }
                    event.isPress(playPause + listOf(Remote.next)) -> {
                        ads.skip()
                        true
                    }
                    else -> true
                }
                event.isPress(playPause) -> {
                        if (player.isPlaying) player.pause() else player.play()
                        wake = System.currentTimeMillis()
                        true
                    }
                    event.isPress(forward) -> {
                        player.seekTo((player.currentPosition + SKIP_MS).coerceAtMost(maxOf(duration, 0L)))
                        wake = System.currentTimeMillis()
                        true
                    }
                    event.isPress(back) -> {
                        player.seekTo((player.currentPosition - SKIP_MS).coerceAtLeast(0L))
                        wake = System.currentTimeMillis()
                        true
                    }
                    event.isPress(Key.DirectionDown) || event.isPress(Key.DirectionUp) -> {
                        wake = System.currentTimeMillis()
                        true
                    }
                    event.isPress(listOf(Remote.stop, Key.Back)) -> {
                        onBack()
                        true
                    }
                    // The one key that skips the stretch that is running.
                    event.isPress(listOf(Remote.next)) && marker != null -> {
                        player.seekTo(endOf(marker, duration))
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

        if (marker != null) {
            AccentButton(
                text = skipLabel(marker.kind),
                onClick = { player.seekTo(endOf(marker, duration)) },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = Safe.horizontal, bottom = 180.dp),
            )
        }

        ads.current?.let { ready ->
            AdBadge(
                skipOffsetMs = ready.ad.skipOffsetMs,
                elapsedMs = ads.elapsedMs,
                remainingMs = (duration - position).coerceAtLeast(0L),
            )
        }
        if (ads.waiting) {
            Waiting("")
        }

        if (controlsShown && !inAd) {
            Controls(
                heading = state.heading,
                detail = state.detail,
                playing = playing,
                position = position,
                duration = duration,
                buffered = buffered,
            )
        }
    }
}

/**
 * What the viewer sees while the controls are up: where they are, how long
 * is left, and what the keys do. There is nothing to click, because there is
 * nothing on a television to click with.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Controls(
    heading: String,
    detail: String?,
    playing: Boolean,
    position: Long,
    duration: Long,
    buffered: Long,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Spacer(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .fillMaxHeight(0.42f)
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
            Text(
                text = heading,
                style = MaterialTheme.typography.headlineMedium,
                maxLines = 1,
                overflow = oneLine,
            )
            if (detail != null) {
                Text(
                    text = detail,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Onyx.smoke,
                    maxLines = 1,
                    overflow = oneLine,
                )
            }
            Spacer(Modifier.height(18.dp))
            SeekBar(position = position, duration = duration, buffered = buffered)
            Spacer(Modifier.height(10.dp))
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
                    text = if (playing) {
                        "OK pauses   ·   ← → skip 10 seconds"
                    } else {
                        "Paused   ·   OK plays"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = Onyx.smoke,
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

/** The band: what is loaded a little lighter, what is watched in the accent. */
@Composable
private fun SeekBar(position: Long, duration: Long, buffered: Long) {
    val through = if (duration > 0) (position.toFloat() / duration).coerceIn(0f, 1f) else 0f
    val loaded = if (duration > 0) (buffered.toFloat() / duration).coerceIn(0f, 1f) else 0f
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .background(Onyx.vein.copy(alpha = 0.25f)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(loaded)
                .height(6.dp)
                .background(Onyx.vein.copy(alpha = 0.35f)),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth(through)
                .height(6.dp)
                .background(LocalAccent.current),
        )
    }
}

/**
 * What the viewer sees over an ad: that it is one, how long is left, and when
 * the remote can skip it. Nothing else answers during an ad, so nothing else
 * is drawn.
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun AdBadge(skipOffsetMs: Long?, elapsedMs: Long, remainingMs: Long) {
    val skip = skipState(skipOffsetMs, elapsedMs)
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = Safe.horizontal, bottom = Safe.vertical)
                .background(Onyx.onyx.copy(alpha = 0.78f))
                .padding(horizontal = 18.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.End,
        ) {
            Text(
                text = "Ad · ${clock(remainingMs)}",
                style = MaterialTheme.typography.labelLarge,
            )
            if (skipOffsetMs != null) {
                Text(
                    text = if (skip.skippable) "Press OK to skip" else "You can skip in ${skip.secondsLeft}",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (skip.skippable) LocalAccent.current else Onyx.smoke,
                )
            }
        }
    }
}
