// SPDX-License-Identifier: AGPL-3.0-only
package de.sparksystem.onyx.tv.ui

import de.sparksystem.onyx.tv.data.Channel
import de.sparksystem.onyx.tv.data.Programme

// What a television does with a lineup and a guide. The decisions are here,
// away from the screens, because they are the part worth testing without a
// device: which channel a typed number means, where in a kept window a
// programme began, how far through the one on now is.

/** When a moment of the world is, in milliseconds. Null when it cannot be read. */
fun momentOf(time: String): Long? = runCatching {
    java.time.Instant.parse(time).toEpochMilli()
}.getOrNull()

/**
 * The channel a number stands for, as typed on a remote control. Numbers are
 * matched whole, so 1 finds channel 1 and not channel 10.
 */
fun channelByNumber(channels: List<Channel>, number: Int): Channel? =
    channels.firstOrNull { it.number == number }

/**
 * Whether a longer number could still be coming, so that the app knows to
 * wait for another digit rather than tuning at once. Without this a lineup
 * cannot hold both channel 1 and channel 12.
 */
fun moreBeginWith(channels: List<Channel>, digits: String): Boolean {
    val typed = digits.toIntOrNull() ?: return false
    return channels.any { channel ->
        channel.number != null &&
            channel.number != typed &&
            channel.number.toString().startsWith(digits)
    }
}

/**
 * The channel that comes before or after this one, wrapping round at the
 * ends, which is how the channel keys of a remote behave.
 *
 * @param step -1 for the one before, 1 for the one after.
 */
fun neighbour(channels: List<Channel>, slug: String, step: Int): Channel? {
    if (channels.isEmpty()) {
        return null
    }
    val at = channels.indexOfFirst { it.slug == slug }
    if (at == -1) {
        return channels.first()
    }
    val next = ((at + step) % channels.size + channels.size) % channels.size
    return channels[next]
}

/** How far through a programme a moment is, from 0 to 1. */
fun progressOf(programme: Programme, at: Long): Float {
    val start = momentOf(programme.startsAt) ?: return 0f
    val end = momentOf(programme.endsAt) ?: return 0f
    if (end <= start) {
        return 0f
    }
    return ((at - start).toFloat() / (end - start)).coerceIn(0f, 1f)
}

/** The programme a moment falls in, out of a channel's row of the guide. */
fun programmeAt(programmes: List<Programme>, at: Long): Programme? = programmes.firstOrNull {
    val start = momentOf(it.startsAt) ?: return@firstOrNull false
    val end = momentOf(it.endsAt) ?: return@firstOrNull false
    at in start until end
}

/**
 * Where in the video a moment of the world lies, on a channel that keeps
 * what it sent. Null when the moment is no longer kept or has not come yet.
 *
 * @param at The moment, in milliseconds.
 * @param liveEdgeMs Where the live edge is in the video, in milliseconds.
 * @param windowMs How much of the video the channel still holds.
 */
fun positionAt(at: Long, now: Long, liveEdgeMs: Long, windowMs: Long): Long? {
    if (liveEdgeMs <= 0 || windowMs <= 0) {
        return null
    }
    val behind = now - at
    // A few seconds of slack at each end: those parts are about to go, or
    // have not arrived yet.
    if (behind < 4_000 || behind > windowMs - 8_000) {
        return null
    }
    return (liveEdgeMs - behind).coerceAtLeast(0)
}

/** How far behind the live edge, as a viewer would say it. */
fun behindLive(seconds: Long): String = when {
    seconds < 45 -> "Live"
    seconds < 90 -> "A minute behind"
    seconds < 3600 -> "${(seconds + 30) / 60} minutes behind"
    else -> {
        val hours = seconds / 3600
        val minutes = (seconds % 3600) / 60
        if (minutes == 0L) {
            if (hours == 1L) "An hour behind" else "$hours hours behind"
        } else {
            "${hours}h ${minutes}m behind"
        }
    }
}

/** Why a channel cannot be watched, or null when it can. */
fun refusalOf(channel: Channel): String? = when {
    !channel.onAir -> "This channel is not sending at the moment."
    else -> null
}
