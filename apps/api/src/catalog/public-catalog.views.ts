// SPDX-License-Identifier: AGPL-3.0-only
import type {
  Category,
  ExtraKind,
  Image,
  SeriesStatus,
  TitleAccess,
  TitleType,
} from '@onyx/database';
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
  /**
   * Ids of the packages a paid title is in. A plan opens the title when it
   * opens everything or names one of them. Empty for a free title.
   */
  packageIds: string[];
  /**
   * What renting and buying a paid title cost, in the smallest unit of the
   * site's currency. Null when not on offer.
   */
  rentAmount: number | null;
  buyAmount: number | null;
  /** True when no subscription opens the title: it is rented or bought only. */
  purchaseOnly: boolean;
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
  /** What kind of story it is, by name. */
  genres: PublicGenreRef[];
  /** The day of the premiere, such as "1999-03-31". */
  releaseDate: string | null;
  /** Movies: the length. Series: what an episode usually runs. In minutes. */
  runtimeMinutes: number | null;
  /** Where it was made, as codes of two letters. */
  countries: string[];
  studios: string[];
  /** From 0 to 10 at the source, with the number of votes. */
  rating: number | null;
  ratingCount: number | null;
  /** Series: UPCOMING, RUNNING, ENDED or CANCELLED. */
  seriesStatus: SeriesStatus | null;
  /** Who plays in it, in the order of the title, and the first of those who made it. */
  cast: PublicCredit[];
  crew: PublicCredit[];
  /** More videos around the title that can be played, in their order. Free to watch, like the trailer. */
  extras: PublicExtra[];
  /** Collections the title belongs to, such as the films of a series of films. */
  collections: PublicCollectionRef[];
  /**
   * Where details and artwork were imported from, for example "tmdb". Sources
   * ask to be named where their material is shown. Null for a title typed by hand.
   */
  metadataSource: string | null;
  /** Series: seasons that have something to watch, in order. Movies: empty. */
  seasons: PublicSeason[];
}

export interface PublicGenreRef {
  slug: string;
  name: string;
}

export interface PublicGenre extends PublicGenreRef {
  /** Titles of this genre that viewers can see. */
  titleCount: number;
}

/** One person's part in a title. */
export interface PublicCredit {
  /** Of the person, for the address of their page. */
  slug: string;
  name: string;
  /** The character played, or the job. */
  role: string | null;
  portrait: PublicImage | null;
}

export interface PublicPerson {
  slug: string;
  name: string;
  knownFor: string | null;
  biography: string | null;
  portrait: PublicImage | null;
  /** The titles viewers can see that the person has a part in, newest first, each once. */
  titles: (PublicTitleCard & { role: string | null })[];
}

/** The languages titles can be read in. */
export interface PublicLanguages {
  /** The language the catalog is written in, such as "en". */
  default: string;
  /** Other languages at least one visible title is translated into, the most used first. */
  translated: { language: string; titles: number }[];
}

export interface PublicExtra {
  id: string;
  /** TRAILER, TEASER, CLIP, FEATURETTE, BEHIND_THE_SCENES, INTERVIEW or BLOOPERS. */
  kind: ExtraKind;
  name: string;
  durationMs: number | null;
}

export interface PublicCollectionRef {
  slug: string;
  name: string;
}

export interface PublicCollection extends PublicCollectionRef {
  synopsis: string;
  poster: PublicImage | null;
  backdrop: PublicImage | null;
  /** Titles of the collection that viewers can see. */
  titleCount: number;
}

export interface PublicCollectionDetail extends PublicCollection {
  /** In the order of the collection. */
  titles: PublicTitleCard[];
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
  packages: { packageId: string }[];
  rentAmount: number | null;
  buyAmount: number | null;
  purchaseOnly: boolean;
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
    packageIds: title.access === 'PAID' ? title.packages.map((link) => link.packageId).sort() : [],
    rentAmount: title.access === 'PAID' ? title.rentAmount : null,
    buyAmount: title.access === 'PAID' ? title.buyAmount : null,
    purchaseOnly: title.access === 'PAID' && title.purchaseOnly,
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
