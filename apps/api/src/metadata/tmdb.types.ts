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
  air_date?: string | null;
  poster_path?: string | null;
}

/** Someone in a title. Movies name one part per entry, series every part the person had. */
export interface TmdbCredit {
  id?: number;
  name?: string;
  profile_path?: string | null;
  known_for_department?: string;
  /** Position in the cast list. */
  order?: number;
  /** Movies. */
  character?: string;
  job?: string;
  department?: string;
  /** Series, from "aggregate_credits". */
  roles?: { character?: string; episode_count?: number }[];
  jobs?: { job?: string; episode_count?: number }[];
  total_episode_count?: number;
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
  /** Movies: minutes. */
  runtime?: number | null;
  /** Series: the usual lengths of an episode, in minutes. */
  episode_run_time?: number[];
  production_countries?: { iso_3166_1?: string }[];
  production_companies?: { name?: string }[];
  vote_average?: number;
  vote_count?: number;
  /** Series: "Returning Series", "Ended", "Canceled", "In Production", "Planned", "Pilot". */
  status?: string;
  last_air_date?: string | null;
  /** Movies carry it themselves, series under "external_ids". */
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  /** Movies name the list "keywords", series "results". */
  keywords?: { keywords?: { name?: string }[]; results?: { name?: string }[] };
  /** Movies. */
  credits?: { cast?: TmdbCredit[]; crew?: TmdbCredit[] };
  /** Series: everyone over all seasons. */
  aggregate_credits?: { cast?: TmdbCredit[]; crew?: TmdbCredit[] };
  /** Series. */
  created_by?: TmdbCredit[];
}

export interface TmdbEpisode {
  episode_number?: number;
  name?: string;
  overview?: string;
  still_path?: string | null;
  air_date?: string | null;
  runtime?: number | null;
}

export interface TmdbSeason extends TmdbSeasonSummary {
  episodes?: TmdbEpisode[];
}
