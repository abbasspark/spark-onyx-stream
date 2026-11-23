// SPDX-License-Identifier: AGPL-3.0-only
import type { TitleType } from '@onyx/database';
import type {
  ImportedCollection,
  ImportedCredit,
  ImportedFacts,
  ImportedSeasonSummary,
  ImportedTitle,
  MetadataSearchResult,
} from './metadata.types.js';
import type {
  TmdbCredit,
  TmdbDetails,
  TmdbEpisode,
  TmdbImage,
  TmdbSearchItem,
} from './tmdb.types.js';

export type TmdbKind = 'movie' | 'tv';

const KIND_OF: Record<TitleType, TmdbKind> = { MOVIE: 'movie', SERIES: 'tv' };
const TYPE_OF: Record<TmdbKind, TitleType> = { movie: 'MOVIE', tv: 'SERIES' };

export const kindOf = (type: TitleType): TmdbKind => KIND_OF[type];

/** "movie:603" for a movie with the id 603. */
export function toMetadataId(kind: TmdbKind, id: number): string {
  return `${kind}:${id}`;
}

export const METADATA_ID_PATTERN = /^(movie|tv):(\d{1,10})$/;

/** @returns null for anything that is not of the form "movie:603" or "tv:1399". */
export function parseMetadataId(
  value: string,
): { kind: TmdbKind; id: number; type: TitleType } | null {
  const match = METADATA_ID_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const kind = match[1] as TmdbKind;
  return { kind, id: Number(match[2]), type: TYPE_OF[kind] };
}

/**
 * A path of a picture as TMDB gives it: a slash, a file name, an extension.
 * Anything else is dropped, so an answer can never point a download elsewhere.
 */
const IMAGE_PATH_PATTERN = /^\/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp|svg)$/;

export function safeImagePath(path: unknown): string | null {
  if (typeof path !== 'string' || !IMAGE_PATH_PATTERN.test(path)) {
    return null;
  }
  // Logos are often drawings. TMDB also serves each of them as a PNG.
  return path.replace(/\.svg$/, '.png');
}

/** Trims text, treats empty as missing, and cuts it to what the catalog accepts. */
export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '') {
    return null;
  }
  if (text.length <= maxLength) {
    return text;
  }
  // Cut at a word, and say that something is missing.
  const cut = text.slice(0, maxLength - 1);
  const atWord = cut.lastIndexOf(' ') > maxLength * 0.6 ? cut.slice(0, cut.lastIndexOf(' ')) : cut;
  return `${atWord.replace(/[\s,;:.]+$/, '')}…`;
}

/** Paragraphs are kept in a synopsis. Everything else about it is as cleanText. */
export function cleanLongText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text === '') {
    return null;
  }
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** The year of a date such as "1999-03-31". */
export function yearOf(date: unknown): number | null {
  if (typeof date !== 'string') {
    return null;
  }
  const year = Number(/^(\d{4})-\d{2}-\d{2}$/.exec(date)?.[1]);
  return Number.isInteger(year) && year >= 1888 && year <= 2200 ? year : null;
}

/** A date such as "1999-03-31" that is a real day, or null. */
export function dateOf(date: unknown): string | null {
  if (typeof date !== 'string' || yearOf(date) === null) {
    return null;
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : null;
}

/** Minutes of a film or of an episode, when the figure makes sense. */
export function minutesOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1500
    ? value
    : null;
}

/** Cleans a list of names: trimmed, without repeats, and no more than a limit. */
function namesOf(values: readonly unknown[], maxLength: number, limit: number): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = cleanText(value, maxLength);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }
  return names.slice(0, limit);
}

const SERIES_STATUS: Record<string, NonNullable<ImportedFacts['seriesStatus']>> = {
  'returning series': 'RUNNING',
  ended: 'ENDED',
  canceled: 'CANCELLED',
  cancelled: 'CANCELLED',
  'in production': 'UPCOMING',
  planned: 'UPCOMING',
  pilot: 'UPCOMING',
};

