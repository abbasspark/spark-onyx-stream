// SPDX-License-Identifier: AGPL-3.0-only
import type { TitleDetail } from '@/api/types';

export type SeasonMode = 'none' | 'structure' | 'full';

/** What a copy of a title takes along. The texts and facts always come. */
export interface DuplicateParts {
  artwork: boolean;
  classification: boolean;
  collections: boolean;
  credits: boolean;
  translations: boolean;
  pricing: boolean;
  availability: boolean;
  videos: boolean;
  seasons: SeasonMode;
  metadataLink: boolean;
}

export type TogglePart = Exclude<keyof DuplicateParts, 'seasons'>;

export type PresetKey = 'start' | 'exact' | 'template';

/** Ready-made choices. "start" is what the API does when nothing is said. */
export const PRESETS: Record<PresetKey, { label: string; hint: string; parts: DuplicateParts }> = {
  start: {
    label: 'Starting point',
    hint: 'Everything that describes the title, without its videos. For another cut or version.',
    parts: {
      artwork: true,
      classification: true,
      collections: false,
      credits: true,
      translations: true,
      pricing: true,
      availability: false,
      videos: false,
      seasons: 'structure',
      metadataLink: false,
    },
  },
  exact: {
    label: 'Exact copy',
    hint: 'All of it, videos included. Only the name, the address and the draft status differ.',
    parts: {
      artwork: true,
      classification: true,
      collections: true,
      credits: true,
      translations: true,
      pricing: true,
      availability: true,
      videos: true,
      seasons: 'full',
      metadataLink: true,
    },
  },
  template: {
    label: 'Texts only',
    hint: 'The name, the synopsis and the facts, and nothing around them.',
    parts: {
      artwork: false,
      classification: false,
      collections: false,
      credits: false,
      translations: false,
      pricing: false,
      availability: false,
      videos: false,
      seasons: 'none',
      metadataLink: false,
    },
  },
};

/** The preset the choices equal, if any: to mark it as chosen. */
export function presetOf(parts: DuplicateParts): PresetKey | null {
  const keys = Object.keys(PRESETS) as PresetKey[];
  return (
    keys.find((key) =>
      (Object.keys(parts) as (keyof DuplicateParts)[]).every(
        (part) => PRESETS[key].parts[part] === parts[part],
      ),
    ) ?? null
  );
}

const COPY_SUFFIX = ' (copy)';

/** The name offered for a copy: "(copy)" once, however often a copy is copied. */
export function copyName(name: string): string {
  const base = name.endsWith(COPY_SUFFIX) ? name.slice(0, -COPY_SUFFIX.length) : name;
  return `${base.slice(0, 200 - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`;
}

const count = (number: number, one: string, many: string) =>
  `${number} ${number === 1 ? one : many}`;

/** A sentence from parts: "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface PartRow {
  key: TogglePart;
  label: string;
  /** What exactly the title has of it. */
  detail: string;
  /** False when the title has nothing of it: the choice makes no difference. */
  available: boolean;
}

