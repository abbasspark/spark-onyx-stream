// SPDX-License-Identifier: AGPL-3.0-only
//
// Shapes of the API's JSON answers. Dates arrive as ISO 8601 text.
import type { BodyOf, Schemas } from '@onyx/api-client';

/** The four roles that ship with the software. */
export type BuiltInRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

/** The role of an admin: a built-in one, or CUSTOM for a role made in the panel. */
export type AdminRole = BuiltInRole | 'CUSTOM';

/** The custom role of an admin, as far as a list needs it. */
export interface CustomRoleRef {
  id: string;
  name: string;
  color: string;
}

export type Permission =
  | 'admins:read'
  | 'admins:write'
  | 'api-keys:read'
  | 'api-keys:write'
  | 'audit:read'
  | 'assets:read'
  | 'assets:write'
  | 'jobs:read'
  | 'jobs:write'
  | 'encoding-profiles:read'
  | 'encoding-profiles:write'
  | 'storage:read'
  | 'storage:write'
  | 'catalog:read'
  | 'catalog:write'
  | 'viewers:read'
  | 'viewers:write'
  | 'analytics:read'
  | 'billing:read'
  | 'billing:write'
  | 'live:read'
  | 'live:write'
  | 'delivery:read'
  | 'delivery:write'
  | 'settings:read'
  | 'settings:write';

export interface Admin {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  /** The role made in the panel that this admin holds. Set when role is CUSTOM. */
  customRole: CustomRoleRef | null;
  isActive: boolean;
  /** Whether a code is asked for when this admin signs in. */
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Where the signed-in admin stands with two-factor sign-in. */
export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  /** Recovery codes that were not used yet. */
  recoveryCodesLeft: number;
  /** Whether this installation asks every admin for it. */
  required: boolean;
}

/** What an authenticator app needs to make the codes. */
export interface TwoFactorSetup {
  /** The secret as base32, for typing it in by hand. */
  secret: string;
  /** The same as an address for a QR code. */
  uri: string;
}

/** The signed-in admin as returned by GET /v1/auth/me. */
export interface Me {
  type: 'admin';
  adminId: string;
  email: string;
  displayName: string;
  role: AdminRole;
  /** The role made in the panel that this admin holds. Set when role is CUSTOM. */
  customRole: CustomRoleRef | null;
  permissions: Permission[];
  /** Whether a code is asked for when this admin signs in. */
  twoFactorEnabled: boolean;
  /** True when the installation asks for two-factor sign-in and this admin has yet to set it up. */
  twoFactorSetupRequired: boolean;
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  admin: Admin;
  /** Set when a recovery code was used to sign in: how many are left. */
  recoveryCodesLeft?: number;
}