/** The facts of a title that are not text: dates, length, where and by whom it was made. */
export function factsOf(kind: TmdbKind, details: TmdbDetails): ImportedFacts {
  const votes =
    typeof details.vote_count === 'number' && details.vote_count > 0 ? details.vote_count : 0;
  const rating =
    votes > 0 && typeof details.vote_average === 'number' && details.vote_average > 0
      ? Math.round(Math.min(10, details.vote_average) * 10) / 10
      : null;
  // A movie carries its IMDb id itself; a series has it among its external ids only.
  const imdbId =
    kind === 'movie'
      ? (details.imdb_id ?? details.external_ids?.imdb_id)
      : details.external_ids?.imdb_id;
  const keywords = kind === 'movie' ? details.keywords?.keywords : details.keywords?.results;
  return {
    releaseDate: dateOf(kind === 'movie' ? details.release_date : details.first_air_date),
    runtimeMinutes:
      kind === 'movie'
        ? minutesOf(details.runtime)
        : minutesOf(details.episode_run_time?.find((minutes) => minutesOf(minutes) !== null)),
    countries: (details.production_countries ?? [])
      .map((country) => country.iso_3166_1)
      .filter((code): code is string => typeof code === 'string' && /^[A-Z]{2}$/.test(code))
      .filter((code, index, all) => all.indexOf(code) === index)
      .slice(0, 8),
    studios: namesOf(
      (details.production_companies ?? []).map((company) => company.name),
      120,
      8,
    ),
    keywords: namesOf(
      (keywords ?? []).map((keyword) => keyword.name),
      60,
      30,
    ),
    imdbId: typeof imdbId === 'string' && /^tt\d{6,10}$/.test(imdbId) ? imdbId : null,
    rating,
    ratingCount: rating === null ? null : Math.round(votes),
    seriesStatus:
      kind === 'tv' && typeof details.status === 'string'
        ? (SERIES_STATUS[details.status.toLowerCase()] ?? null)
        : null,
    lastAirDate: kind === 'tv' ? dateOf(details.last_air_date) : null,
  };
}

/** How many of the cast are taken. Beyond that come the extras nobody looks for. */
export const MAX_CAST = 20;
/**
 * The jobs behind the camera that are taken, in the order they are listed.
 * A film has hundreds of crew. These are the ones people look titles up by.
 */
const CREW_JOBS = [
  'Creator',
  'Director',
  'Screenplay',
  'Writer',
  'Story',
  'Novel',
  'Producer',
  'Executive Producer',
  'Director of Photography',
  'Original Music Composer',
  'Editor',
] as const;
/** At most this many people per job, so a series with thirty producers does not fill the page. */
const MAX_PER_JOB = 4;

function personOf(
  credit: TmdbCredit,
): Pick<ImportedCredit, 'personId' | 'name' | 'portrait' | 'knownFor'> | null {
  const name = cleanText(credit.name, 200);
  if (!Number.isInteger(credit.id) || (credit.id as number) <= 0 || !name) {
    return null;
  }
  return {
    personId: credit.id as number,
    name,
    portrait: safeImagePath(credit.profile_path),
    knownFor: cleanText(credit.known_for_department, 60),
  };
}

/**
 * The people of a title: the first of the cast in the order of the source,
 * then the crew that matters, job by job.
 *
 * A series lists everyone over all its seasons. An actor is given the
 * character they played in the most episodes, and a job goes to those who
 * did it for the most episodes.
 */
