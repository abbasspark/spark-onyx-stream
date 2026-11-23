// SPDX-License-Identifier: AGPL-3.0-only

/** File endings taken for videos. Everything else in a watched location is left alone. */
export const VIDEO_EXTENSIONS = [
  'mp4',
  'm4v',
  'mkv',
  'mov',
  'webm',
  'avi',
  'ts',
  'm2ts',
  'mpg',
  'mpeg',
  'wmv',
  'flv',
] as const;

/** Files that travel with a video of the same name: subtitles and notes. */
export const SIDECAR_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa', 'sub', 'idx', 'nfo', 'txt'] as const;

/** Folders of a location the importer puts files into itself. Never looked through. */
export const IMPORTED_FOLDER = 'imported';

export interface RecognisedName {
  /** "movie:603" or "tv:1399", as the catalog remembers where a title came from. */
  metadataId: string;
  /** Set for an episode. */
  seasonNumber: number | null;
  episodeNumber: number | null;
  /** The rest of the name, for people: "the-matrix". */
  label: string;
}

const NAME = /^(?:tmdb[-_ ]?)?(\d{1,9})(?:[-_ .]+s(\d{1,3})[-_ .]?e(\d{1,4}))?(?:[-_ .]+(.*))?$/i;

/** The name of a file without its folders. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** "mkv" for "a/b/603_x.MKV". Empty when the file has no ending. */
export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Whether a file of a watched location is a video to import. Hidden files,
 * files still being copied by common tools, and everything the importer
 * moved away itself are not.
 */
export function isCandidate(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((part) => part.startsWith('.')) || parts[0] === IMPORTED_FOLDER) {
    return false;
  }
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(path));
}

/**
 * Reads what a file is from its name.
 *
 *   603_the-matrix.mkv            the movie 603 of TMDB
 *   1399_S01E05_the-pointy-end.mp4  season 1, episode 5 of the series 1399
 *
 * The id comes first. A season and an episode make it an episode of a series,
 * without them it is a movie: the two kinds have ids of their own at TMDB, so
 * the name has to say which is meant. Dashes, dots and spaces work like the
 * underscore, and capitals do not matter.
 *
 * @returns null when the name does not start that way.
 */
export function parseWatchedName(path: string): RecognisedName | null {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  const stem = dot <= 0 ? name : name.slice(0, dot);
  const match = NAME.exec(stem.trim());
  if (!match) {
    return null;
  }
  const id = Number(match[1]);
  if (id <= 0) {
    return null;
  }
  const isEpisode = match[2] !== undefined && match[3] !== undefined;
  const episodeNumber = isEpisode ? Number(match[3]) : null;
  if (episodeNumber === 0) {
    return null;
  }
  return {
    metadataId: `${isEpisode ? 'tv' : 'movie'}:${id}`,
    seasonNumber: isEpisode ? Number(match[2]) : null,
    episodeNumber,
    label: (match[4] ?? '').trim(),
  };
}

/** "603_the-matrix" for "in/603_the-matrix.mkv": what its sidecar files start with. */
export function stemOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot <= path.lastIndexOf('/') + 1 ? path : path.slice(0, dot);
}

/**
 * Whether a file belongs to a video: the same name with another ending, with a
 * language and a note in between when there are any. "603_x.en.srt" and
 * "603_x.en.forced.srt" belong to "603_x.mkv".
 */
export function isSidecarOf(video: string, other: string): boolean {
  if (other === video || !(SIDECAR_EXTENSIONS as readonly string[]).includes(extensionOf(other))) {
    return false;
  }
  const stem = stemOf(video);
  const rest = other.startsWith(`${stem}.`) ? other.slice(stem.length + 1) : null;
  return rest !== null && /^([A-Za-z_-]{2,10}\.){0,3}[A-Za-z0-9]+$/.test(rest);
}

/** Where a file goes once it is imported: the same path under "imported". */
export function importedPath(path: string): string {
  return `${IMPORTED_FOLDER}/${path}`;
}

/** "S01E05" */
export function episodeCode(season: number, episode: number): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `S${two(season)}E${two(episode)}`;
}