/** The choices of a copy, each with what this title has to give. */
export function partRows(title: TitleDetail): PartRow[] {
  const pictures = [
    title.poster ? 'poster' : null,
    title.backdrop ? 'backdrop' : null,
    title.logo ? 'logo' : null,
  ].filter((item): item is string => item !== null);
  const stills = title.seasons.reduce(
    (sum, season) =>
      sum + (season.poster ? 1 : 0) + season.episodes.filter((episode) => episode.still).length,
    0,
  );
  const classified = [
    title.genres.length > 0 ? count(title.genres.length, 'genre', 'genres') : null,
    title.categories.length > 0 ? count(title.categories.length, 'category', 'categories') : null,
    title.keywords.length > 0 ? count(title.keywords.length, 'keyword', 'keywords') : null,
  ].filter((item): item is string => item !== null);
  const prices = [
    title.access === 'PAID' ? 'for subscribers' : null,
    title.rentAmount !== null ? 'a rental price' : null,
    title.buyAmount !== null ? 'a purchase price' : null,
    title.packages.length > 0 ? count(title.packages.length, 'package', 'packages') : null,
  ].filter((item): item is string => item !== null);
  const videos = [
    title.asset ? 'the film' : null,
    title.trailerAsset ? 'the trailer' : null,
    title.extras.length > 0 ? count(title.extras.length, 'extra', 'extras') : null,
  ].filter((item): item is string => item !== null);
  const dated = title.availableFrom !== null || title.availableUntil !== null;

  return [
    {
      key: 'artwork',
      label: 'Artwork',
      detail:
        pictures.length + stills > 0
          ? `${capital(list([...pictures, ...(stills > 0 ? [count(stills, 'season or episode picture', 'season and episode pictures')] : [])]))}. The same pictures, not new files.`
          : 'This title has no pictures.',
      available: pictures.length + stills > 0,
    },
    {
      key: 'classification',
      label: 'Genres, categories and keywords',
      detail: classified.length > 0 ? list(classified) : 'This title has none.',
      available: classified.length > 0,
    },
    {
      key: 'credits',
      label: 'Cast and crew',
      detail:
        title.credits.length > 0
          ? count(title.credits.length, 'credit', 'credits')
          : 'This title has no credits.',
      available: title.credits.length > 0,
    },
    {
      key: 'translations',
      label: 'Translations',
      detail:
        title.translations.length > 0
          ? `${count(title.translations.length, 'language', 'languages')}: ${title.translations.join(', ')}`
          : 'This title is not translated.',
      available: title.translations.length > 0,
    },
    {
      key: 'pricing',
      label: 'Access and prices',
      detail: prices.length > 0 ? capital(list(prices)) : 'Free to watch, with no prices.',
      available: prices.length > 0,
    },
    {
      key: 'videos',
      label: title.type === 'MOVIE' ? 'Videos' : 'Trailer and extras',
      detail:
        videos.length > 0
          ? `${capital(list(videos))}. The same videos: nothing is encoded or stored again.`
          : 'This title has no videos of its own.',
      available: videos.length > 0,
    },
    {
      key: 'collections',
      label: 'Collections',
      detail:
        title.collections.length > 0
          ? `A place at the end of ${list(title.collections.map((collection) => collection.name))}`
          : 'This title is in no collection.',
      available: title.collections.length > 0,
    },
    {
      key: 'availability',
      label: 'Availability dates',
      detail: dated ? 'The dates it is shown between.' : 'This title has no dates.',
      available: dated,
    },
    {
      key: 'metadataLink',
      label: 'Link to TMDB',
      detail: title.metadata
        ? 'So the copy can be updated from TMDB too. Leave it off for a version TMDB does not know.'
        : 'This title was not imported.',
      available: title.metadata !== null,
    },
  ];
}

/** How many seasons, episodes and episode videos a series has. */
export function seasonCounts(title: TitleDetail): {
  seasons: number;
  episodes: number;
  videos: number;
} {
  const episodes = title.seasons.flatMap((season) => season.episodes);
  return {
    seasons: title.seasons.length,
    episodes: episodes.length,
    videos: episodes.filter((episode) => episode.asset).length,
  };
}

/** The choices for the seasons of a series, in words with its numbers. */
export function seasonOptions(
  title: TitleDetail,
): { value: SeasonMode; label: string; description: string }[] {
  const counts = seasonCounts(title);
  const shape = `${count(counts.seasons, 'season', 'seasons')}, ${count(counts.episodes, 'episode', 'episodes')}`;
  return [
    {
      value: 'structure',
      label: 'Seasons and episodes, without videos',
      description: `${shape}, as drafts waiting for their videos`,
    },
    {
      value: 'full',
      label: 'Seasons and episodes, with their videos',
      description: `${shape}, ${count(counts.videos, 'video', 'videos')}, as drafts`,
    },
    { value: 'none', label: 'No seasons', description: 'The series alone, to fill anew' },
  ];
}

/** What is sent: choices that have nothing to copy are sent as off. */
export function effectiveParts(title: TitleDetail, parts: DuplicateParts): DuplicateParts {
  const rows = partRows(title);
  const result = { ...parts };
  for (const row of rows) {
    if (!row.available) {
      result[row.key] = false;
    }
  }
  if (title.type !== 'SERIES' || title.seasons.length === 0) {
    result.seasons = 'none';
  }
  return result;
}
