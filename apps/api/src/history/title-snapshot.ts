// SPDX-License-Identifier: AGPL-3.0-only

/** Something with a name, kept by id so a rename is not a change of membership. */
export interface Ref {
  id: string;
  name: string;
}

export interface SnapshotCredit {
  personId: string;
  name: string;
  kind: 'CAST' | 'CREW';
  role: string | null;
}

export interface SnapshotEpisode {
  number: number;
  name: string;
  synopsis: string | null;
  status: string;
  assetId: string | null;
}

export interface SnapshotSeason {
  number: number;
  name: string | null;
  synopsis: string | null;
  episodes: SnapshotEpisode[];
}

/** The single-valued fields of a title that history follows. */
export interface SnapshotFields {
  name: string;
  slug: string;
  originalName: string | null;
  tagline: string | null;
  synopsis: string | null;
  releaseYear: number | null;
  /** As "2024-03-14". */
  releaseDate: string | null;
  runtimeMinutes: number | null;
  ageRating: string | null;
  /** Left out of snapshots older than this field. */
  minAge?: number | null;
  originalLanguage: string | null;
  imdbId: string | null;
  seriesStatus: string | null;
  status: string;
  isFeatured: boolean;
  /** As ISO moments. */
  availableFrom: string | null;
  availableUntil: string | null;
  access: string;
  purchaseOnly: boolean;
  rentAmount: number | null;
  buyAmount: number | null;
}

/**
 * A title at one moment, as far as history follows it. What the audience of
 * the metadata source thinks (the rating) and when details were last synced
 * are left out: they change without anyone changing the title.
 */
export interface TitleSnapshot {
  /** The shape of this record, should it ever change. */
  v: 1;
  /** MOVIE or SERIES. Never changes; missing in snapshots from before it was kept. */
  type?: string;
  fields: SnapshotFields;
  countries: string[];
  studios: string[];
  keywords: string[];
  images: { poster: string | null; backdrop: string | null; logo: string | null };
  video: Ref | null;
  trailer: Ref | null;
  extras: { assetId: string; name: string; kind: string }[];
  genres: Ref[];
  categories: Ref[];
  packages: Ref[];
  credits: SnapshotCredit[];
  /** By language tag. */
  translations: Record<
    string,
    { name: string | null; tagline: string | null; synopsis: string | null }
  >;
  seasons: SnapshotSeason[];
}

/** The parts of the panel a change belongs to, for filtering the history. */
export const CHANGE_GROUPS = [
  'texts',
  'facts',
  'publishing',
  'access',
  'artwork',
  'classification',
  'people',
  'videos',
  'translations',
  'episodes',
] as const;
export type ChangeGroup = (typeof CHANGE_GROUPS)[number];

/** One thing that differs between two moments of a title, for people to read. */
export interface Change {
  group: ChangeGroup;
  /** Stable, for keys: "synopsis", "genres", "season:1:episode:3:name". */
  field: string;
  label: string;
  /**
   * "text": a longer text, shown as before and after. "value": a short value.
   * "list": things added to and removed from a list.
   */
  kind: 'text' | 'value' | 'list';
  /** How the panel shows `before` and `after`: as they are, or as a price, a date and so on. */
  format?: 'money' | 'date' | 'datetime' | 'status' | 'yesno' | 'picture';
  before?: string | null;
  after?: string | null;
  added?: string[];
  removed?: string[];
  /** Said when nothing was added or removed and the order is new. */
  reordered?: boolean;
}

/** The groups a restore brings back. Publishing, videos and episodes stay as they are. */
export const RESTORABLE_GROUPS: readonly ChangeGroup[] = [
  'texts',
  'facts',
  'access',
  'artwork',
  'classification',
  'people',
  'translations',
];
