// SPDX-License-Identifier: AGPL-3.0-only
//
// Where a viewer stopped watching, kept in the browser. For a visitor this
// never leaves the device. For a signed-in viewer it is a copy of what the
// account holds, so the page has it at once and it survives a lost connection.

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
  /** Id of the video in the catalog: of the episode, or of the movie. */
  id?: string;
  /** Set when the viewer's account holds this entry as it is here. */
  synced?: boolean;
}

/** A position as the account takes it. */
export interface WatchReport {
  title: string;
  episodeId?: string;
  position: number;
  duration: number;
  watchedAt?: string;
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

export function replaceEntries(entries: readonly WatchEntry[]): void {
  writeEntries(entries.slice(0, MAX_ENTRIES));
}

/** Notes that the account holds an entry, unless the entry moved on since. */
export function markSynced(key: string, updatedAt: number): void {
  const entries = readEntries();
  const entry = entries.find((item) => item.key === key);
  if (entry && entry.updatedAt === updatedAt && !entry.synced) {
    entry.synced = true;
    writeEntries(entries);
  }
}

/**
 * Which video an entry is about, in the words of the catalog. The address of
 * the watch page says it: "/watch/{slug}" or "/watch/{slug}/{episodeId}".
 */
export function targetOf(
  entry: Pick<WatchEntry, 'href'>,
): Pick<WatchReport, 'title' | 'episodeId'> | null {
  const match = /^\/watch\/([^/?#]+)(?:\/([^/?#]+))?$/.exec(entry.href);
  if (!match?.[1]) {
    return null;
  }
  const title = decodeURIComponent(match[1]);
  return match[2] ? { title, episodeId: match[2] } : { title };
}

/** An entry made on this device, as a report for the account, with its time. */
export function toReport(entry: WatchEntry): WatchReport | null {
  const target = targetOf(entry);
  if (!target) {
    return null;
  }
  const watchedAt = Number.isFinite(entry.updatedAt)
    ? new Date(entry.updatedAt).toISOString()
    : undefined;
  return { ...target, position: entry.position, duration: entry.duration, watchedAt };
}

/**
 * The list of the account, with what this device knows better: entries the
 * account has not taken yet, when they are newer than the account's own.
 */
export function mergeUnsynced(
  account: readonly WatchEntry[],
  local: readonly WatchEntry[],
): WatchEntry[] {
  const merged = new Map(account.map((entry) => [entry.key, entry]));
  for (const entry of local) {
    if (entry.synced) {
      continue;
    }
    const held = merged.get(entry.key);
    if (!held || held.updatedAt < entry.updatedAt) {
      merged.set(entry.key, entry);
    }
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_ENTRIES);
}