export interface Page<Item> {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

export const ASSET_STATUSES = ['UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number] | 'DELETED';

export type ProcessingMode = 'COPY' | 'TRANSCODE' | 'PASSTHROUGH';
export type EncryptionMode = 'NONE' | 'AES_128';

export interface Asset {
  id: string;
  title: string;
  status: AssetStatus;
  storagePoolId: string;
  createdById: string | null;
  source: {
    filename: string | null;
    /** Bytes as text, because the value can be larger than a JSON number holds safely. */
    bytes: string | null;
    checksum: string | null;
  };
  media: {
    durationMs: number | null;
    width: number | null;
    height: number | null;
    frameRate: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
  };
  processingMode: ProcessingMode | null;
  encodingProfileId: string | null;
  encryption: EncryptionMode;
  p2pEnabled: boolean;
  /** Signed address of the poster picture. Null until the asset is ready and has one. */
  posterUrl: string | null;
  readyAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedAsset {
  asset: Asset;
  upload: {
    protocol: 'tus';
    /** Path of the upload endpoint, relative to the API origin. */
    endpoint: string;
    metadata: Record<string, string>;
    maxBytes: number;
  };
}

export interface CreateAssetInput {
  title: string;
  processingMode?: ProcessingMode;
  encryption?: EncryptionMode;
}

export interface ReprocessInput {
  processingMode?: ProcessingMode;
  encryption?: EncryptionMode;
}

export interface Playback {
  protocol: 'hls';
  manifestUrl: string;
  posterUrl: string | null;
  thumbnailTrackUrl: string | null;
  expiresAt: string;
}

export const JOB_STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobType =
  | 'PROBE'
  | 'REMUX'
  | 'TRANSCODE'
  | 'PACKAGE'
  | 'THUMBNAILS'
  | 'SUBTITLES'
  | 'AUDIO'
  | 'MARKERS'
  | 'CLEANUP';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  assetId: string | null;
  /** 0 to 100. */
  progress: number;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  output: unknown;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export const ADMIN_ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'] as const;

/** The colours a role badge can have. */
export const ROLE_COLORS = [
  'slate',
  'blue',
  'cyan',
  'teal',
  'green',
  'amber',
  'orange',
  'rose',
  'violet',
] as const;
export type RoleColor = (typeof ROLE_COLORS)[number];

export const ENCODER_PRESETS = [
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
] as const;
export type EncoderPreset = (typeof ENCODER_PRESETS)[number];

/** One quality of an encoding profile. Bitrates are in bits per second. */
export interface ProfileRendition {
  name: string;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  preset: EncoderPreset;
}

export interface EncodingProfile {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  segmentSeconds: number;
  keyframeSeconds: number;
  renditions: (ProfileRendition & { id: string })[];
  createdAt: string;
  updatedAt: string;
}

export interface EncodingProfileInput {
  name: string;
  description?: string;
  isDefault?: boolean;
  segmentSeconds: number;
  keyframeSeconds: number;
  renditions: ProfileRendition[];
}

export interface LocalPoolConfig {
  basePath: string;
}

/** S3 settings as the API returns them. The secret key is never returned. */
export interface S3PoolConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  keyPrefix?: string;
  accessKeyId: string;
}

export type StoragePool = {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  /** Bytes as text. Null means no limit. */
  quotaBytes: string | null;
  /** Bytes as text. */
  usedBytes: string;
  createdAt: string;
  updatedAt: string;
} & ({ driver: 'LOCAL'; config: LocalPoolConfig } | { driver: 'S3'; config: S3PoolConfig });

export type CreateStoragePoolInput = {
  name: string;
  isDefault?: boolean;
  quotaBytes?: string;
} & (
  | { driver: 'LOCAL'; config: LocalPoolConfig }
  | { driver: 'S3'; config: S3PoolConfig & { secretAccessKey: string } }
);

export interface UpdateStoragePoolInput {
  name?: string;
  isActive?: boolean;
  isDefault?: true;
  quotaBytes?: string | null;
}

export interface StoragePoolTestResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface CreateAdminInput {
  email: string;
  displayName: string;
  password: string;
  role: AdminRole;
  /** Which custom role. Needed when role is CUSTOM. */
  customRoleId?: string;
}

export interface UpdateAdminInput {
  displayName?: string;
  role?: AdminRole;
  /** Which custom role. Needed when role is CUSTOM. */
  customRoleId?: string;
  isActive?: boolean;
  password?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  /** Public start of the key, for recognizing it. */
  prefix: string;
  scopes: Permission[];
  createdBy: { id: string; displayName: string };
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** The answer to creating a key. The full key is in it this once only. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: Permission[];
  expiresAt?: string;
}

export interface AuditEntry {
  id: string;
  adminId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export const ASSET_SORT_FIELDS = ['createdAt', 'title', 'durationMs', 'sourceBytes'] as const;
export type AssetSortField = (typeof ASSET_SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/** Figures for the dashboard, from GET /v1/stats/overview. */
export interface OverviewStats {
  assets: {
    total: number;
    byStatus: Partial<Record<AssetStatus, number>>;
    readyDurationMs: number;
  };
  catalog: {
    titles: number;
    published: number;
    drafts: number;
  };
  viewers: {
    total: number;
    newLast7Days: number;
    activeLast30Days: number;
  };
  jobs: {
    queued: number;
    running: number;
    completedLast24h: number;
    failedLast24h: number;
  };
  storage: {
    pools: number;
    usedBytes: string;
    quotaBytes: string | null;
  };
  /** Assets created per day, oldest first, in UTC. */
  uploadsPerDay: { date: string; count: number }[];
  recentFailures: {
    jobId: string;
    type: JobType;
    assetId: string | null;
    assetTitle: string | null;
    error: string | null;
    finishedAt: string | null;
  }[];
}

/** One language, or one version, of the sound of a video. */
export interface AudioTrack {
  id: string;
  /** Language tag, for example "en". "und" when not known. */
  language: string;
  label: string | null;
  /** EMBEDDED: came with the source file. UPLOADED: a file added afterwards. */
  source: 'EMBEDDED' | 'UPLOADED';
  status: 'PROCESSING' | 'READY' | 'FAILED';
  /** Why an added file could not be made into a track. */
  error: string | null;
  /** The track players start with when the viewer has no preference. */
  isDefault: boolean;
  /** Whether the sound is inside the video segments. Such a track cannot be removed. */
  inVideo: boolean;
  codec: string;
  /** 0 while not known. */
  channels: number;
  /** Bits per second. 0 while not known. */
  bitrate: number;
  /** Bytes as text. */
  sizeBytes: string;
  /** The name of the file an added track was made from. */
  fileName: string | null;
  createdAt: string;
}

/** The generated outputs of an asset, from GET /v1/assets/{id}/media. */
export interface AssetMedia {
  /** Qualities, highest first. */
  renditions: {
    name: string;
    width: number;
    height: number;
    /** Average bitrate in bits per second. */
    bitrate: number;
    frameRate: number | null;
    codec: string;
    /** Bytes as text. */
    sizeBytes: string;
  }[];
  /** The sound tracks: the one inside the video first. Missing from an API older than them. */
  audio?: AudioTrack[];
  subtitles: (SubtitleTrack & { url: string | null })[];
  thumbnails: {
    posterUrl: string | null;
    spriteUrl: string | null;
    spriteTrackUrl: string | null;
  };
  outputBytes: string;
}

// --- Catalog -----------------------------------------------------------------

export type TitleType = 'MOVIE' | 'SERIES';
export const PUBLISH_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type PublishStatus = (typeof PUBLISH_STATUSES)[number];
export type ImageKind = 'POSTER' | 'BACKDROP' | 'STILL' | 'LOGO' | 'PORTRAIT';

export interface CatalogImage {
  id: string;
  kind: ImageKind;
  /** Public address of the picture. */
  url: string;
  width: number;
  height: number;
  bytes: number;
}

/** The part of a video the catalog shows next to a title or an episode. */
export interface AssetRef {
  id: string;
  title: string;
  status: AssetStatus;
  durationMs: number | null;
  height: number | null;
  /** Whether it can be streamed: ready, and stored with a stream. */
  playable: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  titleCount: number;
  createdAt: string;
  updatedAt: string;
}

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
  publishedAt: string | null;
  /** A published title is shown to viewers between these moments. Null leaves that end open. */
  availableFrom: string | null;
  availableUntil: string | null;
  isFeatured: boolean;
  /** FREE, or PAID when watching needs a subscription. */
  access: TitleAccess;
  /** What renting and buying cost, in the smallest unit of the currency. Null: not on offer. */
  rentAmount: number | null;
  buyAmount: number | null;
  /** True when no subscription opens the title: it is rented or bought only. */
  purchaseOnly: boolean;
  poster: CatalogImage | null;
  /** The day of the premiere, as "1999-03-31". */
  releaseDate: string | null;
  /** Movies: the length of the film. Series: the usual length of an episode. In minutes. */
  runtimeMinutes: number | null;
  /** What the audience of the metadata source thinks of it, from 0 to 10. */
  rating: number | null;
  /** Series only: whether more episodes are to come. */
  seriesStatus: SeriesStatus | null;
  genres: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  /** The packages the title is in. Plans open a paid title through them. */
  packages: { id: string; name: string }[];
  asset: AssetRef | null;
  seasonCount: number;
  episodeCount: number;
  /** Series: how many episodes have a video that plays. */
  readyEpisodeCount: number;
  /** Whether viewers can see the title right now. False for a published title with nothing that plays. */
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SERIES_STATUSES = ['UPCOMING', 'RUNNING', 'ENDED', 'CANCELLED'] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];
export type CreditKind = 'CAST' | 'CREW';

export interface PersonRef {
  id: string;
  slug: string;
  name: string;
  portrait: CatalogImage | null;
}

/** One person's part in a title. */
export interface Credit {
  id: string;
  kind: CreditKind;
  /** Cast: the character played. Crew: the job. */
  role: string | null;
  person: PersonRef;
}

export interface Genre {
  id: string;
  slug: string;
  name: string;
  titleCount: number;
  createdAt: string;
}

export interface Person extends PersonRef {
  knownFor: string | null;
  biography: string | null;
  /** Set when the person came with an import. */
  metadata: { source: string; id: string } | null;
  creditCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PersonDetail extends Person {
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
      poster: CatalogImage | null;
    };
  }[];
}

export interface Episode {
  id: string;
  seasonId: string;
  number: number;
  name: string;
  synopsis: string | null;
  status: PublishStatus;
  publishedAt: string | null;
  /** The day it was first shown, as "2021-09-05". */
  airDate: string | null;
  runtimeMinutes: number | null;
  asset: AssetRef | null;
  still: CatalogImage | null;
}

export interface Season {
  id: string;
  number: number;
  name: string | null;
  synopsis: string | null;
  /** The day its first episode was first shown. */
  airDate: string | null;
  poster: CatalogImage | null;
  episodes: Episode[];
}

export interface TitleDetail extends TitleSummary {
  originalName: string | null;
  tagline: string | null;
  synopsis: string | null;
  ageRating: string | null;
  /** The age the title suits from. Null: nobody said, and profiles with an age limit do not see it. */
  minAge: number | null;
  originalLanguage: string | null;
  backdrop: CatalogImage | null;
  logo: CatalogImage | null;
  countries: string[];
  studios: string[];
  keywords: string[];
  imdbId: string | null;
  /** How many voted for the rating. */
  ratingCount: number | null;
  /** Series only: the day the newest episode was first shown. */
  lastAirDate: string | null;
  /** The cast in order, then the crew in order. */
  credits: Credit[];
  trailerAsset: AssetRef | null;
  /** More videos around the title, in their order. */
  extras: Extra[];
  collections: { id: string; name: string }[];
  /** The languages the title is translated into, as tags such as "de". */
  translations: string[];
  /** Where the details were imported from. Null for a title typed by hand. */
  metadata: { source: string; id: string; language: string | null; syncedAt: string | null } | null;
  seasons: Season[];
  checklist: ChecklistItem[];
}

/** Whether the import of details is set up, and what it defaults to. */
export interface MetadataStatus {
  enabled: boolean;
  source: 'tmdb';
  language: string;
  region: string;
}

/** A title at the source, offered to pick from. */
export interface MetadataSearchResult {
  /** The id at the source with its kind: "movie:603" or "tv:1399". */
  id: string;
  type: TitleType;
  name: string;
  originalName: string | null;
  releaseYear: number | null;
  overview: string | null;
  posterUrl: string | null;
  /** Set when the catalog already has a title imported from this entry. */
  existingTitleId: string | null;
}

/** What an import would bring. */
export interface MetadataPreview {
  id: string;
  type: TitleType;
  language: string;
  name: string;
  originalName: string | null;
  tagline: string | null;
  synopsis: string | null;
  releaseYear: number | null;
  ageRating: string | null;
  originalLanguage: string | null;
  genres: { name: string; categoryId: string | null }[];
  artwork: { poster: string | null; backdrop: string | null; logo: string | null };
  seasons: { number: number; name: string | null; episodeCount: number }[];
  existingTitleId: string | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  countries: string[];
  studios: string[];
  rating: number | null;
  seriesStatus: SeriesStatus | null;
  /** How many people the import would bring, and the first of the cast. */
  cast: number;
  crew: number;
  leads: string[];
  /** Movies: the name of the series of films it is part of. */
  collection: string | null;
}

/** Which parts an import brings. Left out, a part is brought. */
export interface MetadataParts {
  id: string;
  language?: string;
  text?: boolean;
  /** Genres, as genres. */
  genres?: boolean;
  /** The cast and the crew that matters, and a picture of each. */
  people?: boolean;
  portraits?: boolean;
  collection?: boolean;
  categories?: boolean;
  createCategories?: boolean;
  artwork?: boolean;
  episodes?: boolean;
  stills?: boolean;
  specials?: boolean;
}

export interface ImportReport {
  fields: string[];
  categoriesCreated: string[];
  genresCreated: string[];
  /** The collection the title was put into, when it was not in it. */
  collection: string | null;
  peopleCreated: number;
  credits: number;
  seasonsCreated: number;
  episodesCreated: number;
  episodesUpdated: number;
  picturesAdded: number;
  warnings: string[];
}

export interface ImportResult {
  title: TitleDetail;
  report: ImportReport;
}

export interface UpdateTitleInput {
  name?: string;
  slug?: string;
  originalName?: string | null;
  tagline?: string | null;
  synopsis?: string | null;
  releaseYear?: number | null;
  ageRating?: string | null;
  /** Left out with a rating, the API reads the age from the rating. */
  minAge?: number | null;
  originalLanguage?: string | null;
  releaseDate?: string | null;
  runtimeMinutes?: number | null;
  countries?: string[];
  studios?: string[];
  keywords?: string[];
  imdbId?: string | null;
  seriesStatus?: SeriesStatus | null;
  genreIds?: string[];
  collectionIds?: string[];
  availableFrom?: string | null;
  availableUntil?: string | null;
  isFeatured?: boolean;
  access?: TitleAccess;
  rentAmount?: number | null;
  buyAmount?: number | null;
  purchaseOnly?: boolean;
  categoryIds?: string[];
  packageIds?: string[];
  assetId?: string | null;
  trailerAssetId?: string | null;
  posterId?: string | null;
  backdropId?: string | null;
  logoId?: string | null;
}

export const TITLE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'releaseYear',
  'publishedAt',
  'releaseDate',
  'rating',
  'runtimeMinutes',
] as const;
export type TitleSortField = (typeof TITLE_SORT_FIELDS)[number];

export interface EpisodeInput {
  number?: number;
  name?: string;
  synopsis?: string | null;
  airDate?: string | null;
  runtimeMinutes?: number | null;
  assetId?: string | null;
  stillId?: string | null;
  status?: 'DRAFT' | 'PUBLISHED';
}

/** One line of the cast and crew of a title, as it is saved. */
export interface CreditInput {
  personId: string;
  kind: CreditKind;
  role: string | null;
}

// --- Viewers ---------------------------------------------------------------

export const VIEWER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type ViewerStatus = (typeof VIEWER_STATUSES)[number];

/** A person with an account on the viewer website. */
export interface Viewer {
  id: string;
  email: string;
  displayName: string;
  status: ViewerStatus;
  /** When the address was confirmed, by the viewer or by an admin. */
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Devices signed in right now. */
  activeSessions: number;
  /** Devices that may play at once, when an admin set it for this viewer. Null: not set. */
  maxStreams: number | null;
  /** The plan the viewer watches through right now, if any. */
  plan: { id: string; name: string; endsAt: string | null } | null;
}

/** A device a viewer is signed in on. */
/** A sign-in of a viewer: a browser, or an app known as a device. */
export type ViewerSession = Schemas['ViewerSessionAdminView'];
/** An app on a television, a phone or a tablet that a viewer is, or was, signed in on. */
export type ViewerDevice = Schemas['ViewerAdminDetail']['devices'][number];

/** One video a viewer began or finished. */
export interface ViewerWatchingItem {
  /** Id of the video: of the episode, or of the title for a movie. */
  id: string;
  /** Who of the account watched. */
  profile: { id: string; name: string };
  title: { id: string; name: string; type: TitleType };
  episode: { id: string; seasonNumber: number; number: number; name: string } | null;
  /** Seconds. A position of 0 means there is nothing to resume. */
  position: number;
  duration: number;
  completedAt: string | null;
  watchedAt: string;
}

/** A title a viewer put on their list to watch later. */
export interface ViewerSavedItem {
  /** Who of the account saved it. */
  profile: { id: string; name: string };
  title: { id: string; name: string; type: TitleType; status: PublishStatus };
  addedAt: string;
  /** Whether this profile has begun the title since. */
  started: boolean;
}

export interface ViewerSaved {
  total: number;
  /** The latest, newest first. */
  items: ViewerSavedItem[];
}

/** How often one title stands on the lists of viewers. */
export interface SavedTitle {
  title: AnalyticsTitleRef;
  saves: number;
  /** Of them, added within the days asked for. */
  recent: number;
  /** Of them, those whose profile has begun the title. */
  started: number;
}

/** What viewers put on their lists, in figures. */
export interface SavedTitles {
  days: number;
  saves: number;
  recent: number;
  /** Profiles that have a list. */
  lists: number;
  /** Titles that stand on a list. */
  titles: number;
  top: SavedTitle[];
}

export interface ViewerWatching {
  total: number;
  completed: number;
  /** The latest, newest first. */
  items: ViewerWatchingItem[];
}

/** One of the people who share a viewer account. */
export interface ViewerProfile {
  id: string;
  name: string;
  /** Name of a colour, such as "amber". */
  color: string;
  isMain: boolean;
  /** A profile for a child. */
  isKids: boolean;
  /** The oldest age rating the profile sees. Null is everything. */
  maxAge: number | null;
  /** Whether choosing the profile asks for its PIN. */
  locked: boolean;
}

export interface ViewerDetail extends Viewer {
  /** The main profile first. */
  profiles: ViewerProfile[];
  sessions: ViewerSession[];
  devices: ViewerDevice[];
}

export const VIEWER_SORT_FIELDS = ['createdAt', 'lastLoginAt', 'email', 'displayName'] as const;
export type ViewerSortField = (typeof VIEWER_SORT_FIELDS)[number];

export interface CreateViewerInput {
  email: string;
  displayName: string;
  password: string;
  /** Whether the admin vouches for the address. Defaults to yes. */
  emailVerified?: boolean;
}

export interface UpdateViewerInput {
  email?: string;
  displayName?: string;
  status?: ViewerStatus;
  emailVerified?: boolean;
  /** Null: follow the plan or the installation again. */
  maxStreams?: number | null;
}

/** What one device of a viewer is playing right now. */
export interface ViewerStream {
  id: string;
  kind: 'VIDEO' | 'LIVE';
  subject: string;
  device: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'TV' | 'OTHER';
  userAgent: string | null;
  profile: { id: string; name: string } | null;
  startedAt: string;
  lastSeenAt: string;
}

/** What a viewer is playing, with how many devices may play at once and why. */
export interface ViewerStreams {
  /** Null: no limit. */
  limit: number | null;
  /** Where the limit comes from: set for the viewer, the plan, or the installation. */
  source: 'VIEWER' | 'PLAN' | 'SITE';
  streams: ViewerStream[];
}

/** What is open to the public on this installation. Set in its environment. */
export interface ViewerAccessConfig {
  registration: 'open' | 'closed';
  playback: 'open' | 'viewers' | 'off';
  /** Whether the installation sends email. */
  email: boolean;
  /** Whether a viewer must confirm their address before they can watch. */
  verification: 'optional' | 'required';
}

/** How email is set up. The password of the mail server is never returned. */
export interface MailStatus {
  enabled: boolean;
  server: { host: string; port: number; secure: boolean; user: string | null } | null;
  from: string | null;
  /** Where the links in emails lead. */
  siteUrl: string | null;
  siteName: string;
  verification: 'optional' | 'required';
  /** The last attempt to send, of the API process that answered. */
  lastDelivery: { at: string; error: string | null } | null;
}

// --- Billing -------------------------------------------------------------------

export type TitleAccess = 'FREE' | 'PAID';

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  /** Short lines shown under the price. */
  features: string[];
  /** Prices in the smallest unit of the currency, such as cents. Null when not sold. */
  monthlyAmount: number | null;
  yearlyAmount: number | null;
  trialDays: number;
  isRecommended: boolean;
  /** Whether the plan opens every paid title. Otherwise it opens its packages. */
  includesAll: boolean;
  packages: { id: string; name: string }[];
  /** Devices a subscriber plays on at the same time. Null: the limit of the installation. */
  maxStreams: number | null;
  /** Whether viewers are offered the plan. */
  isOffered: boolean;
  position: number;
  /** Viewers who can watch through this plan right now. */
  subscribers: number;
  createdAt: string;
  updatedAt: string;
}

