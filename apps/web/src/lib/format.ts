// SPDX-License-Identifier: AGPL-3.0-only
import type { TitleCard } from './types';

/** A running time for people: "1 h 42 min", "47 min", "under a minute". */
export function formatRuntime(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) {
    return null;
  }
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 1) {
    return 'under a minute';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** A position in a video as a clock: "1:02:03", "4:05", "0:09". */
export function formatClock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** A running time in the form search engines expect: "PT1H42M". */
export function isoDuration(durationMs: number | null): string | undefined {
  if (durationMs === null || durationMs <= 0) {
    return undefined;
  }
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `PT${hours > 0 ? `${hours}H` : ''}${rest > 0 || hours === 0 ? `${rest}M` : ''}`;
}

/** How much there is to watch: the running time of a movie or the size of a series. */
export function describeLength(title: TitleCard): string | null {
  if (title.type === 'MOVIE') {
    return formatRuntime(title.durationMs);
  }
  if (title.seasonCount > 1) {
    return `${title.seasonCount} seasons`;
  }
  return `${title.episodeCount} ${title.episodeCount === 1 ? 'episode' : 'episodes'}`;
}

/** Cuts a text for a preview at a word, with an ellipsis when something was cut. */
export function truncate(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  const cut = clean.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?-]+$/, '')}…`;
}
