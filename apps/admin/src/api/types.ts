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
  | 'viewers:read'
  | 'viewers:write'
  | 'billing:read'
  | 'billing:write'
  | 'live:read'
  | 'live:write'
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
  isFeatured: boolean;
  /** FREE, or PAID when watching needs a subscription. */
  access: TitleAccess;
  /** What renting and buying cost, in the smallest unit of the currency. Null: not on offer. */
  rentAmount: number | null;
  buyAmount: number | null;
  /** True when no subscription opens the title: it is rented or bought only. */
  purchaseOnly: boolean;
  poster: CatalogImage | null;
  categories: { id: string; name: string }[];
  /** The packages the title is in. Plans open a paid title through them. */
  packages: { id: string; name: string }[];
  asset: AssetRef | null;
  seasonCount: number;
  episodeCount: number;
  /** Whether viewers can see the title right now. False for a published title with nothing that plays. */
  isVisible: boolean;
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
}

/** Which parts an import brings. Left out, a part is brought. */
export interface MetadataParts {
  id: string;
  language?: string;
  text?: boolean;
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
  originalLanguage?: string | null;
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
  /** The plan the viewer watches through right now, if any. */
  plan: { id: string; name: string; endsAt: string | null } | null;
}

/** A device a viewer is signed in on. */
export interface ViewerSession {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
}

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
}

export interface ViewerDetail extends Viewer {
  /** The main profile first. */
  profiles: ViewerProfile[];
  sessions: ViewerSession[];
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