export function creditsOf(kind: TmdbKind, details: TmdbDetails): ImportedCredit[] {
  const source = kind === 'movie' ? details.credits : details.aggregate_credits;
  const credits: ImportedCredit[] = [];

  const cast = [...(source?.cast ?? [])].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  );
  const seenCast = new Set<number>();
  for (const entry of cast) {
    const person = personOf(entry);
    if (!person || seenCast.has(person.personId)) {
      continue;
    }
    const mainRole = [...(entry.roles ?? [])].sort(
      (a, b) => (b.episode_count ?? 0) - (a.episode_count ?? 0),
    )[0]?.character;
    seenCast.add(person.personId);
    credits.push({
      ...person,
      kind: 'CAST',
      role: cleanText(kind === 'movie' ? entry.character : mainRole, 200),
    });
    if (seenCast.size >= MAX_CAST) {
      break;
    }
  }

  // Everyone with the jobs they had, and for how many episodes.
  const crew: { person: NonNullable<ReturnType<typeof personOf>>; job: string; weight: number }[] =
    [];
  for (const entry of details.created_by ?? []) {
    const person = personOf(entry);
    if (person) {
      crew.push({ person, job: 'Creator', weight: Number.MAX_SAFE_INTEGER });
    }
  }
  for (const entry of source?.crew ?? []) {
    const person = personOf(entry);
    if (!person) {
      continue;
    }
    const jobs = kind === 'movie' ? [{ job: entry.job, episode_count: 1 }] : (entry.jobs ?? []);
    for (const { job, episode_count: episodes } of jobs) {
      if (typeof job === 'string') {
        crew.push({ person, job, weight: episodes ?? 0 });
      }
    }
  }
  for (const job of CREW_JOBS) {
    const seen = new Set<number>();
    const holders = crew
      .filter((entry) => entry.job === job)
      // A stable sort: among equals the order of the source stays.
      .sort((a, b) => b.weight - a.weight);
    for (const { person } of holders) {
      if (seen.has(person.personId)) {
        continue;
      }
      seen.add(person.personId);
      credits.push({ ...person, kind: 'CREW', role: job });
      if (seen.size >= MAX_PER_JOB) {
        break;
      }
    }
  }
  return credits;
}

/** A language code the catalog accepts, or null. TMDB uses "xx" for "no language". */
export function languageOf(code: unknown): string | null {
  return typeof code === 'string' && /^[a-z]{2,3}$/.test(code) && code !== 'xx' ? code : null;
}

/**
 * The age rating of the wanted country. A movie can have several releases in
 * one country, some without a rating: the first one that has one is taken.
 */
export function ageRatingOf(details: TmdbDetails, region: string): string | null {
  const movie = details.release_dates?.results
    ?.find((entry) => entry.iso_3166_1 === region)
    ?.release_dates?.map((release) => release.certification)
    .find((certification) => typeof certification === 'string' && certification.trim() !== '');
  const series = details.content_ratings?.results?.find(
    (entry) => entry.iso_3166_1 === region,
  )?.rating;
  return cleanText(movie ?? series, 16);
}

/**
 * Picks the logo: one in the wanted language, else an English one, else one
 * without words. Among those the one TMDB's users rated best.
 */
export function pickLogo(logos: readonly TmdbImage[] | undefined, language: string): string | null {
  const wanted = language.slice(0, 2);
  const rank = (logo: TmdbImage): number =>
    logo.iso_639_1 === wanted ? 0 : logo.iso_639_1 === 'en' ? 1 : !logo.iso_639_1 ? 2 : 3;
  const best = [...(logos ?? [])]
    .filter((logo) => safeImagePath(logo.file_path) !== null && rank(logo) < 3)
    .sort((a, b) => rank(a) - rank(b) || (b.vote_average ?? 0) - (a.vote_average ?? 0))[0];
  return safeImagePath(best?.file_path);
}

/** TMDB names a season "Season 2" when it has no name. That is not a name worth storing. */
export function seasonNameOf(name: unknown, number: number): string | null {
  const text = cleanText(name, 200);
  return text &&
    !new RegExp(`^(season|series|staffel|saison|temporada|stagione) ${number}$`, 'i').test(text)
    ? text
    : null;
}

/** The seasons that have episodes, in order. Specials are season 0. */
export function seasonsOf(details: TmdbDetails): ImportedSeasonSummary[] {
  return (details.seasons ?? [])
    .filter(
      (season) =>
        Number.isInteger(season.season_number) &&
        (season.season_number as number) >= 0 &&
        (season.episode_count ?? 0) > 0,
    )
    .map((season) => ({
      number: season.season_number as number,
      name: seasonNameOf(season.name, season.season_number as number),
      episodeCount: season.episode_count as number,
      airDate: dateOf(season.air_date),
      poster: safeImagePath(season.poster_path),
    }))
    .sort((a, b) => a.number - b.number);
}

