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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
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
import de.sparksystem.onyx.data.Channel
import de.sparksystem.onyx.mobile.ui.components.AccentButton
import de.sparksystem.onyx.mobile.ui.components.Hairline
import de.sparksystem.onyx.mobile.ui.components.SectionHeading
import de.sparksystem.onyx.mobile.ui.components.Trouble
import de.sparksystem.onyx.mobile.ui.components.Waiting
import de.sparksystem.onyx.mobile.ui.theme.GUTTER
import de.sparksystem.onyx.mobile.ui.theme.LocalAccent
import de.sparksystem.onyx.mobile.ui.theme.oneLine
import de.sparksystem.onyx.ui.LiveState
import de.sparksystem.onyx.ui.behindLive
import de.sparksystem.onyx.ui.progressOf
import kotlinx.coroutines.delay

/** The lineup on a phone: a list to scroll with a thumb. */
@Composable
fun LineupScreen(state: LiveState, onWatch: (Channel) -> Unit, onRetry: () -> Unit) {
    if (state.loading && state.channels.isEmpty()) {
        Waiting("Loading the channels")
        return
    }

    if (state.channels.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize().background(Onyx.onyx).padding(GUTTER),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Trouble(state.trouble ?: "This service has no live channels.")
                AccentButton(text = "Try again", onClick = onRetry)
            }
        }
        return
    }

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(30_000)
            now = System.currentTimeMillis()
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(Onyx.onyx),
        contentPadding = PaddingValues(horizontal = GUTTER, vertical = 16.dp),
    ) {
        item(key = "head") {
            Column {
                SectionHeading(text = "Live")
                Spacer(Modifier.height(10.dp))
            }
        }
        items(state.channels, key = { it.slug }) { channel ->
            Column {
                ChannelRow(
                    number = channel.number,
                    name = channel.name,
                    onAir = channel.onAir,
                    running = channel.now?.title,
                    through = channel.now?.let { progressOf(it, now) } ?: 0f,
                    onClick = { onWatch(channel) },
                )
                Hairline()
            }
        }
    }
}

/**
 * A live channel on a phone.
 *
 * The same picture as the television's, with none of the keys: the controls
 * come and go with a tap, the channel is changed by going back to the list,
 * and the bar appears only on a channel that keeps what it sent.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@Composable
fun LivePlayerScreen(state: LiveState, onBack: () -> Unit) {
    val channel = state.watching ?: return
    val context = LocalContext.current

    DisposableEffect(Unit) {
        val activity = context as? Activity
        val before = activity?.requestedOrientation
        activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        onDispose {
            activity?.requestedOrientation = before ?: ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    val player = remember { ExoPlayer.Builder(context).build().apply { playWhenReady = true } }
    var position by remember { mutableLongStateOf(0L) }
    var edge by remember { mutableLongStateOf(0L) }
    var shown by remember { mutableStateOf(true) }
    var wake by remember { mutableLongStateOf(0L) }

    val address = state.playback?.url
    DisposableEffect(address) {
        if (address == null) {
            return@DisposableEffect onDispose { }
        }
        player.setMediaItem(MediaItem.fromUri(address))
        player.prepare()
        onDispose { }
    }

    DisposableEffect(player) { onDispose { player.release() } }

    LaunchedEffect(player) {
        while (true) {
            position = player.currentPosition
            val window = player.duration
            edge = if (window == C.TIME_UNSET) 0L else window
            delay(500)
        }
    }

    LaunchedEffect(wake) {
        if (wake == 0L) {
            return@LaunchedEffect
        }
        shown = true
        delay(4000)
        shown = false
    }

    val keeps = channel.keeps && edge > 0
    val behindMs = (edge - position).coerceAtLeast(0)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Onyx.onyx)
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = {
                        shown = !shown
                        if (shown) {
                            wake = System.currentTimeMillis()
                        }
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

        val refusal = state.refusal
        if (refusal != null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Trouble(refusal)
                    AccentButton(text = "The channels", onClick = onBack)
                }
            }
        } else if (state.playback == null) {
            Waiting("Tuning in to ${channel.name}")
        }

        if (shown) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            0f to Onyx.onyx.copy(alpha = 0.85f),
                            1f to Onyx.onyx.copy(alpha = 0f),
                        ),
                    )
                    .padding(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Onyx.vein)
                }
                Column(modifier = Modifier.padding(start = 4.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (channel.number != null) {
                            Text(
                                text = channel.number.toString(),
                                style = MaterialTheme.typography.titleMedium,
                                color = LocalAccent.current,
                            )
                            Spacer(Modifier.size(10.dp))
                        }
                        Text(
                            text = channel.name,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = oneLine,
                        )
                    }
                    val running = channel.now
                    if (running != null) {
                        Text(
                            text = running.title,
                            style = MaterialTheme.typography.labelMedium,
                            color = Onyx.smoke,
                            maxLines = 1,
                            overflow = oneLine,
                        )
                    }
                }
            }

            if (keeps) {
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
                        value = position.toFloat(),
                        onValueChange = { value ->
                            position = value.toLong()
                            player.seekTo(value.toLong())
                            wake = System.currentTimeMillis()
                        },
                        valueRange = 0f..maxOf(edge.toFloat(), 1f),
                        colors = SliderDefaults.colors(
                            thumbColor = LocalAccent.current,
                            activeTrackColor = LocalAccent.current,
                            inactiveTrackColor = Onyx.vein.copy(alpha = 0.25f),
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        text = if (behindMs > 45_000) {
                            behindLive(behindMs / 1000)
                        } else {
                            "Live"
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = if (behindMs > 45_000) LocalAccent.current else Onyx.smoke,
                    )
                }
            }
        }
    }
}
