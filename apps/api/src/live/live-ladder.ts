// SPDX-License-Identifier: AGPL-3.0-only

/** Picture heights a transcoded channel can be given. */
export const LIVE_QUALITIES = [1080, 720, 480, 360, 240] as const;
export type LiveQuality = (typeof LIVE_QUALITIES)[number];

/** What a new transcoded channel gets when nothing is chosen. */
export const DEFAULT_LIVE_QUALITIES: readonly LiveQuality[] = [1080, 720, 480];

/**
 * Video bitrates in kbit/s by picture height, for H.264 at up to 30 pictures
 * a second. Heights in between are worked out from their neighbours.
 */
const BITRATES: readonly (readonly [height: number, kbps: number])[] = [
  [240, 400],
  [360, 800],
  [480, 1400],
  [720, 2800],
  [1080, 5000],
  [2160, 14000],
];

/** Sport and games at 50 or 60 pictures a second need more data for the same look. */
const HIGH_FRAME_RATE = 40;
const HIGH_FRAME_RATE_FACTOR = 1.4;

/** A source this close to a chosen height is not given a quality of its own. */
const NEAR = 0.1;

/** One quality of a transcoded channel. */
export interface Rendition {
  /** Part of file names and of the playlist: "720p". */
  name: string;
  height: number;
  /** Wanted video bitrate in kbit/s. */
  videoKbps: number;
  /** Ceiling the encoder may reach for a moment, in kbit/s. */
  maxrateKbps: number;
  profile: 'high' | 'main';
}

export function videoKbpsFor(height: number, frameRate: number | null = null): number {
  const first = BITRATES[0] as readonly [number, number];
  const last = BITRATES.at(-1) as readonly [number, number];
  let kbps: number;
  if (height <= first[0]) {
    kbps = first[1];
  } else if (height >= last[0]) {
    kbps = last[1];
  } else {
    const upper = BITRATES.findIndex(([step]) => step >= height);
    const [lowHeight, lowKbps] = BITRATES[upper - 1] as readonly [number, number];
    const [highHeight, highKbps] = BITRATES[upper] as readonly [number, number];
    kbps = lowKbps + ((highKbps - lowKbps) * (height - lowHeight)) / (highHeight - lowHeight);
  }
  if (frameRate !== null && frameRate > HIGH_FRAME_RATE && height >= 720) {
    kbps *= HIGH_FRAME_RATE_FACTOR;
  }
  return Math.round(kbps / 50) * 50;
}

function rendition(height: number, frameRate: number | null): Rendition {
  const videoKbps = videoKbpsFor(height, frameRate);
  return {
    name: `${height}p`,
    height,
    videoKbps,
    maxrateKbps: Math.round(videoKbps * 1.1),
    profile: height >= 720 ? 'high' : 'main',
  };
}

/**
 * The qualities a channel is encoded into, best first.
 *
 * A picture is never made larger than the source: chosen heights above it are
 * left out. When that cuts the top off, the source's own height takes its
 * place, so a 576-line broadcast with "1080, 720, 480" chosen comes out as 576
 * and 480 instead of losing a sixth of its lines.
 */
export function ladderFor(
  qualities: readonly number[],
  sourceHeight: number,
  frameRate: number | null = null,
): Rendition[] {
  const chosen = [...new Set(qualities.length > 0 ? qualities : DEFAULT_LIVE_QUALITIES)].sort(
    (a, b) => b - a,
  );
  // Sources are often a few lines off a standard height, such as 1088.
  const own = Math.max(2, sourceHeight - (sourceHeight % 2));
  const heights = chosen.filter((height) => height <= own * (1 + NEAR / 2));

  const top = heights[0];
  const cut = (chosen[0] as number) > own;
  if (top === undefined || (cut && own > top * (1 + NEAR))) {
    heights.unshift(own);
  }
  return heights.map((height) => rendition(Math.min(height, own), frameRate));
}

/** How far back viewers can go on a channel, in minutes. 0 means only the present. */
export const DVR_WINDOWS = [0, 30, 60, 120, 240] as const;

/**
 * Segments a playlist has to list for a channel: the usual few for a channel
 * that only shows the present, enough for the whole window for one that lets
 * viewers go back.
 */
export function playlistLength(
  dvrMinutes: number,
  segmentSeconds: number,
  liveSegments: number,
): number {
  if (dvrMinutes <= 0) {
    return liveSegments;
  }
  return Math.max(liveSegments, Math.ceil((dvrMinutes * 60) / segmentSeconds));
}