export function toSearchResult(
  kind: TmdbKind,
  item: TmdbSearchItem,
  thumbnailBase: string,
): Omit<MetadataSearchResult, 'existingTitleId'> | null {
  const name = cleanText(kind === 'movie' ? item.title : item.name, 200);
  if (!Number.isInteger(item.id) || !name) {
    return null;
  }
  const originalName = cleanText(kind === 'movie' ? item.original_title : item.original_name, 200);
  const poster = safeImagePath(item.poster_path);
  return {
    id: toMetadataId(kind, item.id as number),
    type: TYPE_OF[kind],
    name,
    originalName: originalName === name ? null : originalName,
    releaseYear: yearOf(kind === 'movie' ? item.release_date : item.first_air_date),
    overview: cleanText(item.overview, 400),
    posterUrl: poster ? `${thumbnailBase}${poster}` : null,
  };
}

/** @throws Error when the answer has no name, which no real title lacks. */
export function toImportedTitle(
  kind: TmdbKind,
  details: TmdbDetails,
  options: { language: string; region: string },
): ImportedTitle {
  const name = cleanText(kind === 'movie' ? details.title : details.name, 200);
  if (!Number.isInteger(details.id) || !name) {
    throw new Error('The answer names no title');
  }
  const originalName = cleanText(
    kind === 'movie' ? details.original_title : details.original_name,
    200,
  );
  const genres = (details.genres ?? [])
    .map((genre) => cleanText(genre.name, 80))
    .filter((genre): genre is string => genre !== null);

  return {
    id: toMetadataId(kind, details.id as number),
    type: TYPE_OF[kind],
    name,
    originalName: originalName === name ? null : originalName,
    tagline: cleanText(details.tagline, 200),
    synopsis: cleanLongText(details.overview, 5000),
    releaseYear: yearOf(kind === 'movie' ? details.release_date : details.first_air_date),
    ageRating: ageRatingOf(details, options.region),
    originalLanguage: languageOf(details.original_language),
    genres: [...new Set(genres)],
    artwork: {
      poster: safeImagePath(details.poster_path),
      backdrop: safeImagePath(details.backdrop_path),
      logo: pickLogo(details.images?.logos, options.language),
    },
    seasons: kind === 'tv' ? seasonsOf(details) : [],
    ...factsOf(kind, details),
    credits: creditsOf(kind, details),
    collection: collectionOf(details),
  };
}

/** The series of films a movie belongs to, when the source names one. */
export function collectionOf(details: TmdbDetails): ImportedCollection | null {
  const collection = details.belongs_to_collection;
  const name = cleanText(collection?.name, 200);
  if (!collection || !name || !Number.isSafeInteger(collection.id) || Number(collection.id) <= 0) {
    return null;
  }
  return {
    id: String(collection.id),
    name,
    poster: safeImagePath(collection.poster_path),
    backdrop: safeImagePath(collection.backdrop_path),
  };
}

export interface ImportedEpisode {
  number: number;
  name: string;
  synopsis: string | null;
  still: string | null;
  /** The day it was first shown, as "2021-09-05". */
  airDate: string | null;
  runtimeMinutes: number | null;
}

/** The episodes of a season that have a number, in order, each number once. */
export function episodesOf(episodes: readonly TmdbEpisode[] | undefined): ImportedEpisode[] {
  const byNumber = new Map<number, ImportedEpisode>();
  for (const episode of episodes ?? []) {
    const number = episode.episode_number;
    if (!Number.isInteger(number) || (number as number) < 0 || (number as number) > 10_000) {
      continue;
    }
    if (!byNumber.has(number as number)) {
      byNumber.set(number as number, {
        number: number as number,
        name: cleanText(episode.name, 200) ?? `Episode ${number}`,
        synopsis: cleanLongText(episode.overview, 5000),
        still: safeImagePath(episode.still_path),
        airDate: dateOf(episode.air_date),
        runtimeMinutes: minutesOf(episode.runtime),
      });
    }
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}
