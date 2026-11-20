// SPDX-License-Identifier: AGPL-3.0-only
//
// Shapes of the API's JSON answers. Dates arrive as ISO 8601 text.

export type AdminRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

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
  | 'settings:read'
  | 'settings:write';

export interface Admin {
  id: string;
  email: string;
  displayName: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The signed-in admin as returned by GET /v1/auth/me. */
export interface Me {
  type: 'admin';
  adminId: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: Permission[];
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  admin: Admin;
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
  'PROBE' | 'REMUX' | 'TRANSCODE' | 'PACKAGE' | 'THUMBNAILS' | 'SUBTITLES' | 'CLEANUP';

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
}

export interface UpdateAdminInput {
  displayName?: string;
  role?: AdminRole;
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
  subtitles: {
    id: string;
    language: string;
    label: string | null;
    source: 'EMBEDDED' | 'UPLOADED' | 'GENERATED';
    isDefault: boolean;
    isForced: boolean;
    url: string | null;
  }[];
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
export type ImageKind = 'POSTER' | 'BACKDROP' | 'STILL' | 'LOGO';

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
  isFeatured: boolean;
  poster: CatalogImage | null;
  categories: { id: string; name: string }[];
  asset: AssetRef | null;
  seasonCount: number;
  episodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Episode {
  id: string;
  seasonId: string;
  number: number;
  name: string;
  synopsis: string | null;
  status: PublishStatus;
  publishedAt: string | null;
  asset: AssetRef | null;
  still: CatalogImage | null;
}

export interface Season {
  id: string;
  number: number;
  name: string | null;
  synopsis: string | null;
  episodes: Episode[];
}

export interface TitleDetail extends TitleSummary {
  originalName: string | null;
  tagline: string | null;
  synopsis: string | null;
  ageRating: string | null;
  originalLanguage: string | null;
  backdrop: CatalogImage | null;
  logo: CatalogImage | null;
  trailerAsset: AssetRef | null;
  seasons: Season[];
  checklist: ChecklistItem[];
}

export interface UpdateTitleInput {
  name?: string;
  slug?: string;
  originalName?: string | null;
  tagline?: string | null;
  synopsis?: string | null;
  releaseYear?: number | null;
  ageRating?: string | null;
  originalLanguage?: string | null;
  isFeatured?: boolean;
  categoryIds?: string[];
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
] as const;
export type TitleSortField = (typeof TITLE_SORT_FIELDS)[number];

export interface EpisodeInput {
  number?: number;
  name?: string;
  synopsis?: string | null;
  assetId?: string | null;
  stillId?: string | null;
  status?: 'DRAFT' | 'PUBLISHED';
}
