// SPDX-License-Identifier: AGPL-3.0-only
//
// The parts of TMDB's answers that are read here. Everything is optional:
// what another service sends is checked where it is used, not trusted.

export interface TmdbSearchItem {
  id?: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
}

export interface TmdbSearchPage {
  results?: TmdbSearchItem[];
  total_results?: number;
}

export interface TmdbImage {
  file_path?: string;
  iso_639_1?: string | null;
  vote_average?: number;
}

export interface TmdbSeasonSummary {
  season_number?: number;
  name?: string;
  overview?: string;
  episode_count?: number;
}

export interface TmdbDetails extends TmdbSearchItem {
  tagline?: string;
  original_language?: string;
  genres?: { id?: number; name?: string }[];
  backdrop_path?: string | null;
  images?: { logos?: TmdbImage[] };
  /** Movies: age ratings per country. */
  release_dates?: {
    results?: { iso_3166_1?: string; release_dates?: { certification?: string }[] }[];
  };
  /** Series: age ratings per country. */
  content_ratings?: { results?: { iso_3166_1?: string; rating?: string }[] };
  seasons?: TmdbSeasonSummary[];
}

export interface TmdbEpisode {
  episode_number?: number;
  name?: string;
  overview?: string;
  still_path?: string | null;
}

export interface TmdbSeason extends TmdbSeasonSummary {
  episodes?: TmdbEpisode[];
}
