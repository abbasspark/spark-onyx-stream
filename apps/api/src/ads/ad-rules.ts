// SPDX-License-Identifier: AGPL-3.0-only

/** The key under which the ad settings are kept among the settings. */
export const AD_SETTINGS_KEY = 'ads';

/** The most breaks one video gets, however long it is. */
export const MAX_BREAKS = 8;

/** Mid-roll breaks are never closer than this to the end of the video, in minutes. */
const TAIL_MINUTES = 5;

/** When and how often a video is interrupted. */
export interface AdSettings {
  /** The master switch. Off, nobody sees an ad. */
  enabled: boolean;
  /** An ad before the video starts. */
  preRoll: boolean;
  /** An ad after the video ends. */
  postRoll: boolean;
  /** An ad every so many minutes of the video. Zero: no breaks in the middle. */
  midRollEveryMinutes: number;
  /** Videos shorter than this are not interrupted at all, in minutes. */
  minDurationMinutes: number;
}

export const DEFAULT_AD_SETTINGS: AdSettings = {
  enabled: false,
  preRoll: true,
  postRoll: false,
  midRollEveryMinutes: 0,
  minDurationMinutes: 10,
};

const bounded = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Reads what is stored, field by field, so a damaged value costs one setting and not all. */
export function readAdSettings(stored: unknown): AdSettings {
  const raw = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  return {
    enabled: flag(raw.enabled, DEFAULT_AD_SETTINGS.enabled),
    preRoll: flag(raw.preRoll, DEFAULT_AD_SETTINGS.preRoll),
    postRoll: flag(raw.postRoll, DEFAULT_AD_SETTINGS.postRoll),
    midRollEveryMinutes: bounded(
      raw.midRollEveryMinutes,
      0,
      120,
      DEFAULT_AD_SETTINGS.midRollEveryMinutes,
    ),
    minDurationMinutes: bounded(
      raw.minDurationMinutes,
      0,
      240,
      DEFAULT_AD_SETTINGS.minDurationMinutes,
    ),
  };
}

export type BreakPosition = 'PRE' | 'MID' | 'POST';

/** A moment of a video where an ad is played. */
export interface PlannedBreak {
  position: BreakPosition;
  /** Milliseconds from the start of the video. Null before and after it. */
  atMs: number | null;
}

/**
 * Where a video of the given length is interrupted. Mid-roll breaks come
 * every so many minutes, never in the last minutes and never once the credits
 * have started: nobody should be stopped there.
 */
export function planBreaks(
  settings: AdSettings,
  video: { durationMs: number | null; creditsStartMs?: number | null },
): PlannedBreak[] {
  if (!settings.enabled) {
    return [];
  }
  const durationMs = video.durationMs;
  // A video of unknown length is treated as long enough for the breaks that need no length.
  if (durationMs !== null && durationMs < settings.minDurationMinutes * 60_000) {
    return [];
  }
  const planned: PlannedBreak[] = [];
  if (settings.preRoll) {
    planned.push({ position: 'PRE', atMs: null });
  }
  if (settings.midRollEveryMinutes > 0 && durationMs !== null) {
    const every = settings.midRollEveryMinutes * 60_000;
    const latest = Math.min(durationMs - TAIL_MINUTES * 60_000, video.creditsStartMs ?? Infinity);
    for (let at = every; at < latest; at += every) {
      planned.push({ position: 'MID', atMs: at });
    }
  }
  if (settings.postRoll) {
    planned.push({ position: 'POST', atMs: null });
  }
  return planned.slice(0, MAX_BREAKS);
}

/** What the choice between sources needs of one source. */
export interface Weighted {
  id: string;
  weight: number;
}

/**
 * Picks one source by weight. `roll` is a number from 0 up to, but not
 * including, 1: a parameter so that a test can choose it.
 */
export function pickByWeight<T extends Weighted>(sources: readonly T[], roll: number): T | null {
  const total = sources.reduce((sum, source) => sum + Math.max(0, source.weight), 0);
  if (sources.length === 0 || total <= 0) {
    return null;
  }
  let remaining = Math.min(Math.max(roll, 0), 0.999_999_999) * total;
  for (const source of sources) {
    remaining -= Math.max(0, source.weight);
    if (remaining < 0) {
      return source;
    }
  }
  return sources.at(-1) ?? null;
}

/** What a player reports about an ad. */
export const AD_EVENTS = [
  'IMPRESSION',
  'FIRST_QUARTILE',
  'MIDPOINT',
  'THIRD_QUARTILE',
  'COMPLETE',
  'SKIP',
  'CLICK',
  'ERROR',
] as const;
export type AdEventName = (typeof AD_EVENTS)[number];

/** The column of the daily figures each event is counted in. */
export const AD_EVENT_COLUMN = {
  IMPRESSION: 'impressions',
  FIRST_QUARTILE: 'firstQuartile',
  MIDPOINT: 'midpoint',
  THIRD_QUARTILE: 'thirdQuartile',
  COMPLETE: 'completes',
  SKIP: 'skips',
  CLICK: 'clicks',
  ERROR: 'errors',
} as const satisfies Record<AdEventName, string>;

/** Whether an address may be fetched by a player or opened by a viewer. */
export function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