export type PlanInput = Pick<
  Plan,
  | 'name'
  | 'description'
  | 'features'
  | 'monthlyAmount'
  | 'yearlyAmount'
  | 'trialDays'
  | 'isRecommended'
  | 'isOffered'
  | 'includesAll'
  | 'maxStreams'
> & {
  /** The packages the plan opens while it does not open everything. */
  packageIds: string[];
};

/** A group of paid titles that plans open together. */
export interface Package {
  id: string;
  name: string;
  description: string | null;
  position: number;
  /** Titles in it, and how many of them are published and need a subscription. */
  titles: number;
  sellableTitles: number;
  /** Live channels in it. */
  channels: number;
  /** The plans that open it by name. Plans that open everything are not listed. */
  plans: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';

export interface Subscription {
  id: string;
  plan: { id: string; name: string };
  status: SubscriptionStatus;
  /** MANUAL: granted by an admin. STRIPE: paid online. */
  source: 'MANUAL' | 'STRIPE';
  interval: 'MONTH' | 'YEAR' | null;
  /** Whether it lets the viewer watch right now. */
  running: boolean;
  startedAt: string;
  /** Until when. Null means it has no end. */
  endsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  note: string | null;
  grantedBy: { id: string; displayName: string } | null;
  /** When the next payment is due. Null when it is not renewed. */
  renewsAt: string | null;
  /** Whether it is paid online and follows the payment provider. */
  online: boolean;
  /** Id of the subscription at Stripe, and where to open it there. */
  externalId: string | null;
  externalUrl: string | null;
  createdAt: string;
}

export interface ViewerSubscriptions {
  current: Subscription | null;
  /** All of them, newest first. */
  history: Subscription[];
}

export interface GrantSubscriptionInput {
  planId: string;
  /** Null means until an admin ends it. */
  endsAt: string | null;
  note?: string | null;
}

export interface BillingOverview {
  /** Devices one account plays on at once where a plan says nothing. 0: no limit. */
  streamLimit: number;
  /** Currency of all prices, such as "EUR". */
  currency: string;
  /** Whether viewers can pay online. */
  checkout: boolean;
  contactUrl: string | null;
  plans: number;
  subscribers: number;
  grantedByHand: number;
  /** Subscribers who pay online. */
  paidOnline: number;
  /** Paying subscribers whose last payment failed and is being tried again. */
  pastDue: number;
  /** How online payment is set up. Null when it is off. */
  stripe: StripeStatus | null;
  /** Running subscriptions that end within seven days and are not renewed. */
  endingSoon: number;
  paidTitles: number;
  publishedTitles: number;
  packages: number;
  /** Plans that open only their packages. */
  limitedPlans: number;
  /** Published paid titles in no package, which only plans that open everything show. */
  unpackagedPaidTitles: number;
}

/** A message Stripe sent to this installation. */
export interface StripeEvent {
  id: string;
  type: string;
  receivedAt: string;
  state: 'handled' | 'failed' | 'pending';
  error: string | null;
}

export interface StripeStatus {
  /** False while the key is one for testing, where no money moves. */
  livemode: boolean;
  /** Path of the endpoint Stripe reports to, after the address of the API. */
  webhookPath: string;
  /** The events the endpoint must be subscribed to at Stripe. */
  webhookEvents: string[];
  /** Where viewers return after paying. */
  siteUrl: string;
  automaticTax: boolean;
  lastEvent: StripeEvent | null;
  /** Messages of the last day that could not be handled. */
  failedEvents: number;
}

/** The Stripe account behind the key. */
export interface StripeAccount {
  id: string;
  name: string | null;
  country: string | null;
  defaultCurrency: string | null;
  chargesEnabled: boolean;
  livemode: boolean;
  /** Set when the account's currency is not the one prices are in here. */
  currencyMismatch: boolean;
}

export type PaymentStatus = 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type PaymentKind = 'SUBSCRIPTION' | 'RENTAL' | 'PURCHASE';

/** A title a viewer rented or bought, or was given by an admin. */
export interface Purchase {
  id: string;
  title: { id: string; name: string; slug: string };
  kind: 'RENT' | 'BUY';
  status: 'ACTIVE' | 'REVOKED';
  source: 'MANUAL' | 'STRIPE';
  /** Whether it can be watched right now. */
  valid: boolean;
  purchasedAt: string;
  /** When a rental was first played. */
  startedAt: string | null;
  /** Until when it may be watched. Null for a bought title. */
  expiresAt: string | null;
  amount: number | null;
  currency: string | null;
  note: string | null;
  grantedBy: { id: string; displayName: string } | null;
}

export interface GrantPurchaseInput {
  titleId: string;
  kind: 'RENT' | 'BUY';
  amount?: number | null;
  note?: string | null;
}

/** Money a viewer paid for a subscription. Amounts are in the smallest unit of the currency. */
export interface Payment {
  id: string;
  /** Null once the account is deleted. The email address stays. */
  viewer: { id: string; displayName: string } | null;
  viewerEmail: string;
  /** What was paid for: a subscription, or renting or buying one title. */
  kind: PaymentKind;
  planId: string | null;
  planName: string | null;
  /** The title that was rented or bought. */
  titleName: string | null;
  /** MANUAL: written down by an admin. STRIPE: collected online. */
  source: 'MANUAL' | 'STRIPE';
  status: PaymentStatus;
  amount: number;
  taxAmount: number;
  refundedAmount: number;
  /** What stays after refunds. */
  netAmount: number;
  currency: string;
  paidAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  note: string | null;
  recordedBy: { id: string; displayName: string } | null;
  /** Where to open it at Stripe. */
  externalUrl: string | null;
  createdAt: string;
}

export interface PaymentListQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  source?: 'MANUAL' | 'STRIPE';
  kind?: PaymentKind;
  status?: PaymentStatus;
  planId?: string;
  /** Paid at or after this moment, and before that one. */
  from?: string;
  to?: string;
}

