// SPDX-License-Identifier: AGPL-3.0-only
//
// Where a viewer stopped watching, kept in the browser. There are no viewer
// accounts yet, so this never leaves the device.

export interface WatchEntry {
  /** What is watched: "movie:{slug}" or "episode:{episodeId}". */
  key: string;
  /** Address of the watch page. */
  href: string;
  /** Name of the movie or the series. */
  name: string;
  /** For an episode: "S1 E3 The Trench". */
  detail: string | null;
  /** A wide picture: the still of the episode or the backdrop of the title. */
  image: string | null;
  /** Seconds watched and seconds in total. */
  position: number;
  duration: number;
  /** Milliseconds since 1970, to order the list. */
  updatedAt: number;
}

export const STORAGE_KEY = 'onyx.web.watching.v1';
export const MAX_ENTRIES = 30;
/** The first seconds do not count as having started. */
const MIN_POSITION_SECONDS = 15;
/** From here on, the credits are running and the video counts as watched. */
const FINISHED_FRACTION = 0.95;

/** Whether a position is worth coming back to: started, and not finished. */
export function isResumable(position: number, duration: number): boolean {
  return (
    duration > 0 && position >= MIN_POSITION_SECONDS && position / duration < FINISHED_FRACTION
  );
}

/**
 * Puts an entry at the front of the list, replacing an older one for the same
 * video. An entry that is not worth resuming is removed instead.
 */
export function withEntry(entries: readonly WatchEntry[], entry: WatchEntry): WatchEntry[] {
  const others = entries.filter((existing) => existing.key !== entry.key);
  if (!isResumable(entry.position, entry.duration)) {
    return others;
  }
  return [entry, ...others].slice(0, MAX_ENTRIES);
}

/** Reads stored text. Anything that is not a list of entries counts as empty. */
export function parseEntries(raw: string | null): WatchEntry[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is WatchEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as WatchEntry).key === 'string' &&
        typeof (item as WatchEntry).href === 'string' &&
        typeof (item as WatchEntry).name === 'string' &&
        Number.isFinite((item as WatchEntry).position) &&
        Number.isFinite((item as WatchEntry).duration),
    );
  } catch {
    return [];
  }
}

/** Event sent in this tab when the list changes. Other tabs get "storage". */
export const CHANGE_EVENT = 'onyx:watching';

export function readEntries(): WatchEntry[] {
  try {
    return parseEntries(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage can be blocked. Watching still works, it is just not remembered.
    return [];
  }
}

function writeEntries(entries: WatchEntry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // See readEntries.
  }
}

export function saveEntry(entry: WatchEntry): void {
  writeEntries(withEntry(readEntries(), entry));
}

export function removeEntry(key: string): void {
  writeEntries(readEntries().filter((entry) => entry.key !== key));
}

export function findEntry(key: string): WatchEntry | undefined {
  return readEntries().find((entry) => entry.key === key);
}
