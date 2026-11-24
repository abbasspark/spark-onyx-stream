// SPDX-License-Identifier: AGPL-3.0-only
//
// Markers: the stretches of a video a player offers to skip.

export const MARKER_KINDS = ['RECAP', 'INTRO', 'CREDITS'] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];

export interface Marker {
  kind: MarkerKind;
  /** Milliseconds from the start of the video. */
  startMs: number;
  /** Null for credits that run to the end. */
  endMs: number | null;
  /** DETECTED: found by comparing episodes, and not checked by anyone yet. */
  source?: 'MANUAL' | 'DETECTED';
}

export const MARKER_LOOKS: Record<
  MarkerKind,
  { name: string; description: string; button: string; color: string }
> = {
  RECAP: {
    name: 'Recap',
    description: '"Previously on": what happened before, at the start of an episode.',
    button: 'Skip recap',
    color: 'var(--color-info)',
  },
  INTRO: {
    name: 'Intro',
    description: 'The opening titles.',
    button: 'Skip intro',
    color: 'var(--color-primary)',
  },
  CREDITS: {
    name: 'Credits',
    description:
      'The closing credits. Players offer the next episode here, and the video counts as watched from where they begin.',
    button: 'Next episode',
    color: 'var(--color-warning)',
  },
};

/** "1:02:05.5" for a moment of a video: tenths of a second, hours only when there are any. */
export function formatMoment(milliseconds: number): string {
  const tenths = Math.round(milliseconds / 100);
  const hours = Math.floor(tenths / 36_000);
  const minutes = Math.floor((tenths % 36_000) / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  const rest = tenths % 10;
  const tail = `${String(seconds).padStart(2, '0')}${rest > 0 ? `.${rest}` : ''}`;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}

/**
 * Reads a moment as people type it: "90", "1:30", "1:30.5", "1:02:05".
 *
 * @returns Milliseconds, or null for what is not a moment.
 */
export function parseMoment(text: string): number | null {
  const value = text.trim().replace(',', '.');
  if (!/^\d+(:\d{1,2}){0,2}(\.\d{1,3})?$/.test(value)) {
    return null;
  }
  const parts = value.split(':').map(Number);
  // With a colon, what follows it is seconds or minutes below sixty.
  if (parts.slice(1).some((part) => part >= 60)) {
    return null;
  }
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return Math.round(seconds * 1000);
}

const NAMES: Record<MarkerKind, string> = {
  RECAP: 'The recap',
  INTRO: 'The intro',
  CREDITS: 'The credits',
};

/**
 * What stands in the way of saving a set of markers, as the API judges it.
 *
 * @returns What is wrong, or null.
 */
export function markersProblem(
  markers: readonly Marker[],
  durationMs: number | null,
): string | null {
  for (const marker of markers) {
    const name = NAMES[marker.kind];
    if (marker.endMs === null && marker.kind !== 'CREDITS') {
      return `${name} needs an end`;
    }
    if (marker.endMs !== null && marker.endMs - marker.startMs < 1000) {
      return `${name}: the end is before the start, or less than a second after it`;
    }
    if (durationMs !== null) {
      if (marker.startMs >= durationMs) {
        return `${name}: the start is after the end of the video`;
      }
      if (marker.endMs !== null && marker.endMs > durationMs + 1500) {
        return `${name}: the end is after the end of the video`;
      }
    }
  }
  const ordered = [...markers].sort((a, b) => a.startMs - b.startMs);
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1] as Marker;
    const after = ordered[index] as Marker;
    if (before.endMs === null || before.endMs > after.startMs) {
      return `${NAMES[before.kind]} and ${NAMES[after.kind].toLowerCase()} overlap`;
    }
  }
  return null;
}

/** Whether two sets of markers say the same, whatever their order. */
export function sameMarkers(a: readonly Marker[], b: readonly Marker[]): boolean {
  const key = (markers: readonly Marker[]) =>
    markers
      .map((marker) => `${marker.kind}:${marker.startMs}:${marker.endMs}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

/** Where a new marker of a kind is put, when the player says nothing: a sensible first guess. */
export function suggestMarker(kind: MarkerKind, atMs: number, durationMs: number | null): Marker {
  const length = durationMs ?? 0;
  if (kind === 'CREDITS') {
    // From where the player is, when that is in the second half. Else the last two minutes.
    const startMs =
      length > 0 && atMs >= length / 2 ? atMs : Math.max(0, Math.round(length - 120_000));
    return { kind, startMs, endMs: null };
  }
  const startMs = length > 0 && atMs < length / 2 ? atMs : 0;
  const wanted = kind === 'INTRO' ? 60_000 : 45_000;
  return {
    kind,
    startMs,
    endMs: length > 0 ? Math.min(startMs + wanted, length) : startMs + wanted,
  };
}

/** How a search for intros and credits in a season goes, or went. */
export interface MarkerDetection {
  jobId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  /** 0 to 100. */
  progress: number;
  queuedAt: string;
  finishedAt: string | null;
  error: string | null;
  result: {
    episodes: number;
    intros: number;
    credits: number;
    keptManual: number;
    perEpisode: { episode: number; intro: boolean; credits: boolean }[];
    notes?: string[];
  } | null;
}

/** One sentence for what a finished search found. */
export function describeDetection(result: NonNullable<MarkerDetection['result']>): string {
  const of = (count: number) =>
    count === result.episodes ? `all ${result.episodes}` : `${count} of ${result.episodes}`;
  if (result.intros === 0 && result.credits === 0) {
    return result.keptManual > 0
      ? 'Nothing new was found. What was set by hand was left as it is.'
      : 'The episodes share no intro and no credits that could be found by their sound.';
  }
  const parts = [
    result.intros > 0 ? `an intro in ${of(result.intros)} episodes` : null,
    result.credits > 0 ? `credits in ${of(result.credits)}` : null,
  ].filter(Boolean);
  return `Found ${parts.join(' and ')}.`;
}
