// SPDX-License-Identifier: AGPL-3.0-only
//
// What a viewer sets once in the player and expects to find again: how big
// the subtitles are, whether the picture fills the screen, how loud it may
// get, whether openings are skipped by themselves.
//
// These belong to the device, not to the account. Subtitle size depends on
// how far away the screen is, a data cap depends on the connection, and a
// phone and a desktop rarely want the same answer. The language of the sound
// and of the subtitles is the other kind, and that one does live with the
// profile.

/** How the picture fills the window. */
export type FitMode = 'fit' | 'fill' | 'zoom' | 'stretch';

/** The most the player may ask for, to spare a metered connection. */
export type DataSaver = 'off' | '1080' | '720' | '480';

/** Which stretches the player skips without being asked. */
export type AutoSkip = 'off' | 'intro' | 'all';

export interface SubtitleLook {
  /** Height of a line against the window's height, as a percentage. */
  size: number;
  color: string;
  /** How the text is set off from the picture. */
  edge: 'none' | 'outline' | 'shadow' | 'box';
  /** How solid the band behind the text is, from 0 (none) to 1. */
  background: number;
  /** How far the bottom line sits above the lower edge, as a percentage of the height. */
  bottom: number;
  /** Seconds to move every line by. Positive shows a line later. */
  offset: number;
}

export interface PlayerSettings {
  subtitles: SubtitleLook;
  fit: FitMode;
  /** 1 is what the video itself has. Above that the sound is amplified. */
  boost: number;
  /** Flattens the loud and quiet parts, for watching late or in the street. */
  nightMode: boolean;
  dataSaver: DataSaver;
  autoSkip: AutoSkip;
  /** Seconds a skip button or an arrow key moves. */
  seekStep: number;
  /** Whether the stats panel opens with the player. */
  stats: boolean;
}

export const SUBTITLE_COLORS = [
  { value: '#f4f1ea', label: 'White' },
  { value: '#ffe8a3', label: 'Cream' },
  { value: '#ffd166', label: 'Amber' },
  { value: '#9fe8c0', label: 'Green' },
  { value: '#a9d6ff', label: 'Blue' },
] as const;

export const SEEK_STEPS = [5, 10, 15, 30] as const;

export const DEFAULT_SETTINGS: PlayerSettings = {
  subtitles: {
    size: 4.2,
    color: '#f4f1ea',
    edge: 'shadow',
    background: 0,
    bottom: 8,
    offset: 0,
  },
  fit: 'fit',
  boost: 1,
  nightMode: false,
  dataSaver: 'off',
  autoSkip: 'off',
  seekStep: 10,
  stats: false,
};

const KEY = 'onyx.web.player';

/** Keeps a number inside what the control offers, whatever was stored. */
function clamp(value: unknown, low: number, high: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Reads what was stored, taking each field on its own. A stored file from an
 * older or a newer version of the player is used as far as it makes sense
 * instead of being thrown away whole.
 */
export function readSettings(stored: unknown): PlayerSettings {
  const source = (stored ?? {}) as Partial<Record<keyof PlayerSettings, unknown>>;
  const subtitles = (source.subtitles ?? {}) as Partial<Record<keyof SubtitleLook, unknown>>;
  const colors = SUBTITLE_COLORS.map((entry) => entry.value);
  return {
    subtitles: {
      size: clamp(subtitles.size, 2.4, 9, DEFAULT_SETTINGS.subtitles.size),
      color:
        typeof subtitles.color === 'string' && colors.includes(subtitles.color as never)
          ? subtitles.color
          : DEFAULT_SETTINGS.subtitles.color,
      edge: oneOf(
        subtitles.edge,
        ['none', 'outline', 'shadow', 'box'] as const,
        DEFAULT_SETTINGS.subtitles.edge,
      ),
      background: clamp(subtitles.background, 0, 1, DEFAULT_SETTINGS.subtitles.background),
      bottom: clamp(subtitles.bottom, 2, 40, DEFAULT_SETTINGS.subtitles.bottom),
      offset: clamp(subtitles.offset, -10, 10, DEFAULT_SETTINGS.subtitles.offset),
    },
    fit: oneOf(source.fit, ['fit', 'fill', 'zoom', 'stretch'] as const, DEFAULT_SETTINGS.fit),
    boost: clamp(source.boost, 1, 3, DEFAULT_SETTINGS.boost),
    nightMode: source.nightMode === true,
    dataSaver: oneOf(
      source.dataSaver,
      ['off', '1080', '720', '480'] as const,
      DEFAULT_SETTINGS.dataSaver,
    ),
    autoSkip: oneOf(source.autoSkip, ['off', 'intro', 'all'] as const, DEFAULT_SETTINGS.autoSkip),
    seekStep: SEEK_STEPS.includes(source.seekStep as never)
      ? (source.seekStep as number)
      : DEFAULT_SETTINGS.seekStep,
    stats: source.stats === true,
  };
}

/** The highest picture the data saver allows, or null for no limit. */
export function heightCap(saver: DataSaver): number | null {
  return saver === 'off' ? null : Number(saver);
}

/**
 * The object-fit and the scale a fit mode stands for. "Zoom" crops a
 * letterboxed picture to the window; "stretch" pulls a 4:3 picture wide.
 */
export function fitStyle(mode: FitMode): {
  objectFit: 'contain' | 'cover' | 'fill';
  scale: number;
} {
  switch (mode) {
    case 'fill':
      return { objectFit: 'cover', scale: 1 };
    case 'zoom':
      return { objectFit: 'contain', scale: 1.18 };
    case 'stretch':
      return { objectFit: 'fill', scale: 1 };
    default:
      return { objectFit: 'contain', scale: 1 };
  }
}

export const FIT_LABELS: Record<FitMode, string> = {
  fit: 'Fit the picture',
  fill: 'Fill the screen',
  zoom: 'Zoom in',
  stretch: 'Stretch to the screen',
};

// --- Where the settings live ------------------------------------------------

let current: PlayerSettings | null = null;
const listeners = new Set<() => void>();

/** What is set now, read from storage the first time it is asked for. */
export function playerSettings(): PlayerSettings {
  if (current) {
    return current;
  }
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }
  try {
    current = readSettings(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
  } catch {
    // Storage can be switched off. The settings then hold for this page only.
    current = DEFAULT_SETTINGS;
  }
  return current;
}

/** Changes some of the settings and tells every player on the page. */
export function setPlayerSettings(change: Partial<PlayerSettings>): PlayerSettings {
  const next = readSettings({ ...playerSettings(), ...change });
  current = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // As above: kept for this page only.
  }
  for (const listener of listeners) {
    listener();
  }
  return next;
}

/** Changes the look of the subtitles, leaving the rest of it alone. */
export function setSubtitleLook(change: Partial<SubtitleLook>): PlayerSettings {
  return setPlayerSettings({ subtitles: { ...playerSettings().subtitles, ...change } });
}

export function subscribeToSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Forgets what was read, for tests. */
export function resetSettingsCache(): void {
  current = null;
}
