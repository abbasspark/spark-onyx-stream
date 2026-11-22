// SPDX-License-Identifier: AGPL-3.0-only
import { parsePrice, toPriceText } from './billing';
import type {
  Credit,
  CreditInput,
  Episode,
  SeriesStatus,
  TitleDetail,
  TitleSummary,
  TitleType,
  UpdateTitleInput,
} from '@/api/types';
import { formatDuration, humanize } from './format';

/** Where a title is edited: movies and series have sections of their own. */
export function titlePath(title: { id: string; type: TitleType }): string {
  return `${sectionPath(title.type)}/${title.id}`;
}

export const sectionPath = (type: TitleType) => (type === 'SERIES' ? '/series' : '/movies');

/** The filters that mean the same for movies and for series. */
const SHARED_FILTERS = [
  'q',
  'status',
  'access',
  'category',
  'genre',
  'person',
  'package',
  'packaged',
];

/**
 * The query string for the other section, keeping the filters both sections know.
 * Sorting, the page and filters of one kind alone are left behind.
 */
export function sharedSearch(search: string): string {
  const from = new URLSearchParams(search);
  const next = new URLSearchParams();
  for (const key of SHARED_FILTERS) {
    const value = from.get(key);
    if (value) {
      next.set(key, value);
    }
  }
  const text = next.toString();
  return text ? `?${text}` : '';
}

