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
  // Everything from here to "seasons" is left out by an API older than it.
  /** What kind of story it is. */
  genres?: GenreRef[];
  /** The day of the premiere, such as "1999-03-31". */
  releaseDate?: string | null;
  /** Movies: the length. Series: what an episode usually runs. In minutes. */
  runtimeMinutes?: number | null;
  /** Where it was made, as codes of two letters. */
  countries?: string[];
  studios?: string[];
  /** From 0 to 10, with the number of votes. */
  rating?: number | null;
  ratingCount?: number | null;
  seriesStatus?: 'UPCOMING' | 'RUNNING' | 'ENDED' | 'CANCELLED' | null;
  cast?: Credit[];
  crew?: Credit[];
  /** More videos around the title, free to watch. */
  extras?: Extra[];
  collections?: CollectionRef[];
  /** Where details and artwork were imported from, for example "tmdb". */
  metadataSource?: string | null;
  seasons: Season[];
}

export interface GenreRef {
  slug: string;
  name: string;
}

export interface Genre extends GenreRef {
  titleCount: number;
}

/** One person's part in a title. */
export interface Credit {
  /** Of the person, for the address of their page. */
  slug: string;
  name: string;
  /** The character played, or the job. */
  role: string | null;
  portrait: CatalogImage | null;
}

export interface Person {
  slug: string;
  name: string;
  knownFor: string | null;
  biography: string | null;
  portrait: CatalogImage | null;
  titles: (TitleCard & { role: string | null })[];
}

export type ExtraKind =
  'TRAILER' | 'TEASER' | 'CLIP' | 'FEATURETTE' | 'BEHIND_THE_SCENES' | 'INTERVIEW' | 'BLOOPERS';

export interface Extra {
  id: string;
  kind: ExtraKind;
  name: string;
  durationMs: number | null;
}

export interface CollectionRef {
  slug: string;
  name: string;
}

export interface Collection extends CollectionRef {
  synopsis: string;
  poster: CatalogImage | null;
  backdrop: CatalogImage | null;
  titleCount: number;
  /** In the order of the collection. */
  titles: TitleCard[];
}

/** The languages titles can be read in. */
export interface Languages {
  /** The language the catalog is written in, such as "en". */
  default: string;
  translated: { language: string; titles: number }[];
}

export interface HomeRow {
  key: string;
  name: string;
  /** "continue": the place of the viewer's own row of started videos. */
  kind: 'titles' | 'continue';
  /** Upright posters, wide cards with the backdrop, or a numbered top list. */
  layout: 'poster' | 'landscape' | 'numbered';
  category: CategoryRef | null;
  /** Where "See all" leads. Null: the row shows everything it has. */
  browse: string | null;
  titles: TitleCard[];
}

export interface Home {
  /** The opening: one title, or a few that take turns. Null: the page starts with its rows. */
  hero: { titles: TitleCard[] } | null;
  rows: HomeRow[];
}

export interface Page<Item> {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

export const TITLE_SORTS = ['newest', 'name', 'year', 'rating'] as const;
export type TitleSort = (typeof TITLE_SORTS)[number];

/** How viewers of the same video or channel find each other. */
export interface P2pInfo {
  /** Address of the tracker, with the token that lets this viewer in. */
  trackerUrl: string;
  /** Names the group of viewers who watch the same files. */
  swarmId: string;
  /**
   * Servers that help two players connect, in the form the browser takes
   * them: STUN servers, and TURN servers with a name and a password.
   */
  iceServers: { urls: string[]; username?: string; credential?: string }[];
  /** Whether the player shares until the viewer chooses. */
  sharingDefault: boolean;
}

/** Signed, short-lived addresses for playing one video. */
export interface Playback {
  protocol: 'hls';
  manifestUrl: string;
  posterUrl: string | null;
  /** WebVTT file whose cues point into a sheet of small preview pictures. */
  thumbnailTrackUrl: string | null;
  expiresAt: string;
  /** What the player needs to share the video with other viewers. Null when P2P is off. */
  p2p: P2pInfo | null;
  /**
   * Where the player reports how the video is watched, for the figures of the
   * operator. Missing or null when the installation records nothing.
   */
  playId?: string | null;
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
  /** Minutes viewers can go back in time. Nothing, or 0, means only the present. */
  dvrMinutes?: number;
  /** What the guide says is on now and after it. Left out by an API older than the guide. */
  now?: Programme | null;
  next?: Programme | null;
}

/** One programme on a channel. */
export interface Programme {
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startsAt: string;
  endsAt: string;
}

/** The programmes of the channels in a stretch of time. */
export interface Guide {
  from: string;
  to: string;
  channels: { slug: string; programmes: Programme[] }[];
}

/** Where to watch a channel, for a short time. */
export interface LivePlayback {
  protocol: 'hls';
  url: string;
  expiresAt: string;
  p2p: P2pInfo | null;
}
