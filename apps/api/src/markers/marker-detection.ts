// SPDX-License-Identifier: AGPL-3.0-only
import type { MarkerInput } from './marker.rules.js';
import type { SharedPart } from './fingerprint.js';

/** How much of the start and of the end of an episode is listened to, at most. Seconds. */
export const LISTEN_SECONDS = 600;
/** And never more than this share of the episode, so start and end do not meet. */
export const LISTEN_FRACTION = 0.4;
/** An opening is at least this long. Shorter is a jingle or a logo. */
export const MIN_INTRO_SECONDS = 12;
/** Closing credits are at least this long. */
export const MIN_CREDITS_SECONDS = 15;
/** Nothing longer is an opening. Two episodes that share this much are the same video. */
export const MAX_SHARED_SECONDS = 330;
/** Credits that stop this close to the end run to the end. */
const END_SLACK_SECONDS = 20;

/** How many seconds of the start, and of the end, of a video of a length are listened to. */
export function listenSeconds(durationMs: number | null): number {
  const seconds = (durationMs ?? 0) / 1000;
  return Math.max(0, Math.min(LISTEN_SECONDS, Math.floor(seconds * LISTEN_FRACTION)));
}

/**
 * The episodes to compare an episode with, nearest first. Neighbours share
 * an opening more often than the first and the last of a season, between
 * which the titles may have been redone.
 */
export function partnersOf(index: number, count: number): number[] {
  const partners: number[] = [];
  for (let distance = 1; distance <= 2; distance += 1) {
    for (const other of [index + distance, index - distance]) {
      if (other >= 0 && other < count) {
        partners.push(other);
      }
    }
  }
  return partners;
}

/** What a shared part at the start of an episode is: its intro, or nothing to mark. */
export function introFrom(shared: SharedPart | null): MarkerInput | null {
  if (!shared) {
    return null;
  }
  const length = shared.endA - shared.startA;
  if (length < MIN_INTRO_SECONDS || length > MAX_SHARED_SECONDS) {
    return null;
  }
  return {
    kind: 'INTRO',
    // To the tenth of a second: finer than anyone can tell, and steadier to compare.
    startMs: Math.round(shared.startA * 10) * 100,
    endMs: Math.round(shared.endA * 10) * 100,
  };
}

/**
 * What a shared part at the end of an episode is: its credits.
 *
 * @param tailStartSeconds Where in the episode the part that was listened to begins.
 * @param durationSeconds The length of the episode.
 */
export function creditsFrom(
  shared: SharedPart | null,
  tailStartSeconds: number,
  durationSeconds: number,
): MarkerInput | null {
  if (!shared) {
    return null;
  }
  const length = shared.endA - shared.startA;
  if (length < MIN_CREDITS_SECONDS || length > MAX_SHARED_SECONDS) {
    return null;
  }
  const start = tailStartSeconds + shared.startA;
  const end = tailStartSeconds + shared.endA;
  // Credits are at the end. A song both episodes play in their middle is not.
  if (start < durationSeconds / 2) {
    return null;
  }
  return {
    kind: 'CREDITS',
    startMs: Math.round(start * 10) * 100,
    // A scene after the credits is not skipped with them.
    endMs: durationSeconds - end <= END_SLACK_SECONDS ? null : Math.round(end * 10) * 100,
  };
}

/** Builds the FFmpeg arguments that write a stretch of one sound stream as raw samples. */
export function buildListenArgs(input: {
  sourcePath: string;
  /** Position of the stream among the sound streams of the file. */
  streamIndex: number;
  /** Where to begin, in seconds from the start. */
  fromSeconds: number;
  seconds: number;
  sampleRate: number;
  outputPath: string;
}): string[] {
  return [
    // Before the input, so FFmpeg jumps there instead of decoding its way.
    '-ss',
    input.fromSeconds.toFixed(3),
    '-t',
    String(input.seconds),
    '-i',
    input.sourcePath,
    '-map',
    `0:a:${input.streamIndex}`,
    '-vn',
    '-sn',
    '-dn',
    '-ac',
    '1',
    '-ar',
    String(input.sampleRate),
    '-f',
    's16le',
    '-y',
    input.outputPath,
  ];
}
