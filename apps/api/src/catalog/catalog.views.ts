// SPDX-License-Identifier: AGPL-3.0-only
import type {
  Asset,
  AssetStatus,
  Category,
  Episode,
  Image,
  ImageKind,
  PublishStatus,
  Season,
  Title,
  TitleAccess,
  TitleType,
} from '@onyx/database';

import { isPlayable } from './playable.js';

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
  isFeatured: boolean;
  /** FREE, or PAID when watching needs a subscription. */
  access: TitleAccess;
  /** What renting and buying cost, in the smallest unit of the currency. Null: not on offer. */
  rentAmount: number | null;
  buyAmount: number | null;
  /** True when no subscription opens the title: it is rented or bought only. */
  purchaseOnly: boolean;
  poster: ImageView | null;
  categories: { id: string; name: string }[];
  /** The packages the title is in. Plans open a paid title through them. */
  packages: { id: string; name: string }[];
  /** Movies: the film's asset. Series: null. */
  asset: AssetRef | null;
  seasonCount: number;
  episodeCount: number;
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
  asset: AssetRef | null;
  still: ImageView | null;
}

export interface SeasonView {
  id: string;
  number: number;
  name: string | null;
  synopsis: string | null;
  episodes: EpisodeView[];
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
  trailerAsset: AssetRef | null;
  /** Where the details were imported from. Null for a title typed by hand. */
  metadata: TitleMetadataRef | null;
  seasons: SeasonView[];
  /** What is done and what is missing before the title can be published. */
  checklist: ChecklistItem[];
}

export type EpisodeRecord = Episode & { asset: Asset | null; still: Image | null };
export type SeasonRecord = Season & { episodes: EpisodeRecord[] };

export type TitleSummaryRecord = Title & {
  poster: Image | null;
  asset: Asset | null;
  categories: { category: Category }[];
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
  packages: PackageLink[];
  seasons: SeasonRecord[];
};

export function toEpisodeView(episode: EpisodeRecord, mediaBaseUrl: string): EpisodeView {
  return {
    id: episode.id,
    seasonId: episode.seasonId,
    number: episode.number,
    name: episode.name,
    synopsis: episode.synopsis,
    status: episode.status,
    publishedAt: episode.publishedAt,
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
): TitleSummary {
  return {
    id: title.id,
    type: title.type,
    slug: title.slug,
    name: title.name,
    releaseYear: title.releaseYear,
    status: title.status,
    publishedAt: title.publishedAt,
    isFeatured: title.isFeatured,
    access: title.access,
    rentAmount: title.rentAmount,
    buyAmount: title.buyAmount,
    purchaseOnly: title.purchaseOnly,
    poster: title.poster ? toImageView(title.poster, mediaBaseUrl) : null,
    categories: sortedCategories(title.categories),
    packages: sortedPackages(title.packages),
    asset: title.type === 'MOVIE' ? toAssetRef(title.asset) : null,
    seasonCount: title.seasons.length,
    episodeCount: title.seasons.reduce((total, season) => total + season._count.episodes, 0),
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

/** Whether viewers can see a title right now. The same rule as the VISIBLE_TITLE filter. */
export function isTitleVisible(title: TitleDetailRecord): boolean {
  if (title.status !== 'PUBLISHED') {
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
    isFeatured: title.isFeatured,
    access: title.access,
    rentAmount: title.rentAmount,
    buyAmount: title.buyAmount,
    purchaseOnly: title.purchaseOnly,
    poster: image(title.poster),
    backdrop: image(title.backdrop),
    logo: image(title.logo),
    categories: sortedCategories(title.categories),
    packages: sortedPackages(title.packages),
    asset: title.type === 'MOVIE' ? toAssetRef(title.asset) : null,
    trailerAsset: toAssetRef(title.trailerAsset),
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
    isVisible: isTitleVisible(title),
    seasons,
    checklist: buildChecklist(title),
    createdAt: title.createdAt,
    updatedAt: title.updatedAt,
  };
}
