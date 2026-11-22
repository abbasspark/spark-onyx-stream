// SPDX-License-Identifier: AGPL-3.0-only
import type { TitleType } from '@onyx/database';
import type { TitleDetail } from '../catalog/catalog.views.js';

/** The one source there is. A name, so a second one can be told apart later. */
export const METADATA_SOURCE = 'tmdb';

/** A title at the source, as offered to pick from. */
export interface MetadataSearchResult {
  /** The id at the source with its kind: "movie:603" or "tv:1399". */
  id: string;
  type: TitleType;
  name: string;
  originalName: string | null;
  releaseYear: number | null;
  overview: string | null;
  /** A small poster served by the source, to recognize the title. */
  posterUrl: string | null;
  /** Set when the catalog already has a title imported from this entry. */
  existingTitleId: string | null;
}

export interface ImportedSeasonSummary {
  number: number;
  name: string | null;
  episodeCount: number;
  /** The day its first episode was first shown, as "2021-09-05". */
  airDate: string | null;
  /** Path of its poster at the source. */
  poster: string | null;
}

/** Facts about a title that are not text for viewers to read. */
export interface ImportedFacts {
  /** The day of the premiere, as "1999-03-31". */
  releaseDate: string | null;
  runtimeMinutes: number | null;
  /** ISO 3166 codes. */
  countries: string[];
  studios: string[];
  keywords: string[];
  imdbId: string | null;
  /** From 0 to 10, with one decimal. Null when nobody voted. */
  rating: number | null;
  ratingCount: number | null;
  /** Series only. */
  seriesStatus: 'UPCOMING' | 'RUNNING' | 'ENDED' | 'CANCELLED' | null;
  lastAirDate: string | null;
}

/** One person's part in a title, as the source has it. */
export interface ImportedCredit {
  /** The id of the person at the source. */
  personId: number;
  name: string;
  /** Path of a picture of the person at the source. */
  portrait: string | null;
  /** What the person is mostly known as: "Acting", "Directing". */
  knownFor: string | null;
  kind: 'CAST' | 'CREW';
  /** The character played, or the job. */
  role: string | null;
}

/** The text of a title as the source has it, cut to what the catalog accepts. */
export interface ImportedText {
  name: string;
  originalName: string | null;
  tagline: string | null;
  synopsis: string | null;
  releaseYear: number | null;
  ageRating: string | null;
  originalLanguage: string | null;
}

/** Paths of pictures at the source. */
export interface ImportedArtwork {
  poster: string | null;
  backdrop: string | null;
  logo: string | null;
}

/** Everything read from the source about one title. */
export interface ImportedTitle extends ImportedText, ImportedFacts {
  id: string;
  type: TitleType;
  genres: string[];
  artwork: ImportedArtwork;
  seasons: ImportedSeasonSummary[];
  /** The cast in the order of the source, then the crew. */
  credits: ImportedCredit[];
}

/** What an import would bring, shown before anything is changed. */
export interface MetadataPreview extends ImportedText, ImportedFacts {
  id: string;
  /** How many people the import would bring. */
  cast: number;
  crew: number;
  /** The first few of the cast, to recognize the title by. */
  leads: string[];
  type: TitleType;
  language: string;
  /** Genres at the source, each with the category of the same name if there is one. */
  genres: { name: string; categoryId: string | null }[];
  /** Addresses of medium-sized pictures at the source. */
  artwork: { poster: string | null; backdrop: string | null; logo: string | null };
  seasons: ImportedSeasonSummary[];
  existingTitleId: string | null;
}

/** What an import did. */
export interface ImportReport {
  /** Fields of the title that were filled or replaced. */
  fields: string[];
  categoriesCreated: string[];
  /** Genres that were not known before. */
  genresCreated: string[];
  /** People that were not known before, and credits written. */
  peopleCreated: number;
  credits: number;
  seasonsCreated: number;
  episodesCreated: number;
  episodesUpdated: number;
  picturesAdded: number;
  /** What could not be done, in words for the admin. The rest was imported. */
  warnings: string[];
}

export interface ImportResult {
  title: TitleDetail;
  report: ImportReport;
}

export interface MetadataStatus {
  enabled: boolean;
  source: typeof METADATA_SOURCE;
  /** Language and country that an import defaults to. */
  language: string;
  region: string;
}