export interface RecordPaymentInput {
  amount: number;
  paidAt?: string;
  planId?: string;
  note?: string | null;
}

export interface RevenueMonth {
  /** "2026-11" */
  month: string;
  gross: number;
  refunded: number;
  net: number;
  tax: number;
  payments: number;
  /** Of net: collected online, and written down by an admin. */
  online: number;
  byHand: number;
  /** Subscriptions paid online that started, and that ended. */
  started: number;
  ended: number;
}

export interface RevenueReport {
  currency: string;
  timeZone: string;
  months: RevenueMonth[];
  totals: { gross: number; refunded: number; net: number; tax: number; payments: number };
  byPlan: { planId: string | null; planName: string; net: number; payments: number }[];
  /** What the subscriptions paid online bring in per month as they stand. */
  monthlyRecurring: number;
  payingSubscribers: number;
  trialing: number;
  /** Payments in other currencies, left out of every sum. */
  otherCurrencies: { currency: string; payments: number }[];
}

// --- Live ---------------------------------------------------------------------

/** "WAITING" stands for an enabled channel that no live process reports on. */
export type ChannelStatus =
  'STOPPED' | 'WAITING' | 'IDLE' | 'STARTING' | 'RUNNING' | 'RECONNECTING' | 'FAILED';

/** PULL: the server connects to an address. PUSH: an encoder connects with a stream key. */
export type ChannelIngest = 'PULL' | 'PUSH';

/** What to enter in an encoder for a pushed channel. Addresses are null when not configured. */
export interface EncoderSettings {
  streamKey: string;
  rtmpServer: string | null;
  rtmpUrl: string | null;
  srtUrl: string | null;
}

/** COPY passes the picture on as it arrives. TRANSCODE encodes it into several qualities. */
export type ChannelMode = 'COPY' | 'TRANSCODE';

export interface ChannelOutput {
  name: string;
  height: number;
  videoKbps: number;
}

/** What a source carries. */
export interface ChannelStreams {
  videoCodec: string;
  width: number;
  height: number;
  frameRate: number | null;
  audioCodec: string | null;
  audioChannels: number | null;
}

