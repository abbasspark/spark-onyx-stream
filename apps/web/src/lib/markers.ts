// SPDX-License-Identifier: AGPL-3.0-only
//
// The stretches of a video a player offers to skip: what happened before,
// the opening titles, the closing credits.

export interface Marker {
  kind: 'RECAP' | 'INTRO' | 'CREDITS';
  /** Milliseconds from the start of the video. */
  startMs: number;
  /** Null for credits that run to the end. */
  endMs: number | null;
}

/** A skip that would move less than this is not offered: the stretch is as good as over. */
const WORTH_SKIPPING_SECONDS = 2;

/** Where a marker ends, in seconds. Credits without an end run to the end of the video. */
export function endOf(marker: Marker, duration: number): number {
  return marker.endMs === null ? duration : Math.min(marker.endMs / 1000, duration);
}

/**
 * The stretch that is running at a moment of the video, when skipping it
 * still saves something.
 *
 * @param time Seconds from the start.
 * @returns Null between stretches, and in the last moments of one.
 */
export function runningMarker(
  markers: readonly Marker[] | undefined,
  time: number,
  duration: number,
): Marker | null {
  if (!markers || !(duration > 0)) {
    return null;
  }
  return (
    markers.find(
      (marker) =>
        time >= marker.startMs / 1000 && time < endOf(marker, duration) - WORTH_SKIPPING_SECONDS,
    ) ?? null
  );
}

/** What the button for a stretch says. */
export function skipLabel(kind: Marker['kind']): string {
  switch (kind) {
    case 'RECAP':
      return 'Skip recap';
    case 'INTRO':
      return 'Skip intro';
    default:
      return 'Skip credits';
  }
}

/**
 * The moment from which a video counts as watched: where its credits begin.
 * Credits marked in the first half are not believed, as on the server: the
 * same rule on both sides keeps a video resumable here exactly when it is there.
 *
 * @returns Seconds from the start, or undefined when there is nothing to go by.
 */
export function watchedFrom(
  markers: readonly Marker[] | undefined,
  duration: number,
): number | undefined {
  const credits = markers?.find((marker) => marker.kind === 'CREDITS');
  if (!credits || !(duration > 0)) {
    return undefined;
  }
  const seconds = credits.startMs / 1000;
  return seconds >= duration / 2 ? seconds : undefined;
}

/** What a marked stretch is called where it is shown rather than skipped. */
export function markerName(kind: Marker['kind']): string {
  switch (kind) {
    case 'RECAP':
      return 'Recap';
    case 'INTRO':
      return 'Opening titles';
    default:
      return 'Credits';
  }
}

/** A marked stretch of a video, as a share of its length, for drawing on the seek bar. */
export interface MarkerBand {
  kind: Marker['kind'];
  name: string;
  /** Where it begins and ends, each from 0 to 1. */
  from: number;
  to: number;
  startSeconds: number;
  endSeconds: number;
}

/**
 * The marked stretches as bands across the seek bar, so that a viewer can see
 * where the opening and the credits are before reaching them.
 *
 * Stretches that would be too thin to see or to point at are left out.
 */
export function markerBands(
  markers: readonly Marker[] | undefined,
  duration: number,
): MarkerBand[] {
  if (!markers || !(duration > 0)) {
    return [];
  }
  return markers
    .map((marker) => {
      const startSeconds = Math.max(0, Math.min(duration, marker.startMs / 1000));
      const endSeconds = Math.max(startSeconds, endOf(marker, duration));
      return {
        kind: marker.kind,
        name: markerName(marker.kind),
        from: startSeconds / duration,
        to: endSeconds / duration,
        startSeconds,
        endSeconds,
      };
    })
    .filter((band) => band.endSeconds - band.startSeconds >= WORTH_SKIPPING_SECONDS);
}

/** The band a moment falls in, for naming it while the pointer rests there. */
export function bandAt(bands: readonly MarkerBand[], seconds: number): MarkerBand | null {
  return bands.find((band) => seconds >= band.startSeconds && seconds < band.endSeconds) ?? null;
}