/** "2 h 16 min", "48 min". */
export function formatRuntime(minutes: number | null | undefined): string {
  if (!minutes || minutes < 1) {
    return '–';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "8.2", always with one decimal. */
export const formatRating = (rating: number | null | undefined) =>
  rating === null || rating === undefined ? '–' : rating.toFixed(1);

export const SERIES_STATUS_LOOKS: Record<
  SeriesStatus,
  { label: string; tone: 'success' | 'neutral' | 'info' | 'warning'; about: string }
> = {
  UPCOMING: { label: 'Upcoming', tone: 'info', about: 'Announced, with nothing shown yet' },
  RUNNING: { label: 'Running', tone: 'success', about: 'More episodes are to come' },
  ENDED: { label: 'Ended', tone: 'neutral', about: 'The story is told' },
  CANCELLED: { label: 'Cancelled', tone: 'warning', about: 'Stopped before its end' },
};

/**
 * How much of a series has its video, for a bar and a sentence.
 * A series without episodes has nothing to be complete with.
 */
export function videoProgress(title: Pick<TitleSummary, 'episodeCount' | 'readyEpisodeCount'>): {
  percent: number;
  label: string;
  complete: boolean;
} {
  if (title.episodeCount === 0) {
    return { percent: 0, label: 'No episodes yet', complete: false };
  }
  const missing = title.episodeCount - title.readyEpisodeCount;
  return {
    percent: Math.round((title.readyEpisodeCount / title.episodeCount) * 100),
    label:
      missing === 0
        ? `All ${title.episodeCount} ${title.episodeCount === 1 ? 'episode has' : 'episodes have'} a video`
        : `${title.readyEpisodeCount} of ${title.episodeCount} episodes have a video`,
    complete: missing === 0,
  };
}

export type EpisodeState = 'published' | 'ready' | 'working' | 'failed' | 'empty';

/** Where an episode stands on its way to viewers. */
export function episodeState(episode: Pick<Episode, 'status' | 'asset'>): EpisodeState {
  if (!episode.asset) {
    return 'empty';
  }
  if (episode.asset.playable) {
    return episode.status === 'PUBLISHED' ? 'published' : 'ready';
  }
  return episode.asset.status === 'FAILED' ? 'failed' : 'working';
}

export const EPISODE_STATE_LOOKS: Record<EpisodeState, { label: string; className: string }> = {
  published: { label: 'Published', className: 'border-success bg-success text-white' },
  ready: {
    label: 'Video ready, not published',
    className: 'border-success/60 bg-success/15 text-foreground',
  },
  working: {
    label: 'Video in the works',
    className: 'border-info/60 bg-info/15 text-foreground',
  },
  failed: {
    label: 'Video failed',
    className: 'border-destructive/60 bg-destructive/15 text-foreground',
  },
  empty: { label: 'No video', className: 'border-dashed text-muted-foreground' },
};

/** How many episodes are in each state, in the order the states are explained. */
export function countStates(
  episodes: readonly Pick<Episode, 'status' | 'asset'>[],
): [state: EpisodeState, count: number][] {
  const counts = new Map<EpisodeState, number>();
  for (const episode of episodes) {
    const state = episodeState(episode);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  return (Object.keys(EPISODE_STATE_LOOKS) as EpisodeState[])
    .filter((state) => counts.has(state))
    .map((state) => [state, counts.get(state) ?? 0]);
}

/** Years a series ran: "2019–2023", "2021–" while it runs, "2021" for one year. */
export function yearsOf(
  title: Pick<TitleDetail, 'releaseYear' | 'seriesStatus' | 'lastAirDate'>,
): string {
  if (!title.releaseYear) {
    return '';
  }
  const last = title.lastAirDate ? Number(title.lastAirDate.slice(0, 4)) : null;
  if (title.seriesStatus === 'RUNNING' || title.seriesStatus === 'UPCOMING') {
    return `${title.releaseYear}–`;
  }
  return last && last !== title.releaseYear
    ? `${title.releaseYear}–${last}`
    : String(title.releaseYear);
}

const regionNames =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(undefined, { type: 'region' })
    : null;

/** "Germany" for "DE". The code itself when the browser does not know it. */
export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Splits what was typed into a list: by commas or lines, trimmed, each entry once. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(
      (entry) => entry !== '' && !seen.has(entry.toLowerCase()) && seen.add(entry.toLowerCase()),
    );
}

/** The credits of a title in the shape they are saved in. */
export function toCreditInputs(
  credits: readonly Pick<Credit, 'kind' | 'role' | 'person'>[],
): CreditInput[] {
  return credits.map((credit) => ({
    personId: credit.person.id,
    kind: credit.kind,
    role: credit.role?.trim() || null,
  }));
}

/** Says what stands in the way of saving a list of credits, or null. */
export function creditsProblem(credits: readonly CreditInput[]): string | null {
  const seen = new Set<string>();
  for (const credit of credits) {
    const key = `${credit.personId}|${credit.kind}|${(credit.role ?? '').toLowerCase()}`;
    if (seen.has(key)) {
      return 'The same person is listed twice with the same part.';
    }
    seen.add(key);
  }
  return null;
}

/** What a title contains, in a few words: the length of a movie or the size of a series. */
export function describeContent(title: TitleSummary): string {
  if (title.type === 'SERIES') {
    if (title.seasonCount === 0) {
      return 'No seasons yet';
    }
    const seasons = `${title.seasonCount} ${title.seasonCount === 1 ? 'season' : 'seasons'}`;
    const episodes = `${title.episodeCount} ${title.episodeCount === 1 ? 'episode' : 'episodes'}`;
    return `${seasons} · ${episodes}`;
  }
  if (!title.asset) {
    return 'No video yet';
  }
  return title.asset.status === 'READY'
    ? formatDuration(title.asset.durationMs)
    : `Video ${humanize(title.asset.status).toLowerCase()}`;
}

/** The text fields of a title as the form holds them: always strings. */
export interface DetailsForm {
  name: string;
  originalName: string;
  tagline: string;
  synopsis: string;
  releaseYear: string;
  ageRating: string;
  originalLanguage: string;
  /** "1999-03-31", as a date field holds it. */
  releaseDate: string;
  runtimeMinutes: string;
  /** Country codes, studios and keywords as typed: separated by commas. */
  countries: string;
  studios: string;
  keywords: string;
  imdbId: string;
  /** Empty for "not known". */
  seriesStatus: SeriesStatus | '';
  genreIds: string[];
  slug: string;
  isFeatured: boolean;
  /** Whether watching needs a subscription. */
  isPaid: boolean;
  categoryIds: string[];
  /** The packages through which plans open the title. */
  packageIds: string[];
  /** Prices as typed, such as "3.99". Empty: not on offer. */
  rentPrice: string;
  buyPrice: string;
  /** Whether no subscription opens the title. */
  purchaseOnly: boolean;
}

export function toForm(title: TitleDetail, currency = 'EUR'): DetailsForm {
  return {
    rentPrice: toPriceText(title.rentAmount, currency),
    buyPrice: toPriceText(title.buyAmount, currency),
    purchaseOnly: title.purchaseOnly,
    name: title.name,
    originalName: title.originalName ?? '',
    tagline: title.tagline ?? '',
    synopsis: title.synopsis ?? '',
    releaseYear: title.releaseYear === null ? '' : String(title.releaseYear),
    ageRating: title.ageRating ?? '',
    originalLanguage: title.originalLanguage ?? '',
    releaseDate: title.releaseDate ?? '',
    runtimeMinutes: title.runtimeMinutes === null ? '' : String(title.runtimeMinutes),
    countries: title.countries.join(', '),
    studios: title.studios.join(', '),
    keywords: title.keywords.join(', '),
    imdbId: title.imdbId ?? '',
    seriesStatus: title.seriesStatus ?? '',
    genreIds: title.genres.map((genre) => genre.id).sort(),
    slug: title.slug,
    isFeatured: title.isFeatured,
    isPaid: title.access === 'PAID',
    categoryIds: title.categories.map((category) => category.id).sort(),
    packageIds: title.packages.map((item) => item.id).sort(),
  };
}

/** What stands in the way of saving the facts of a title, or null. */
export function factsProblem(form: DetailsForm): string | null {
  const minutes = form.runtimeMinutes.trim();
  if (minutes && (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 1500)) {
    return 'Write the length in whole minutes, such as 112.';
  }
  if (parseList(form.countries).some((code) => !/^[A-Za-z]{2}$/.test(code))) {
    return 'Write countries as codes of two letters, such as DE, FR.';
  }
  if (form.imdbId.trim() && !/^tt\d{6,10}$/.test(form.imdbId.trim())) {
    return 'An IMDb id looks like tt0133093.';
  }
  return null;
}

/** What stands in the way of saving the prices of a title, or null. */
export function priceProblem(form: DetailsForm, currency: string): string | null {
  const rent = parsePrice(form.rentPrice, currency);
  const buy = parsePrice(form.buyPrice, currency);
  if (rent === 'invalid' || buy === 'invalid') {
    return `Write prices as numbers, such as ${toPriceText(399, currency)}.`;
  }
  if (form.isPaid && form.purchaseOnly && rent === null && buy === null) {
    return 'Set a price for renting or buying, or nobody could watch the title.';
  }
  return null;
}

/**
 * The fields that differ from what is saved, in the shape the API takes.
 * Prices that cannot be read are left out: priceProblem names them first.
 */
export function changedFields(
  saved: DetailsForm,
  form: DetailsForm,
  currency = 'EUR',
): UpdateTitleInput {
  const changes: UpdateTitleInput = {};
  const text = (value: string) => value.trim() || null;

  if (form.name.trim() !== saved.name) {
    changes.name = form.name.trim();
  }
  if (form.slug.trim() !== saved.slug) {
    changes.slug = form.slug.trim();
  }
  for (const key of [
    'originalName',
    'tagline',
    'synopsis',
    'ageRating',
    'originalLanguage',
  ] as const) {
    if (form[key].trim() !== saved[key]) {
      changes[key] = text(form[key]);
    }
  }
  if (form.releaseYear.trim() !== saved.releaseYear) {
    changes.releaseYear = form.releaseYear.trim() ? Number(form.releaseYear) : null;
  }
  if (form.releaseDate !== saved.releaseDate) {
    changes.releaseDate = form.releaseDate || null;
  }
  if (form.runtimeMinutes.trim() !== saved.runtimeMinutes) {
    changes.runtimeMinutes = form.runtimeMinutes.trim() ? Number(form.runtimeMinutes) : null;
  }
  if (form.imdbId.trim() !== saved.imdbId) {
    changes.imdbId = text(form.imdbId);
  }
  if (form.seriesStatus !== saved.seriesStatus) {
    changes.seriesStatus = form.seriesStatus || null;
  }
  const countries = parseList(form.countries).map((code) => code.toUpperCase());
  if (countries.join() !== parseList(saved.countries).join()) {
    changes.countries = countries;
  }
  for (const key of ['studios', 'keywords'] as const) {
    if (parseList(form[key]).join('\n') !== parseList(saved[key]).join('\n')) {
      changes[key] = parseList(form[key]);
    }
  }
  if ([...form.genreIds].sort().join() !== saved.genreIds.join()) {
    changes.genreIds = form.genreIds;
  }
  if (form.isFeatured !== saved.isFeatured) {
    changes.isFeatured = form.isFeatured;
  }
  if (form.isPaid !== saved.isPaid) {
    changes.access = form.isPaid ? 'PAID' : 'FREE';
  }
  if ([...form.categoryIds].sort().join() !== saved.categoryIds.join()) {
    changes.categoryIds = form.categoryIds;
  }
  if ([...form.packageIds].sort().join() !== saved.packageIds.join()) {
    changes.packageIds = form.packageIds;
  }
  for (const [text, before, key] of [
    [form.rentPrice, saved.rentPrice, 'rentAmount'],
    [form.buyPrice, saved.buyPrice, 'buyAmount'],
  ] as const) {
    const amount = parsePrice(text, currency);
    if (amount !== 'invalid' && amount !== parsePrice(before, currency)) {
      changes[key] = amount;
    }
  }
  if (form.purchaseOnly !== saved.purchaseOnly) {
    changes.purchaseOnly = form.purchaseOnly;
  }
  return changes;
}
