// SPDX-License-Identifier: AGPL-3.0-only

/** The first seconds do not count as having started. */
export const MIN_POSITION_SECONDS = 15;
/**
 * From here on a video counts as watched, when nobody marked where its
 * credits begin: most credits are within the last twentieth.
 */
export const FINISHED_FRACTION = 0.95;

export type WatchOutcome =
  /** Barely begun: there is nothing to remember. */
  | { kind: 'not-started' }
  /** Somewhere in the middle: worth coming back to. */
  | { kind: 'in-progress'; positionSeconds: number; durationSeconds: number }
  /** Watched to the end. */
  | { kind: 'finished'; durationSeconds: number };

/**
 * What a reported position means. The viewer website applies the same
 * rules, so a video is resumable on the device exactly when it is here.
 *
 * @param creditsAt Where the credits of the video begin, in seconds, when
 *   that is marked. Whoever reached them watched the video, however long
 *   they run.
 */
export function judgePosition(
  position: number,
  duration: number,
  creditsAt: number | null = null,
): WatchOutcome {
  const durationSeconds = Math.round(duration);
  if (!(durationSeconds > 0)) {
    return { kind: 'not-started' };
  }
  // First, so that a clip shorter than the minimum can be finished too.
  if (position / duration >= FINISHED_FRACTION || (creditsAt !== null && position >= creditsAt)) {
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
