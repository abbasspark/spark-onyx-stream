// SPDX-License-Identifier: AGPL-3.0-only
//
// The figures behind a playback, for the panel an operator opens when a
// viewer writes in to say the picture keeps stopping. Nothing here changes
// what plays; it only reads and names what is already going on.

export interface StatsReading {
  /** Picture that is playing, such as "1920×1080". Null before the first one. */
  resolution: string | null;
  /** Bits per second of the rung that is playing. */
  bitrate: number | null;
  /** What the player thinks the connection can carry, in bits per second. */
  estimate: number | null;
  /** Seconds of video loaded ahead of where the viewer is. */
  ahead: number;
  dropped: number;
  frames: number;
  /** How far behind the live edge, in seconds. Null for a recording. */
  behind: number | null;
  /** Which rung of the ladder, and how many there are. */
  level: { index: number; count: number } | null;
  /** The server the last part came from, by name only. */
  host: string | null;
  codecs: string | null;
}

export const EMPTY_READING: StatsReading = {
  resolution: null,
  bitrate: null,
  estimate: null,
  ahead: 0,
  dropped: 0,
  frames: 0,
  behind: null,
  level: null,
  host: null,
  codecs: null,
};

/** Seconds of video loaded after the position, within the stretch it is in. */
export function bufferAhead(ranges: TimeRanges | undefined, time: number): number {
  if (!ranges) {
    return 0;
  }
  for (let index = 0; index < ranges.length; index += 1) {
    if (ranges.start(index) <= time + 0.5 && ranges.end(index) >= time) {
      return Math.max(0, ranges.end(index) - time);
    }
  }
  return 0;
}

/** A rate as a viewer reads it: 4.2 Mbps, 850 kbps. */
export function formatRate(bits: number | null): string {
  if (bits === null || !Number.isFinite(bits) || bits <= 0) {
    return '—';
  }
  return bits >= 1_000_000
    ? `${(bits / 1_000_000).toFixed(bits >= 10_000_000 ? 0 : 1)} Mbps`
    : `${Math.round(bits / 1000)} kbps`;
}

/** The host of an address, for saying which server a part came from. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url, 'https://local').hostname || null;
  } catch {
    return null;
  }
}

/** How many frames were lost, as a share of those shown. */
export function droppedShare(reading: StatsReading): string {
  if (reading.frames === 0) {
    return '—';
  }
  const share = (reading.dropped / reading.frames) * 100;
  return `${reading.dropped} (${share < 0.1 && share > 0 ? '<0.1' : share.toFixed(1)}%)`;
}
