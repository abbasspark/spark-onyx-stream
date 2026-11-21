// SPDX-License-Identifier: AGPL-3.0-only
import type { Category, Image, TitleAccess, TitleType } from '@onyx/database';
import { toImageView } from './catalog.views.js';

/**
 * What viewers get to see of the catalog. These shapes are a public contract
 * for the viewer website and the apps: fields are added, never renamed or
 * removed. Nothing here says anything about drafts, storage or processing.
 */

export interface PublicImage {
  url: string;
  width: number;
  height: number;
}

export interface PublicCategoryRef {
  slug: string;
  name: string;
}

export interface PublicCategory extends PublicCategoryRef {
  description: string | null;
  /** Titles in this category that viewers can see. */
  titleCount: number;
}

/** A title as shown in a row or a grid. */
export interface PublicTitleCard {
  id: string;
  type: TitleType;
  slug: string;
  name: string;
  tagline: string | null;
  releaseYear: number | null;
  ageRating: string | null;
  isFeatured: boolean;
  /** FREE, or PAID when watching needs a subscription. */
  access: TitleAccess;
  poster: PublicImage | null;
  backdrop: PublicImage | null;
  logo: PublicImage | null;
  categories: PublicCategoryRef[];
  /** Movies: length of the film in milliseconds. Series: null. */
  durationMs: number | null;
  /** Series: seasons and episodes that can be watched. Movies: 0. */
  seasonCount: number;
  episodeCount: number;
  publishedAt: Date | null;
}

export interface PublicEpisode {
  id: string;
  number: number;
  name: string;
  synopsis: string | null;
  still: PublicImage | null;
  durationMs: number | null;
}

export interface PublicSeason {
  number: number;
  name: string | null;
  synopsis: string | null;
  episodes: PublicEpisode[];
}

/** A title as shown on its own page. */
export interface PublicTitleDetail extends PublicTitleCard {
  originalName: string | null;
  synopsis: string | null;
  originalLanguage: string | null;
  hasTrailer: boolean;
  /**
   * Where details and artwork were imported from, for example "tmdb". Sources
   * ask to be named where their material is shown. Null for a title typed by hand.
   */
  metadataSource: string | null;
  /** Series: seasons that have something to watch, in order. Movies: empty. */
  seasons: PublicSeason[];
}

/** One row of the home page. */
export interface PublicRow {
  /** "featured", "latest" or "category:{slug}". Stable, for keys and links. */
  key: string;
  name: string;
  /** Set for a category row. */
  category: PublicCategoryRef | null;
  titles: PublicTitleCard[];
}

export interface PublicHome {
  rows: PublicRow[];
}

export interface CardRecord {
  id: string;
  type: TitleType;
  slug: string;
  name: string;
  tagline: string | null;
  releaseYear: number | null;
  ageRating: string | null;
  isFeatured: boolean;
  access: TitleAccess;
  publishedAt: Date | null;
  poster: Image | null;
  backdrop: Image | null;
  logo: Image | null;
  asset: { durationMs: number | null } | null;
  categories: { category: Category }[];
  /** Only seasons with something to watch, each with the number of such episodes. */
  seasons: { _count: { episodes: number } }[];
}

export function toPublicImage(image: Image | null, mediaBaseUrl: string): PublicImage | null {
  if (!image) {
    return null;
  }
  const { url, width, height } = toImageView(image, mediaBaseUrl);
  return { url, width, height };
}

export function toPublicCategoryRefs(links: { category: Category }[]): PublicCategoryRef[] {
  return links
    .map((link) => link.category)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((category) => ({ slug: category.slug, name: category.name }));
}

export function toPublicCard(title: CardRecord, mediaBaseUrl: string): PublicTitleCard {
  return {
    id: title.id,
    type: title.type,
    slug: title.slug,
    name: title.name,
    tagline: title.tagline,
    releaseYear: title.releaseYear,
    ageRating: title.ageRating,
    isFeatured: title.isFeatured,
    access: title.access,
    poster: toPublicImage(title.poster, mediaBaseUrl),
    backdrop: toPublicImage(title.backdrop, mediaBaseUrl),
    logo: toPublicImage(title.logo, mediaBaseUrl),
    categories: toPublicCategoryRefs(title.categories),
    durationMs: title.type === 'MOVIE' ? (title.asset?.durationMs ?? null) : null,
    seasonCount: title.type === 'SERIES' ? title.seasons.length : 0,
    episodeCount:
      title.type === 'SERIES'
        ? title.seasons.reduce((total, season) => total + season._count.episodes, 0)
        : 0,
    publishedAt: title.publishedAt,
  };
}