export interface Channel {
  id: string;
  name: string;
  slug: string;
  number: number | null;
  description: string | null;
  ingest: ChannelIngest;
  /** The address of a pulled channel without anything secret. Empty for a pushed one. */
  source: string;
  mode: ChannelMode;
  /** The qualities chosen for transcoding, as picture heights. */
  qualities: number[];
  /** The qualities the channel is encoded into, once the source is known. */
  outputs: ChannelOutput[] | null;
  /** Minutes viewers can go back in time. 0 means only the present. */
  dvrMinutes: number;
  /** The age the channel suits from. Null: nobody said, and profiles with an age limit do not see it. */
  minAge: number | null;
  /** The id of the channel in guide sources. Null when it is not linked. */
  guideId: string | null;
  /** Whether viewers find the channel on the website and in the apps. */
  published: boolean;
  /** FREE is as open as the site. PAID needs a plan that opens the channel. */
  access: 'FREE' | 'PAID';
  packages: { id: string; name: string }[];
  /** Whether the channel is meant to run. */
  enabled: boolean;
  status: ChannelStatus;
  statusMessage: string | null;
  startedAt: string | null;
  restartCount: number;
  streams: ChannelStreams | null;
  /** Figures of the running stream. Null while no live process runs the channel. */
  health: {
    bitrate: number | null;
    speed: number | null;
    lastDataAt: string | null;
    node: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelDetails extends Channel {
  /** The latest lines of the live process, oldest first. */
  log: string[];
}

export interface ChannelInput {
  name: string;
  slug?: string;
  number: number | null;
  description: string | null;
  ingest?: ChannelIngest;
  source?: string;
  mode?: ChannelMode;
  qualities?: number[];
  guideId?: string | null;
  dvrMinutes?: number;
  minAge?: number | null;
  published?: boolean;
  access?: 'FREE' | 'PAID';
  packageIds?: string[];
  start?: boolean;
}

/** What testing a source found. */
export type SourceProbe =
  | {
      ok: true;
      streams: ChannelStreams;
      /** What happens to the audio of a channel that is passed through. */
      audio: 'copy' | 'aac' | 'none';
      /** Why the source cannot be passed through. Null when it can. */
      copyObstacle: string | null;
    }
  | { ok: false; reason: string };

export interface LivePlayback {
  protocol: 'hls';
  url: string;
  expiresAt: string;
}

// --- Programme guide -----------------------------------------------------------

/** A place the guide is imported from: an XMLTV file at an address. */
export interface GuideSource {
  id: string;
  name: string;
  /** The address without anything secret. */
  url: string;
  enabled: boolean;
  lastRun: { at: string; ok: boolean; message: string } | null;
  /** Programmes it holds for channels of this installation. */
  programmes: number;
  /** Channels its file lists. */
  channels: number;
  createdAt: string;
  updatedAt: string;
}

export interface GuideImportResult {
  ok: boolean;
  message: string;
  programmes: number;
  channels: number;
  linked: number;
}

/** A channel some guide source knows. */
export interface KnownGuideChannel {
  guideId: string;
  name: string;
  source: string;
}

export interface Programme {
  id: string;
  channelId: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startsAt: string;
  endsAt: string;
  /** Null for a programme an admin entered, which can be changed. */
  source: { id: string; name: string } | null;
}

export interface ProgrammeInput {
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  startsAt: string;
  endsAt: string;
}

// --- Recordings ------------------------------------------------------------------

export type RecordingStatus =
  'SCHEDULED' | 'RECORDING' | 'FINISHING' | 'DONE' | 'FAILED' | 'CANCELLED';

/** A stretch of a live channel kept as a file, which becomes an asset in the library. */
export interface Recording {
  id: string;
  title: string;
  /** The id is null once the channel is deleted. Its name is kept. */
  channel: { id: string | null; name: string };
  startsAt: string;
  endsAt: string;
  status: RecordingStatus;
  statusMessage: string | null;
  /** How much was really recorded. Null until it is known. */
  recordedSeconds: number | null;
  bytes: string | null;
  /** What it became in the library, and how far that is processed. */
  asset: { id: string; status: AssetStatus } | null;
  createdAt: string;
}

export interface RecordingInput {
  channelId: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

// --- Delivery --------------------------------------------------------------------

export type EdgeStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED' | 'NEVER_CONNECTED';

/** One point of an edge's traffic: [time in seconds, bits per second, requests per second]. */
export type EdgeSample = [number, number, number];

/** A server that delivers video to viewers in place of the main server. */
export interface EdgeServer {
  id: string;
  name: string;
  /** The address viewers reach it at. */
  publicUrl: string;
  location: string | null;
  enabled: boolean;
  /** Its share of viewers compared with the other edges, 1 to 100. */
  weight: number;
  serveVideo: boolean;
  serveLive: boolean;
  status: EdgeStatus;
  lastSeenAt: string | null;
  version: string | null;
  hostname: string | null;
  remoteIp: string | null;
  /** Everything delivered since the edge was added. */
  bytesServed: string;
  requestsServed: string;
  /** What the agent reports now. Null while it is not connected. */
  now: {
    bitsPerSecond: number;
    requestsPerSecond: number;
    activeRequests: number;
    /** Share of requests answered from copies on the edge, 0 to 1. */
    hitRatio: number | null;
    startedAt: string;
    cache: { bytes: number; files: number; limitBytes: number };
    system: {
      cpus: number;
      load1: number | null;
      diskFreeBytes: number | null;
      diskTotalBytes: number | null;
    };
    refused: number;
    originErrors: number;
  } | null;
  /** Traffic of the last hour, oldest first. */
  samples: EdgeSample[];
  /** What its copies are being emptied of, until the agent says it is done. */
  purging: PurgeScope[];
  createdAt: string;
}

export interface EdgeInput {
  name: string;
  publicUrl: string;
  location: string | null;
  weight: number;
  serveVideo: boolean;
  serveLive: boolean;
  enabled: boolean;
}

/** An edge with the token of its agent, which the API shows once. */
export interface EdgeWithToken {
  edge: EdgeServer;
  token: string;
}

export type PurgeScope = 'all' | 'video' | 'live';

export type TrafficRange = '24h' | '7d' | '30d';

/**
 * One hour of an edge: [start in seconds, bytes delivered, requests, from
 * copies, fetched first, bytes fetched from the main server].
 */
export type TrafficPoint = [number, number, number, number, number, number];

/** What the edges delivered, hour by hour. Hours without traffic are left out. */
export interface EdgeTraffic {
  range: TrafficRange;
  from: string;
  hours: number;
  edges: { id: string; name: string; points: TrafficPoint[] }[];
}

// --- P2P -------------------------------------------------------------------------

/** What the tracker says about itself. */
export interface TrackerStats {
  version: string;
  connections: number;
  /** Connections turned away: no token, too many, wrong website. */
  refusedConnections: number;
  /** Viewers in swarms. */
  peers: number;
  swarms: number;
  /** The sizes of the largest swarms, largest first. */
  largestSwarms: number[];
  announces: number;
  offersRelayed: number;
  answersRelayed: number;
  /** Messages that made no sense. */
  refused: number;
  startedAt: string;
}

export type P2pStatus =
  | { state: 'off' }
  | { state: 'unreachable'; trackerUrl: string; message: string }
  | { state: 'running'; trackerUrl: string; stats: TrackerStats };

/** One hour of sharing: [start in seconds, from servers, from viewers, to viewers, reports]. */
export type SharingPoint = [number, number, number, number, number];

/** What the players of viewers reported, hour by hour, for films and for live channels. */
export interface SharingTraffic {
  range: TrafficRange;
  from: string;
  hours: number;
  video: SharingPoint[];
  live: SharingPoint[];
}

/**
 * One hour of delivery, in bytes: [start in seconds, sent by the gateway to
 * viewers, delivered by edges, fetched by edges from the main server, passed
 * between viewers].
 */
export type OverviewPoint = [number, number, number, number, number];

/** Who delivered what: the main server, the edges, the viewers. */
export interface DeliveryOverview {
  range: TrafficRange;
  from: string;
  hours: number;
  /** Whether what the gateway itself sends is counted. Without it there is no overall figure. */
  gatewayCounted: boolean;
  points: OverviewPoint[];
}

// --- Backups ---------------------------------------------------------------------

export type BackupStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type BackupSchedule = 'off' | 'daily' | 'weekly';
/** How well the installation is protected, going by its newest good backup. */
export type BackupProtection = 'protected' | 'late' | 'none' | 'off';

export interface BackupSettings {
  schedule: BackupSchedule;
  /** The hour of the day a scheduled backup is made, in UTC. */
  hour: number;
  /** For weekly backups: the day in UTC, with 0 for Sunday. */
  weekday: number;
  /** How many finished backups are kept. */
  keep: number;
  /** Where backups are written. Null is the default storage pool. */
  storagePoolId: string | null;
}

export interface Backup {
  id: string;
  status: BackupStatus;
  trigger: 'MANUAL' | 'SCHEDULED';
  pool: { id: string; name: string };
  fileName: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  /** How many database objects the file holds. */
  entries: number | null;
  appVersion: string;
  migration: string | null;
  error: string | null;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BackupOverview {
  settings: BackupSettings;
  protection: BackupProtection;
  lastGoodAt: string | null;
  nextRunAt: string | null;
  /** The process that makes the backups. Null when none has been heard of lately. */
  runner: { pgDump: string | null; server: string | null; problem: string | null } | null;
  appVersion: string;
  totalBytes: number;
  /** The last thirty days, oldest first. */
  days: { date: string; good: number; failed: number }[];
  pools: { id: string; name: string; driver: string; isDefault: boolean; isActive: boolean }[];
  backups: Backup[];
}

// --- Diagnostics -----------------------------------------------------------------

/** "off" is something that is not set up. It is no fault. */
export type CheckStatus = 'ok' | 'warning' | 'problem' | 'off';
export type CheckGroup =
  'core' | 'processing' | 'storage' | 'protection' | 'delivery' | 'live' | 'connections' | 'setup';

export interface DiagnosticCheck {
  id: string;
  group: CheckGroup;
  title: string;
  status: CheckStatus;
  summary: string;
  /** What to do about it. */
  hint?: string;
  /** The page of the panel where it is dealt with. */
  link?: { label: string; to: string };
  facts?: [label: string, value: string][];
}

export interface ProcessReport {
  id: string;
  roles: string[];
  host: string;
  pid: number;
  version: string;
  node: string;
  startedAt: string;
  seenAt: string;
  memoryBytes: number;
}

export interface DiagnosticsSummary {
  status: 'ok' | 'warning' | 'problem';
  problems: number;
  warnings: number;
  checkedAt: string;
}

export interface DiagnosticsReport extends DiagnosticsSummary {
  tookMs: number;
  version: {
    version: string;
    commit: string | null;
    node: string;
    update: 'current' | 'available' | 'unknown';
    latestCommit: string | null;
    /** Why it is not known whether a newer version exists. */
    updateNote: string | null;
  };
  checks: DiagnosticCheck[];
  processes: ProcessReport[];
  alerts: { emailAlerts: boolean; mailEnabled: boolean; recipients: string[] };
}

export type ExtraKind =
  'TRAILER' | 'TEASER' | 'CLIP' | 'FEATURETTE' | 'BEHIND_THE_SCENES' | 'INTERVIEW' | 'BLOOPERS';

/** A video that goes with a title beside the film itself. */
export interface Extra {
  id: string;
  kind: ExtraKind;
  name: string;
  position: number;
  /** Null when the video was deleted in the library. */
  asset: AssetRef | null;
}

/** Titles that belong together in an order. */
export interface Collection {
  id: string;
  slug: string;
  name: string;
  synopsis: string;
  /** A hidden collection is kept in the panel and not offered to viewers. */
  visible: boolean;
  position: number;
  poster: CatalogImage | null;
  backdrop: CatalogImage | null;
  titleCount: number;
  /** Posters of its first titles. */
  covers: CatalogImage[];
  /** Where it was imported from, or null for one made by hand. */
  metadataSource: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionTitle {
  id: string;
  type: TitleType;
  name: string;
  releaseYear: number | null;
  status: PublishStatus;
  poster: CatalogImage | null;
}

export interface CollectionDetail extends Collection {
  titles: CollectionTitle[];
}

export type Availability = 'scheduled' | 'current' | 'ended';

/** The texts of a season or an episode in one language. Null: not translated. */
export interface PartTranslation {
  id: string;
  name: string | null;
  synopsis: string | null;
}

/** Everything a title says in one more language. */
export interface Translation {
  language: string;
  name: string | null;
  tagline: string | null;
  synopsis: string | null;
  seasons: PartTranslation[];
  episodes: PartTranslation[];
  /** How many texts are translated, of how many the title has. */
  filled: number;
  total: number;
  updatedAt: string;
}

export interface TranslationInput {
  name: string | null;
  tagline: string | null;
  synopsis: string | null;
  seasons: PartTranslation[];
  episodes: PartTranslation[];
}

/** What the source says about a title in another language. */
export interface SourceTranslation extends TranslationInput {
  language: string;
  warnings: string[];
}

export type WatchedFileState =
  | 'WAITING'
  | 'UNRECOGNISED'
  | 'QUEUED'
  | 'IMPORTING'
  | 'IMPORTED'
  | 'CONFLICT'
  | 'FAILED'
  | 'IGNORED';
export type WatchAfterImport = 'MOVE' | 'KEEP' | 'DELETE';
export type WatchProcessingMode = 'COPY' | 'TRANSCODE' | 'PASSTHROUGH';

export interface WatchLocalConfig {
  basePath: string;
}
export interface WatchS3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  keyPrefix?: string;
  accessKeyId: string;
  secretAccessKeySet: true;
}

/** A folder or a bucket that is looked through for new videos. */
export interface WatchLocation {
  id: string;
  name: string;
  driver: 'LOCAL' | 'S3';
  config: WatchLocalConfig | WatchS3Config;
  isActive: boolean;
  scanIntervalMinutes: number;
  storagePool: { id: string; name: string } | null;
  processingMode: WatchProcessingMode | null;
  encodingProfile: { id: string; name: string } | null;
  autoPublish: boolean;
  afterImport: WatchAfterImport;
  lastScanAt: string | null;
  lastScanError: string | null;
  scanRequested: boolean;
  counts: Partial<Record<WatchedFileState, number>>;
  createdAt: string;
  updatedAt: string;
}

/** Where a location is, as the forms send it. */
export type WatchPlaceInput =
  | { driver: 'LOCAL'; config: { basePath: string } }
  | {
      driver: 'S3';
      config: {
        bucket: string;
        region?: string;
        endpoint?: string;
        forcePathStyle?: boolean;
        keyPrefix?: string;
        accessKeyId: string;
        secretAccessKey: string;
      };
    };

export interface WatchLocationSettings {
  name: string;
  isActive: boolean;
  scanIntervalMinutes: number;
  storagePoolId: string | null;
  processingMode: WatchProcessingMode | null;
  encodingProfileId: string | null;
  autoPublish: boolean;
  afterImport: WatchAfterImport;
}

export interface WatchPlaceTest {
  files: number;
  videos: number;
  recognised: number;
  capped: boolean;
  /** False when the API can read the folder but not move or delete files in it. */
  writable: boolean;
  samples: { path: string; recognisedAs: string | null }[];
}

/** One video file found in a watched location, and what became of it. */
export interface WatchedFile {
  id: string;
  location: { id: string; name: string };
  path: string;
  /** Bytes, as a string. */
  size: string;
  modifiedAt: string;
  state: WatchedFileState;
  metadataId: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  matchedByHand: boolean;
  title: { id: string; type: TitleType; name: string } | null;
  episode: { id: string; name: string } | null;
  asset: { id: string; status: string } | null;
  publishPending: boolean;
  note: string | null;
  firstSeenAt: string;
  importedAt: string | null;
}

export interface WatchSummary {
  locations: number;
  counts: Partial<Record<WatchedFileState, number>>;
  attention: number;
}

// --- Actions on many titles -------------------------------------------------------------

/** What is done to every title of a selection. */
export type BulkAction =
  | { type: 'publish' | 'unpublish' | 'archive' | 'delete' }
  | { type: 'feature'; value: boolean }
  /** Null takes the age off. */
  | { type: 'age'; minAge: number | null }
  | { type: 'categories' | 'genres' | 'collections'; add?: string[]; remove?: string[] }
  /** A date left out stays as it is, null clears it. */
  | { type: 'availability'; availableFrom?: string | null; availableUntil?: string | null }
  | { type: 'translate'; language: string; overwrite?: boolean };

export interface BulkFailure {
  titleId: string;
  name: string;
  reason: string;
}

export interface BulkResult {
  action: BulkAction['type'];
  /** How many titles the selection meant. */
  matched: number;
  changed: number;
  /** Titles that were as asked already. */
  unchanged: number;
  failed: number;
  /** The first failures, with the reason of each. */
  failures: BulkFailure[];
  /** Set by "translate": the job that does the work, in the background. */
  job: TranslationJob | null;
}

export type TranslationJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';

/** A job that fills in the texts of many titles in a language, from the source of their details. */
export interface TranslationJob {
  id: string;
  language: string;
  /** Replaces texts that are translated already. */
  overwrite: boolean;
  status: TranslationJobStatus;
  total: number;
  done: number;
  translated: number;
  /** Titles the source had nothing new for. */
  unchanged: number;
  /** Titles that were not imported, so the source has nothing for them. */
  skipped: number;
  failed: number;
  failures: BulkFailure[];
  /** Why the whole job stopped, when it did. */
  note: string | null;
  createdBy: { id: string; displayName: string } | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// --- Subtitles of a video ---------------------------------------------------------------

export interface SubtitleTrack {
  id: string;
  /** A language tag such as "de", or "und" when the language is not known. */
  language: string;
  /** The name the player shows. */
  label: string | null;
  /** EMBEDDED: taken from the source file. UPLOADED: added as a file of its own. */
  source: 'EMBEDDED' | 'UPLOADED' | 'GENERATED';
  isDefault: boolean;
  /** Shown without being turned on: for the parts spoken in another language. */
  isForced: boolean;
}

export interface AddedSubtitle {
  track: SubtitleTrack;
  /** How many subtitles the file holds. */
  cues: number;
  format: 'srt' | 'vtt' | 'ass';
  /** What its bytes were read as, such as "utf-8" or "windows-1256". */
  encoding: string;
  /** Something to check, when the file looks as if it belonged to another video. */
  warning: string | null;
}

// --- The home page of the website ---------------------------------------------------------

export type HomeSectionKind =
  'HERO' | 'CONTINUE_WATCHING' | 'MY_LIST' | 'BECAUSE_YOU_WATCHED' | 'TITLES';
export type HomeSource = 'ALL' | 'FEATURED' | 'CATEGORY' | 'GENRE' | 'COLLECTION' | 'MANUAL';
export type HomeSort = 'CURATED' | 'NEWEST' | 'RELEASED' | 'RATING' | 'NAME';
export type HomeLayout = 'POSTER' | 'LANDSCAPE' | 'NUMBERED';

/** A title as viewers get it on a card, as far as the panel shows it. */
export interface HomePreviewTitle {
  id: string;
  type: TitleType;
  slug: string;
  name: string;
  poster: { url: string } | null;
  backdrop: { url: string } | null;
}

export interface HomeSection {
  id: string;
  position: number;
  kind: HomeSectionKind;
  /** The heading an admin gave. Null: `defaultName` is used. */
  name: string | null;
  defaultName: string;
  source: HomeSource;
  category: { id: string; name: string } | null;
  genre: { id: string; name: string } | null;
  collection: { id: string; name: string } | null;
  /** Only movies or only series. Null: both. */
  titleType: TitleType | null;
  sort: HomeSort;
  /** The most titles shown. */
  limit: number;
  layout: HomeLayout;
  visible: boolean;
  visibleFrom: string | null;
  visibleUntil: string | null;
  /** Whether viewers see it right now: switched on, inside its dates, and not empty. */
  shownNow: boolean;
  /** The picked titles of a MANUAL section, also those viewers cannot see. */
  picked: { id: string; name: string; type: TitleType; visible: boolean }[];
  /** The first titles viewers get. */
  preview: HomePreviewTitle[];
  /** How many titles viewers get, up to the limit. */
  count: number;
}

/** A page of the website that is arranged in the panel, as the API names it. */
export type LayoutPageName = 'HOME' | 'MOVIES' | 'SERIES' | 'LIVE' | 'CATEGORY' | 'GENRE';
/** The same, as it stands in addresses. */
export type LayoutPageSlug = 'home' | 'movies' | 'series' | 'live' | 'category' | 'genre';

export interface LayoutPageSummary {
  page: LayoutPageName;
  /** True when it has sections. */
  custom: boolean;
  sections: number;
}

export interface HomePage {
  page: LayoutPageName;
  /** On the page of categories or genres: the one the sections are shown with. */
  example: { id: string; slug: string; name: string } | null;
  /** False while the page has no sections and is what it is by itself. */
  custom: boolean;
  sections: HomeSection[];
}

export interface HomeSectionInput {
  name?: string | null;
  source?: HomeSource;
  categoryId?: string | null;
  genreId?: string | null;
  collectionId?: string | null;
  titleType?: TitleType | null;
  sort?: HomeSort;
  limit?: number;
  layout?: HomeLayout;
  visible?: boolean;
  visibleFrom?: string | null;
  visibleUntil?: string | null;
  /** For the source MANUAL: the titles, in their order. */
  titleIds?: string[];
}

// --- What is watched ----------------------------------------------------------------------

export type PlayDevice = 'DESKTOP' | 'MOBILE' | 'TABLET' | 'TV' | 'OTHER';

/** The figures of a stretch of time. */
export interface ViewFigures {
  /** Plays that counted: at least half a minute watched. */
  views: number;
  /** Different viewers among them. A visitor who is not signed in counts once per day. */
  viewers: number;
  /** Seconds played, also in plays too short to count as a view. */
  watchSeconds: number;
  /** Views watched to the end, of all views, from 0 to 1. */
  completionRate: number;
  /** Seconds watched per view. */
  averageSeconds: number;
}

export interface ViewDay {
  /** "2026-12-24" */
  day: string;
  views: number;
  viewers: number;
  watchSeconds: number;
}

export interface AnalyticsTitleRef {
  id: string;
  name: string;
  type: TitleType;
  poster: { url: string } | null;
}

export interface DeviceFigures {
  device: PlayDevice;
  views: number;
  watchSeconds: number;
}

export interface AnalyticsSummary {
  /** False when the installation records nothing. */
  recording: boolean;
  totals: ViewFigures;
  /** The same number of days right before. */
  previous: ViewFigures;
  days: ViewDay[];
  devices: DeviceFigures[];
  audience: { signedIn: number; visitors: number; paid: number; free: number };
  /** Views by the hour of the day they began in, 0 to 23. */
  hours: number[];
}

export interface TitleViewFigures extends ViewFigures {
  /** Null for plays whose title was deleted since. */
  title: AnalyticsTitleRef | null;
}

export interface TitleAnalytics {
  title: AnalyticsTitleRef;
  totals: ViewFigures;
  previous: ViewFigures;
  days: ViewDay[];
  episodes: (ViewFigures & {
    id: string;
    seasonNumber: number;
    number: number;
    name: string | null;
  })[];
  /** The share of views that reached at least 10 %, 20 % ... 100 % of the video. */
  reach: number[];
  devices: DeviceFigures[];
  trailerPlays: number;
  extraPlays: number;
}

export interface WatchingNow {
  watching: number;
  titles: { title: AnalyticsTitleRef; watching: number }[];
}

export type TitleRanking = 'views' | 'viewers' | 'watchSeconds' | 'completion';

export type CouponState = 'ACTIVE' | 'SCHEDULED' | 'ENDED' | 'USED_UP' | 'OFF';
export type CouponKind = 'PERCENT' | 'AMOUNT';
export type CouponScope = 'EVERYTHING' | 'SUBSCRIPTIONS' | 'TITLES';
export type CouponDuration = 'ONCE' | 'REPEATING' | 'FOREVER';

/** A code that lowers a price at checkout. */
export interface Coupon {
  id: string;
  code: string;
  /** What it is for. Viewers do not see it. */
  note: string | null;
  kind: CouponKind;
  percentOff: number | null;
  /** In the smallest unit of the currency. */
  amountOff: number | null;
  scope: CouponScope;
  duration: CouponDuration;
  durationMonths: number | null;
  /** The plans it is for. Empty: every plan. */
  plans: { id: string; name: string }[];
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  oncePerViewer: boolean;
  newCustomersOnly: boolean;
  isActive: boolean;
  /** Where it stands now: its switch, its dates and its uses taken together. */
  state: CouponState;
  used: number;
  /** What it took off first payments in all. */
  discountTotal: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CouponInput {
  code: string;
  note: string | null;
  kind: CouponKind;
  percentOff: number | null;
  amountOff: number | null;
  scope: CouponScope;
  duration: CouponDuration;
  durationMonths: number | null;
  planIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  oncePerViewer: boolean;
  newCustomersOnly: boolean;
  isActive: boolean;
}

/** One checkout that was completed with a code. */
export interface CouponRedemption {
  id: string;
  /** The id is null once the account is deleted. */
  viewer: { id: string | null; email: string };
  kind: 'SUBSCRIPTION' | 'RENTAL' | 'PURCHASE';
  /** The plan or the title, as it was called then. */
  subject: string;
  listAmount: number;
  discountAmount: number;
  currency: string;
  createdAt: string;
}

/** A role as the panel lists it: one of the four built in, or one made there. */
export interface Role {
  /** The id of a custom role. Null for a built-in one, which is named by `key`. */
  id: string | null;
  key: AdminRole;
  builtIn: boolean;
  name: string;
  description: string;
  color: string;
  permissions: Permission[];
  /** How many admins hold it, deactivated ones included. */
  adminCount: number;
  /** The built-in role whose permissions this one covers, as a hint. */
  like: BuiltInRole | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RoleHolder {
  id: string;
  displayName: string;
  email: string;
  isActive: boolean;
}

export interface RoleDetail extends Role {
  admins: RoleHolder[];
}

/** A part of the panel a role can be let into. */
export interface PermissionArea {
  key: string;
  label: string;
  read: { permission: Permission; description: string };
  /** Null for areas that can only be seen. */
  write: { permission: Permission; description: string } | null;
  /** Reaches beyond its own page: the panel shows a warning. */
  sensitive: boolean;
}

export interface PermissionSection {
  key: string;
  label: string;
  description: string;
  areas: PermissionArea[];
}

export interface RolesOverview {
  roles: Role[];
  catalog: PermissionSection[];
}

export interface RoleInput {
  name: string;
  description: string;
  color: string;
  permissions: Permission[];
}

/** The kinds of things, besides titles, whose names viewers read. */
export const TERM_KINDS = ['categories', 'genres', 'collections', 'people'] as const;
export type TermKind = (typeof TERM_KINDS)[number];

/** A text of a term that can be translated. */
export interface TermField {
  key: string;
  label: string;
  /** A text of several lines. */
  long: boolean;
  maxLength: number;
}

/** Texts by field. Null: there is none. */
export type TermTexts = Record<string, string | null>;

export interface TermRow {
  id: string;
  slug: string;
  original: TermTexts;
  /** Null: nothing of this term is translated into the language. */
  translation: TermTexts | null;
  /** How many titles the term is on. */
  titles: number;
  updatedAt: string | null;
}

export interface TermsOverview {
  kinds: { kind: TermKind; label: string; fields: TermField[]; total: number }[];
  languages: {
    language: string;
    /** Per kind, how many terms have a text in this language. */
    translated: Record<TermKind, number>;
    titles: number;
  }[];
}

export interface TermSaveItem {
  id: string;
  texts: Record<string, string | null>;
}

/** The parts of a title a change belongs to, for filtering its history. */
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

/** One thing that differs between two moments of a title. */
export interface TitleChange {
  group: ChangeGroup;
  /** Stable, for keys: "synopsis", "genres", "season:1:episode:3:name". */
  field: string;
  label: string;
  kind: 'text' | 'value' | 'list';
  /** How `before` and `after` are shown: as they are, or as a price, a date and so on. */
  format?: 'money' | 'date' | 'datetime' | 'status' | 'yesno' | 'picture';
  before?: string | null;
  after?: string | null;
  added?: string[];
  removed?: string[];
  reordered?: boolean;
}

export interface TitleRevision {
  id: string;
  /** What was done, as a word: "update", "publish", "import", "restore". */
  action: string;
  createdAt: string;
  admin: { id: string; displayName: string } | null;
  changes: TitleChange[];
  /** More than `changes` holds when the list was cut. */
  changeCount: number;
  /** The first revision of the title: nothing to compare it with. */
  first: boolean;
}

export interface TitleRevisionDetail extends TitleRevision {
  /** What bringing this version back would change now. */
  restore: TitleChange[];
}

/** A link in the footer of the website. */
export interface FooterLink {
  label: string;
  url: string;
}

/** How the website presents itself. Null means: as it ships. */
export interface BrandingSettings {
  name: string | null;
  description: string | null;
  logoId: string | null;
  /** Whether the name is written next to the logo, or the logo stands for it. */
  logoShowsName: boolean;
  iconId: string | null;
  /** The one colour of the interface, as "#rrggbb". */
  accent: string | null;
  footerText: string | null;
  footerLinks: FooterLink[];
}

export interface Branding {
  settings: BrandingSettings;
  logo: CatalogImage | null;
  icon: CatalogImage | null;
  /** What shows where a setting is left empty. */
  defaults: { name: string; description: string; accent: string };
  /** How light the accent has to be against black. */
  minimumContrast: number;
}

// --- Webhooks ------------------------------------------------------------------------
//
// These come from the description of the API, which is produced from the
// server's own source. New types should be taken from there the same way,
// and the hand-written ones above move over as they are touched.

/** A webhook: an address of another system that is told when something happens. */
export type Webhook = Schemas['WebhookView'];
/** A webhook with its signing secret: shown once. */
export type WebhookWithSecret = Schemas['WebhookWithSecret'];
export type WebhookInput = BodyOf<'Webhooks_create'>;
export type WebhookDeliveryStatus = Schemas['WebhookDeliveryStatus'];
export type WebhookDelivery = Schemas['DeliveryView'];
export type WebhookDeliveryDetail = Schemas['DeliveryDetail'];
export type WebhookActivityHour = Schemas['WebhookActivityHour'];
export type WebhookEventInfo = Schemas['WebhookEventInfo'];
export type WebhookReference = Schemas['WebhookReference'];

// --- Apps and the description of the API ------------------------------------------------

/** The oldest version of one app that may still use the installation. */
export type AppVersionRule = Schemas['AppVersionRule'];
export type AppVersions = Schemas['AppVersionsView'];

// --- Similar titles ---------------------------------------------------------------------

export type SimilarSignalKind =
  | 'collection'
  | 'watched'
  | 'genres'
  | 'keywords'
  | 'cast'
  | 'crew'
  | 'categories'
  | 'kind'
  | 'era'
  | 'studio'
  | 'language';

/** One reason two titles are alike. */
export interface SimilarSignal {
  signal: SimilarSignalKind;
  /** What it gave of the 100 points. */
  points: number;
  /** How many genres, keywords or people are shared, or profiles that watched both. */
  count: number;
  /** The names of what is shared, where there are names. */
  names: string[];
}

export interface SimilarItem {
  title: {
    id: string;
    slug: string;
    name: string;
    type: TitleType;
    releaseYear: number | null;
    ageRating: string | null;
    status: PublishStatus;
    poster: CatalogImage | null;
  };
  pinned: boolean;
  /** From 0 to 100. Null: the two share nothing. */
  score: number | null;
  signals: SimilarSignal[];
  /** The place among what viewers get, from 1. Null while they do not see it. */
  rank: number | null;
  unseen: 'draft' | 'dates' | 'unplayable' | null;
}

/** What the last count of titles watched by the same people found. */
export interface SimilarWatching {
  rebuiltAt: string;
  pairs: number;
  titles: number;
  profiles: number;
  tookMs: number;
}

export interface SimilarView {
  title: { id: string; name: string; type: TitleType };
  /** Pinned titles in their order, then the titles found, most alike first. */
  items: SimilarItem[];
  hidden: SimilarItem[];
  /** How many the website shows, and the most an app can ask for. */
  shownByDefault: number;
  most: number;
  weights: Record<SimilarSignalKind, number>;
  watching: (SimilarWatching & { minimumAccounts: number }) | null;
}

// --- Playback quality -------------------------------------------------------------------

/** How playback went for a set of playbacks. */
export interface QualityFigures {
  /** Playbacks a player reported on. */
  attempts: number;
  started: number;
  /** A problem ended it before the first picture. */
  startFailures: number;
  /** The viewer left before the first picture. */
  leftBeforeStart: number;
  /** A problem ended it after it had started. */
  playbackFailures: number;
  /** Time to the first picture, in milliseconds: the middle start, and the slow end. */
  startupP50Ms: number | null;
  startupP95Ms: number | null;
  stalledSessions: number;
  stallCount: number;
  stallMs: number;
  playedSeconds: number;
  /** The share of the time spent waiting instead of watching, from 0 to 1. */
  rebufferRatio: number;
  bitrateKbps: number | null;
}

export type QualityGroup = QualityFigures & { key: string };
export type QualityDay = QualityFigures & { day: string };

export interface QualityError {
  code: string;
  sessions: number;
  beforeStart: number;
  message: string | null;
  lastAt: string;
}

export type QualitySubject = QualityFigures & {
  kind: 'title' | 'channel';
  id: string;
  name: string;
  type: TitleType | null;
};

export interface QualitySummary {
  recording: boolean;
  keptDays: number;
  totals: QualityFigures;
  previous: QualityFigures;
  days: QualityDay[];
  devices: QualityGroup[];
  servers: QualityGroup[];
  players: QualityGroup[];
  heights: { height: number; sessions: number; playedSeconds: number }[];
  errors: QualityError[];
  troubled: QualitySubject[];
  knownServers: string[];
}

export interface QualityFailure {
  id: string;
  startedAt: string;
  kind: 'VIDEO' | 'LIVE';
  subject: string | null;
  titleId: string | null;
  titleType: TitleType | null;
  channelId: string | null;
  device: PlayDevice;
  server: string;
  player: string | null;
  playerVersion: string | null;
  code: string;
  message: string | null;
  startupMs: number | null;
  atSeconds: number | null;
  playedSeconds: number;
}

export interface QualityRange {
  from: string;
  to: string;
  timezone: string;
  kind?: 'VIDEO' | 'LIVE';
  device?: PlayDevice;
  server?: string;
}
