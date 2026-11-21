// SPDX-License-Identifier: AGPL-3.0-only

/** The first seconds do not count as having started. */
export const MIN_POSITION_SECONDS = 15;
/** From here on the credits are running and the video counts as watched. */
export const FINISHED_FRACTION = 0.95;

export type WatchOutcome =
  /** Barely begun: there is nothing to remember. */
  | { kind: 'not-started' }
  /** Somewhere in the middle: worth coming back to. */
  | { kind: 'in-progress'; positionSeconds: number; durationSeconds: number }
  /** Watched to the end. */
  | { kind: 'finished'; durationSeconds: number };

/**
 * What a reported position means. The viewer website applies the same two
 * numbers, so a video is resumable on the device exactly when it is here.
 */
export function judgePosition(position: number, duration: number): WatchOutcome {
  const durationSeconds = Math.round(duration);
  if (!(durationSeconds > 0)) {
    return { kind: 'not-started' };
  }
  // First, so that a clip shorter than the minimum can be finished too.
  if (position / duration >= FINISHED_FRACTION) {
    return { kind: 'finished', durationSeconds };
  }
  if (position < MIN_POSITION_SECONDS) {
    return { kind: 'not-started' };
  }
  return { kind: 'in-progress', positionSeconds: Math.floor(position), durationSeconds };
}

/**
 * The time a device says the viewer watched. A clock that runs ahead is not
 * believed: an entry from the future would win against every later one.
 */
export function clampWatchedAt(claimed: Date | undefined, now: Date): Date {
  return claimed && claimed.getTime() <= now.getTime() ? claimed : now;
}
