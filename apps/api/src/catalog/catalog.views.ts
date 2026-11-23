// SPDX-License-Identifier: AGPL-3.0-only
import type {
  Asset,
  AssetStatus,
  Category,
  Credit,
  CreditKind,
  Episode,
  ExtraKind,
  Genre,
  Image,
  ImageKind,
  Person,
  PublishStatus,
  Season,
  TitleExtra,
  SeriesStatus,
  Title,
  TitleAccess,
  TitleType,
} from '@onyx/database';

import { isAvailable, isPlayable } from './playable.js';

/** Route under which artwork is served, relative to the API prefix. */
export const ARTWORK_ROUTE = 'artwork';

export interface ImageView {
  id: string;
  kind: ImageKind;
  /** Public address of the picture. It never changes, so it can be cached for good. */
  url: string;
  width: number;
  height: number;
  bytes: number;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function toImageView(image: Image, mediaBaseUrl: string): ImageView {
  return {
    id: image.id,
    kind: image.kind,
    url: `${mediaBaseUrl}/v1/${ARTWORK_ROUTE}/${image.id}.${EXTENSIONS[image.mimeType] ?? 'jpg'}`,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
  };
}

/** The part of an asset the catalog shows next to a title or an episode. */
export interface AssetRef {
  id: string;
  title: string;
  status: AssetStatus;
  durationMs: number | null;
  height: number | null;
  /** Whether it can be streamed: ready, and stored with a stream. */
  playable: boolean;
}

export function toAssetRef(asset: Asset | null): AssetRef | null {
  // A deleted asset counts as no asset: it cannot be played.
  if (!asset || asset.status === 'DELETED') {
    return null;
  }
  return {
    id: asset.id,
    title: asset.title,
    status: asset.status,
    durationMs: asset.durationMs,
    height: asset.height,
    playable: isPlayable(asset),
  };
}

export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** How many titles carry this category. */
  titleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toCategoryView(category: Category & { _count: { titles: number } }): CategoryView {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    titleCount: category._count.titles,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

/** One point of the list that says whether a title is ready to be published. */
export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** A required point blocks publishing while it is not done. */
  required: boolean;
}

export interface TitleSummary {
  id: string;
  type: TitleType;
  slug: string;
  name: string;
  releaseYear: number | null;
  status: PublishStatus;
  publishedAt: Date | null;
  /** A published title is shown to viewers between these moments. Null leaves that end open. */
  availableFrom: Date | null;
  availableUntil: Date | null;
  isFeatured: boolean;
  /** FREE, or PAID when watching needs a subscription. */
  access: TitleAccess;
  /** What renting and buying cost, in the smallest unit of the currency. Null: not on offer. */
  rentAmount: number | null;
  buyAmount: number | null;
  /** True when no subscription opens the title: it is rented or bought only. */
  purchaseOnly: boolean;
  poster: ImageView | null;
  /** The day of the premiere, as "1999-03-31". */
  releaseDate: string | null;
  /** Movies: the length of the film. Series: the usual length of an episode. */
  runtimeMinutes: number | null;
  /** What the audience of the metadata source thinks of it, from 0 to 10. */
  rating: number | null;
  /** Series only: whether more episodes are to come. */
  seriesStatus: SeriesStatus | null;
  genres: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  /** The packages the title is in. Plans open a paid title through them. */
  packages: { id: string; name: string }[];
  /** Movies: the film's asset. Series: null. */
  asset: AssetRef | null;
  seasonCount: number;
  episodeCount: number;
  /** Series: how many episodes have a video that plays. */
  readyEpisodeCount: number;
  /**
   * Whether viewers can see the title right now: it is published and has
   * something that plays. False for a published title whose video is gone.
   */
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EpisodeView {
  id: string;
  seasonId: string;
  number: number;
  name: string;
  synopsis: string | null;
  status: PublishStatus;
  publishedAt: Date | null;
  /** The day it was first shown, as "2021-09-05". */
  airDate: string | null;
  runtimeMinutes: number | null;
  asset: AssetRef | null;
  still: ImageView | null;
}

export interface SeasonView {
  id: string;
  number: number;
  name: string | null;
  synopsis: string | null;
  /** The day its first episode was first shown. */
  airDate: string | null;
  poster: ImageView | null;
  episodes: EpisodeView[];
}

export interface PersonRef {
  id: string;
  slug: string;
  name: string;
  portrait: ImageView | null;
}

/** One person's part in a title. */
export interface CreditView {
  id: string;
  kind: CreditKind;
  /** Cast: the character played. Crew: the job. */
  role: string | null;
  person: PersonRef;
}

export interface GenreView {
  id: string;
  slug: string;
  name: string;
  titleCount: number;
  createdAt: Date;
}

export interface PersonView extends PersonRef {
  knownFor: string | null;
  biography: string | null;
  /** Set when the person came with an import. */
  metadata: { source: string; id: string } | null;
  creditCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A person with everything they have a part in. */
export interface PersonDetail extends PersonView {
  credits: {
    id: string;
    kind: CreditKind;
    role: string | null;
    title: {
      id: string;
      type: TitleType;
      name: string;
      releaseYear: number | null;
      status: PublishStatus;
      poster: ImageView | null;
    };
  }[];
}

export interface TitleMetadataRef {
  /** For example "tmdb". */
  source: string;
  /** The id there with its kind, for example "movie:603". */
  id: string;
  language: string | null;
  syncedAt: Date | null;
}

export interface TitleDetail extends TitleSummary {
  originalName: string | null;
  tagline: string | null;
  synopsis: string | null;
  ageRating: string | null;
  originalLanguage: string | null;
  backdrop: ImageView | null;
  logo: ImageView | null;
  countries: string[];
  studios: string[];
  keywords: string[];
  imdbId: string | null;
  /** How many voted for the rating. */
  ratingCount: number | null;
  /** Series only: the day the newest episode was first shown. */
  lastAirDate: string | null;
  /** The cast in order, then the crew in order. */
  credits: CreditView[];
  trailerAsset: AssetRef | null;
  /** More videos around the title, in their order: further trailers, clips, a look behind the scenes. */
  extras: ExtraView[];
  /** The collections the title is in, by name. */
  collections: { id: string; name: string }[];
  /** Where the details were imported from. Null for a title typed by hand. */
  metadata: TitleMetadataRef | null;
  seasons: SeasonView[];
  /** What is done and what is missing before the title can be published. */
  checklist: ChecklistItem[];
}

export type EpisodeRecord = Episode & { asset: Asset | null; still: Image | null };
export type SeasonRecord = Season & { poster: Image | null; episodes: EpisodeRecord[] };
export type CreditRecord = Credit & { person: Person & { portrait: Image | null } };

/** A date of the database that stands for a day, as "1999-03-31". */
export function toDay(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function toPersonRef(
  person: Person & { portrait: Image | null },
  mediaBaseUrl: string,
): PersonRef {
  return {
    id: person.id,
    slug: person.slug,
    name: person.name,
    portrait: person.portrait ? toImageView(person.portrait, mediaBaseUrl) : null,
  };
}

/** The cast in order, then the crew in order. */
export function toCreditViews(
  credits: readonly CreditRecord[],
  mediaBaseUrl: string,
): CreditView[] {
  return [...credits]
    .sort((a, b) => (a.kind === b.kind ? a.position - b.position : a.kind === 'CAST' ? -1 : 1))
    .map((credit) => ({
      id: credit.id,
      kind: credit.kind,
      role: credit.role,
      person: toPersonRef(credit.person, mediaBaseUrl),
    }));
}

function sortedGenres(links: { genre: Genre }[]): { id: string; name: string }[] {
  return links
    .map((link) => link.genre)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((genre) => ({ id: genre.id, name: genre.name }));
}

export type TitleSummaryRecord = Title & {
  poster: Image | null;
  asset: Asset | null;
  categories: { category: Category }[];
  genres: { genre: Genre }[];
  packages: PackageLink[];
  seasons: { _count: { episodes: number } }[];
};

export type TitleDetailRecord = Title & {
  poster: Image | null;
  backdrop: Image | null;
  logo: Image | null;
  asset: Asset | null;
  trailerAsset: Asset | null;
  categories: { category: Category }[];
  genres: { genre: Genre }[];
  credits: CreditRecord[];
  extras: ExtraRecord[];
  collections: { collection: { id: string; name: string } }[];
  packages: PackageLink[];
  seasons: SeasonRecord[];
};

export type ExtraRecord = TitleExtra & { asset: Asset };

export interface ExtraView {
  id: string;
  kind: ExtraKind;
  name: string;
  position: number;
  asset: AssetRef | null;
}

export function toExtraViews(extras: readonly ExtraRecord[]): ExtraView[] {
  return [...extras]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((extra) => ({
      id: extra.id,
      kind: extra.kind,
      name: extra.name,
      position: extra.position,
      asset: toAssetRef(extra.asset),
    }));
}

/** A collection in a list. */
export interface CollectionView {
  id: string;
  slug: string;
  name: string;
  synopsis: string;
  visible: boolean;
  position: number;
  poster: ImageView | null;
  backdrop: ImageView | null;
  titleCount: number;
  /** Posters of its first titles, for a picture of the collection without a poster of its own. */
  covers: ImageView[];
  /** Where it was imported from, or null for one made by hand. */
  metadataSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A title as a collection shows it. */
export interface CollectionTitleView {
  id: string;
  type: TitleType;
  name: string;
  releaseYear: number | null;
  status: PublishStatus;
  poster: ImageView | null;
}

export interface CollectionDetail extends CollectionView {
  titles: CollectionTitleView[];
}

export function toEpisodeView(episode: EpisodeRecord, mediaBaseUrl: string): EpisodeView {
  return {
    id: episode.id,
    seasonId: episode.seasonId,
    number: episode.number,
    name: episode.name,
    synopsis: episode.synopsis,
    status: episode.status,
    publishedAt: episode.publishedAt,
    airDate: toDay(episode.airDate),
    runtimeMinutes: episode.runtimeMinutes,
    asset: toAssetRef(episode.asset),
    still: episode.still ? toImageView(episode.still, mediaBaseUrl) : null,
  };
}

type PackageLink = { package: { id: string; name: string; position: number } };

function sortedPackages(links: PackageLink[]): { id: string; name: string }[] {
  return links
    .map((link) => link.package)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}

function sortedCategories(links: { category: Category }[]): { id: string; name: string }[] {
  return links
    .map((link) => link.category)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((category) => ({ id: category.id, name: category.name }));
}

export function toTitleSummary(
  title: TitleSummaryRecord,
  mediaBaseUrl: string,
  isVisible: boolean,
  readyEpisodeCount = 0,
): TitleSummary {
  return {
    id: title.id,
    type: title.type,
    slug: title.slug,
    name: title.name,
    releaseYear: title.releaseYear,
    status: title.status,
    publishedAt: title.publishedAt,
    availableFrom: title.availableFrom,
    availableUntil: title.availableUntil,
    isFeatured: title.isFeatured,
    access: title.access,
    rentAmount: title.rentAmount,
    buyAmount: title.buyAmount,
    purchaseOnly: title.purchaseOnly,
    poster: title.poster ? toImageView(title.poster, mediaBaseUrl) : null,
    releaseDate: toDay(title.releaseDate),
    runtimeMinutes: title.runtimeMinutes,
    rating: title.rating,
    seriesStatus: title.type === 'SERIES' ? title.seriesStatus : null,
    genres: sortedGenres(title.genres),
    categories: sortedCategories(title.categories),
    packages: sortedPackages(title.packages),
    asset: title.type === 'MOVIE' ? toAssetRef(title.asset) : null,
    seasonCount: title.seasons.length,
    episodeCount: title.seasons.reduce((total, season) => total + season._count.episodes, 0),
    readyEpisodeCount,
    isVisible,
    createdAt: title.createdAt,
    updatedAt: title.updatedAt,
  };
}

/**
 * Lists what a title needs before it can be published, and what would make it
 * better. Required points block publishing.
 */
export function buildChecklist(title: TitleDetailRecord): ChecklistItem[] {
  const asset = toAssetRef(title.asset);
  const episodes = title.seasons.flatMap((season) => season.episodes);

  const playable: ChecklistItem[] =
    title.type === 'MOVIE'
      ? [
          { key: 'video', label: 'A video is attached', done: asset !== null, required: true },
          {
            key: 'video-ready',
            label: 'The video is processed and ready to play',
            done: asset?.playable === true,
            required: true,
          },
        ]
      : [
          {
            key: 'episode',
            label: 'At least one episode is published',
            done: episodes.some((episode) => episode.status === 'PUBLISHED'),
            required: true,
          },
        ];

  return [
    ...playable,
    { key: 'poster', label: 'A poster is set', done: title.posterId !== null, required: false },
    {
      key: 'synopsis',
      label: 'A synopsis is written',
      done: Boolean(title.synopsis?.trim()),
      required: false,
    },
    {
      key: 'category',
      label: 'At least one category is chosen',
      done: title.categories.length > 0,
      required: false,
    },
  ];
}

/** Whether viewers can see a title right now. The same rule as the visibleTitle filter. */
export function isTitleVisible(title: TitleDetailRecord): boolean {
  if (title.status !== 'PUBLISHED' || !isAvailable(title)) {
    return false;
  }
  if (title.type === 'MOVIE') {
    return isPlayable(title.asset);
  }
  return title.seasons.some((season) =>
    season.episodes.some((episode) => episode.status === 'PUBLISHED' && isPlayable(episode.asset)),
  );
}

export function toTitleDetail(title: TitleDetailRecord, mediaBaseUrl: string): TitleDetail {
  const image = (value: Image | null) => (value ? toImageView(value, mediaBaseUrl) : null);
  const seasons = [...title.seasons]
    .sort((a, b) => a.number - b.number)
    .map((season) => ({
      id: season.id,
      number: season.number,
      name: season.name,
      synopsis: season.synopsis,
      airDate: toDay(season.airDate),
      poster: image(season.poster),
      episodes: [...season.episodes]
        .sort((a, b) => a.number - b.number)
        .map((episode) => toEpisodeView(episode, mediaBaseUrl)),
    }));

  return {
    id: title.id,
    type: title.type,
    slug: title.slug,
    name: title.name,
    originalName: title.originalName,
    tagline: title.tagline,
    synopsis: title.synopsis,
    releaseYear: title.releaseYear,
    ageRating: title.ageRating,
    originalLanguage: title.originalLanguage,
    status: title.status,
    publishedAt: title.publishedAt,
    availableFrom: title.availableFrom,
    availableUntil: title.availableUntil,
    isFeatured: title.isFeatured,
    access: title.access,
    rentAmount: title.rentAmount,
    buyAmount: title.buyAmount,
    purchaseOnly: title.purchaseOnly,
    poster: image(title.poster),
    backdrop: image(title.backdrop),
    logo: image(title.logo),
    releaseDate: toDay(title.releaseDate),
    runtimeMinutes: title.runtimeMinutes,
    rating: title.rating,
    ratingCount: title.ratingCount,
    seriesStatus: title.type === 'SERIES' ? title.seriesStatus : null,
    lastAirDate: title.type === 'SERIES' ? toDay(title.lastAirDate) : null,
    countries: title.countries,
    studios: title.studios,
    keywords: title.keywords,
    imdbId: title.imdbId,
    genres: sortedGenres(title.genres),
    credits: toCreditViews(title.credits, mediaBaseUrl),
    categories: sortedCategories(title.categories),
    packages: sortedPackages(title.packages),
    asset: title.type === 'MOVIE' ? toAssetRef(title.asset) : null,
    trailerAsset: toAssetRef(title.trailerAsset),
    extras: toExtraViews(title.extras),
    collections: title.collections
      .map(({ collection }) => ({ id: collection.id, name: collection.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    metadata:
      title.metadataSource && title.metadataId
        ? {
            source: title.metadataSource,
            id: title.metadataId,
            language: title.metadataLanguage,
            syncedAt: title.metadataSyncedAt,
          }
        : null,
    seasonCount: seasons.length,
    episodeCount: seasons.reduce((total, season) => total + season.episodes.length, 0),
    readyEpisodeCount: title.seasons.reduce(
      (total, season) =>
        total + season.episodes.filter((episode) => isPlayable(episode.asset)).length,
      0,
    ),
    isVisible: isTitleVisible(title),
    seasons,
    checklist: buildChecklist(title),
    createdAt: title.createdAt,
    updatedAt: title.updatedAt,
  };
}
