// SPDX-License-Identifier: AGPL-3.0-only
import type { WatchedFile, WatchedFileState, WatchLocation, WatchS3Config } from '@/api/types';
import type { BadgeTone } from '@/components/ui/display';

export const WATCH_STATE_LOOKS: Record<
  WatchedFileState,
  { label: string; tone: BadgeTone; about: string }
> = {
  WAITING: {
    label: 'Waiting',
    tone: 'neutral',
    about: 'Seen, and left alone until it has stopped changing',
  },
  UNRECOGNISED: {
    label: 'Not recognised',
    tone: 'warning',
    about: 'The name does not say what it is',
  },
  QUEUED: { label: 'Queued', tone: 'info', about: 'Waiting for its turn' },
  IMPORTING: { label: 'Importing', tone: 'info', about: 'Being copied into the library' },
  IMPORTED: { label: 'Imported', tone: 'success', about: 'In the catalog' },
  CONFLICT: {
    label: 'Has a video already',
    tone: 'warning',
    about: 'The title or episode has a video. You decide',
  },
  FAILED: { label: 'Failed', tone: 'danger', about: 'Something went wrong. The note says what' },
  IGNORED: { label: 'Set aside', tone: 'neutral', about: 'Left where it is, by an admin' },
};

/** The states an admin has to look at. */
export const ATTENTION_STATES: readonly WatchedFileState[] = ['UNRECOGNISED', 'CONFLICT', 'FAILED'];

/** "/watch/incoming" or "bucket/prefix": where a location is, in a line. */
export function placeOf(location: Pick<WatchLocation, 'driver' | 'config'>): string {
  if (location.driver === 'LOCAL') {
    return (location.config as { basePath: string }).basePath;
  }
  const config = location.config as WatchS3Config;
  return config.keyPrefix ? `${config.bucket}/${config.keyPrefix}` : config.bucket;
}

/** What a file was recognised as, in words: "Movie 603", "Series 1399 · S01E05". */
export function recognisedAs(
  file: Pick<WatchedFile, 'metadataId' | 'seasonNumber' | 'episodeNumber'>,
): string | null {
  if (!file.metadataId) {
    return null;
  }
  const [kind, id] = file.metadataId.split(':');
  if (kind === 'movie') {
    return `Movie ${id}`;
  }
  const two = (value: number) => String(value).padStart(2, '0');
  return file.seasonNumber !== null && file.episodeNumber !== null
    ? `Series ${id} · S${two(file.seasonNumber)}E${two(file.episodeNumber)}`
    : `Series ${id}`;
}

/** The number of files of a location in the given states. */
export function countIn(
  counts: Partial<Record<WatchedFileState, number>>,
  states: readonly WatchedFileState[],
): number {
  return states.reduce((sum, state) => sum + (counts[state] ?? 0), 0);
}

/** "every 5 minutes", "every hour", "every 2 hours", "once a day". */
export function intervalText(minutes: number): string {
  if (minutes === 1440) {
    return 'once a day';
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'every hour' : `every ${hours} hours`;
  }
  return minutes === 1 ? 'every minute' : `every ${minutes} minutes`;
}

/**
 * Reads what the admin typed to say what a file is: a number, or an address
 * of TMDB such as "themoviedb.org/movie/603-the-matrix". Null when it holds no id.
 */
export function parseTmdbReference(
  text: string,
): { id: number; kind: 'MOVIE' | 'SERIES' | null } | null {
  const value = text.trim();
  const address = /themoviedb\.org\/(movie|tv)\/(\d{1,9})/i.exec(value);
  if (address) {
    return {
      id: Number(address[2]),
      kind: address[1]?.toLowerCase() === 'tv' ? 'SERIES' : 'MOVIE',
    };
  }
  const tagged = /^(movie|tv)[:/ ](\d{1,9})$/i.exec(value);
  if (tagged) {
    return { id: Number(tagged[2]), kind: tagged[1]?.toLowerCase() === 'tv' ? 'SERIES' : 'MOVIE' };
  }
  return /^\d{1,9}$/.test(value) && Number(value) > 0 ? { id: Number(value), kind: null } : null;
}
