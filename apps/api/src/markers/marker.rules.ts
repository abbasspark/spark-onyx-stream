// SPDX-License-Identifier: AGPL-3.0-only
import type { MarkerKind } from '@onyx/database';

/**
 * A stretch of a video a player offers to skip: what happened before, the
 * opening titles, the closing credits.
 */
export interface MarkerInput {
  kind: MarkerKind;
  /** Milliseconds from the start of the video. */
  startMs: number;
  /** Null for credits that run to the end. */
  endMs: number | null;
}

export const MARKER_KINDS = ['RECAP', 'INTRO', 'CREDITS'] as const satisfies readonly MarkerKind[];

/** Nothing shorter is worth a button. */
export const MIN_MARKER_MS = 1000;
/** A player may round the end of a video. This much past it is still the end. */
const END_TOLERANCE_MS = 1500;

const NAMES: Record<MarkerKind, string> = {
  RECAP: 'The recap',
  INTRO: 'The intro',
  CREDITS: 'The credits',
};

/**
 * What stands in the way of a set of markers for a video of a length.
 *
 * @param durationMs Null when the length of the video is not known yet.
 * @returns What is wrong, in words for the panel, or null.
 */
export function markersProblem(
  markers: readonly MarkerInput[],
  durationMs: number | null,
): string | null {
  const seen = new Set<MarkerKind>();
  for (const marker of markers) {
    const name = NAMES[marker.kind];
    if (seen.has(marker.kind)) {
      return `${name} can be marked once in a video`;
    }
    seen.add(marker.kind);
    if (marker.endMs === null && marker.kind !== 'CREDITS') {
      return `${name} needs an end`;
    }
    if (marker.endMs !== null && marker.endMs - marker.startMs < MIN_MARKER_MS) {
      return `${name}: the end is before the start, or less than a second after it`;
    }
    if (durationMs !== null) {
      if (marker.startMs >= durationMs) {
        return `${name}: the start is after the end of the video`;
      }
      if (marker.endMs !== null && marker.endMs > durationMs + END_TOLERANCE_MS) {
        return `${name}: the end is after the end of the video`;
      }
    }
  }
  const ordered = [...markers].sort((a, b) => a.startMs - b.startMs);
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1] as MarkerInput;
    const after = ordered[index] as MarkerInput;
    if (before.endMs === null || before.endMs > after.startMs) {
      return `${NAMES[before.kind]} and ${NAMES[after.kind].toLowerCase()} overlap`;
    }
  }
  return null;
}

/** Markers in the order they come in the video, with ends that do not run past it. */
export function normalizeMarkers(
  markers: readonly MarkerInput[],
  durationMs: number | null,
): MarkerInput[] {
  return [...markers]
    .sort((a, b) => a.startMs - b.startMs)
    .map((marker) => {
      const endMs =
        marker.endMs !== null && durationMs !== null
          ? Math.min(marker.endMs, durationMs)
          : marker.endMs;
      // Credits that end with the video run to its end, however long it is.
      const toTheEnd =
        marker.kind === 'CREDITS' &&
        endMs !== null &&
        durationMs !== null &&
        durationMs - endMs < END_TOLERANCE_MS;
      return { kind: marker.kind, startMs: marker.startMs, endMs: toTheEnd ? null : endMs };
    });
}

/**
 * The moment from which a video counts as watched: where its credits begin.
 * Credits that begin in the first half are not believed: somebody marked the
 * wrong thing, and a viewer must not lose their place over it.
 *
 * @returns Seconds from the start, or null when there is nothing to go by.
 */
export function watchedFromSeconds(
  markers: readonly Pick<MarkerInput, 'kind' | 'startMs'>[],
  durationSeconds: number,
): number | null {
  const credits = markers.find((marker) => marker.kind === 'CREDITS');
  if (!credits || !(durationSeconds > 0)) {
    return null;
  }
  const seconds = credits.startMs / 1000;
  return seconds >= durationSeconds / 2 ? seconds : null;
}
