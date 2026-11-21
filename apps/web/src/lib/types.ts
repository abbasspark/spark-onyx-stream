// SPDX-License-Identifier: AGPL-3.0-only
//
// The shapes of the public catalog API (/v1/catalog). Dates arrive as text.

export type TitleType = 'MOVIE' | 'SERIES';

export interface CatalogImage {
  url: string;
  width: number;
  height: number;
}

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface Category extends CategoryRef {
  description: string | null;
  titleCount: number;
}

export interface TitleCard {
  id: string;
  type: TitleType;
  slug: string;
  name: string;
  tagline: string | null;
  releaseYear: number | null;
  ageRating: string | null;
  isFeatured: boolean;
  /** PAID when watching needs a subscription. Left out by an API older than plans. */
  access?: 'FREE' | 'PAID';
  /** Ids of the packages a paid title is in. Left out by an API older than packages. */
  packageIds?: string[];
  /** What renting and buying cost, in the smallest unit of the currency. Null or left out: not on offer. */
  rentAmount?: number | null;
  buyAmount?: number | null;
  /** True when no subscription opens the title: it is rented or bought only. */
  purchaseOnly?: boolean;
  poster: CatalogImage | null;
  backdrop: CatalogImage | null;
  logo: CatalogImage | null;
  categories: CategoryRef[];
  /** Movies: length in milliseconds. Series: null. */
  durationMs: number | null;
  seasonCount: number;
  episodeCount: number;
  publishedAt: string | null;
}

export interface Episode {
  id: string;
  number: number;
  name: string;
  synopsis: string | null;
  still: CatalogImage | null;
  durationMs: number | null;
}

export interface Season {
  number: number;
  name: string | null;
  synopsis: string | null;
  episodes: Episode[];
}

export interface TitleDetail extends TitleCard {
  originalName: string | null;
  synopsis: string | null;
  originalLanguage: string | null;
  hasTrailer: boolean;
  /** Where details and artwork were imported from, for example "tmdb". */
  metadataSource?: string | null;
  seasons: Season[];
}

export interface HomeRow {
  key: string;
  name: string;
  category: CategoryRef | null;
  titles: TitleCard[];
}

export interface Home {
  rows: HomeRow[];
}

export interface Page<Item> {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

export const TITLE_SORTS = ['newest', 'name', 'year'] as const;
export type TitleSort = (typeof TITLE_SORTS)[number];

/** Signed, short-lived addresses for playing one video. */
export interface Playback {
  protocol: 'hls';
  manifestUrl: string;
  posterUrl: string | null;
  /** WebVTT file whose cues point into a sheet of small preview pictures. */
  thumbnailTrackUrl: string | null;
  expiresAt: string;
}

/** A live channel as viewers see it. */
export interface Channel {
  slug: string;
  name: string;
  /** The number of the channel, as on a remote control. */
  number: number | null;
  description: string | null;
  access: 'FREE' | 'PAID';
  /** The packages the channel is in, to tell whether a plan opens it. */
  packageIds: string[];
  /** Whether the channel is sending right now. */
  onAir: boolean;
}

/** Where to watch a channel, for a short time. */
export interface LivePlayback {
  protocol: 'hls';
  url: string;
  expiresAt: string;
}
