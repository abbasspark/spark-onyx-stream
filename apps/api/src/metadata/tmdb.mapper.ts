// SPDX-License-Identifier: AGPL-3.0-only
import type { TitleType } from '@onyx/database';
import type {
  ImportedSeasonSummary,
  ImportedTitle,
  MetadataSearchResult,
} from './metadata.types.js';
import type { TmdbDetails, TmdbEpisode, TmdbImage, TmdbSearchItem } from './tmdb.types.js';

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
  };
}

export interface ImportedEpisode {
  number: number;
  name: string;
  synopsis: string | null;
  still: string | null;
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
      });
    }
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}
