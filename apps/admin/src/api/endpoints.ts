// SPDX-License-Identifier: AGPL-3.0-only
import { download, request, uploadFile } from './client';
import type {
  Credit,
  CreditInput,
  Genre,
  Person,
  PersonDetail,
  SeriesStatus,
  DiagnosticsReport,
  DiagnosticsSummary,
  Backup,
  BackupOverview,
  BackupSettings,
  DeliveryOverview,
  P2pStatus,
  EdgeInput,
  EdgeServer,
  EdgeTraffic,
  EdgeWithToken,
  PurgeScope,
  SharingTraffic,
  TrafficRange,
  Recording,
  RecordingInput,
  GuideImportResult,
  GuideSource,
  KnownGuideChannel,
  Programme,
  ProgrammeInput,
  EncoderSettings,
  Channel,
  ChannelDetails,
  ChannelInput,
  LivePlayback,
  SourceProbe,
  Admin,
  ApiKey,
  Asset,
  AssetMedia,
  AssetSortField,
  AssetStatus,
  AuditEntry,
  BillingOverview,
  Availability,
  CatalogImage,
  Collection,
  CollectionDetail,
  Extra,
  ExtraKind,
  SourceTranslation,
  Translation,
  TranslationInput,
  Category,
  CreateAdminInput,
  CreateApiKeyInput,
  CreateAssetInput,
  CreatedApiKey,
  CreatedAsset,
  CreateStoragePoolInput,
  CreateViewerInput,
  EncodingProfile,
  EncodingProfileInput,
  Episode,
  EpisodeInput,
  GrantPurchaseInput,
  GrantSubscriptionInput,
  ImageKind,
  ImportResult,
  Job,
  JobStatus,
  LoginResult,
  MailStatus,
  Me,
  MetadataParts,
  MetadataPreview,
  MetadataSearchResult,
  MetadataStatus,
  OverviewStats,
  Package,
  Page,
  Payment,
  PaymentListQuery,
  Plan,
  PlanInput,
  Playback,
  PublishStatus,
  Purchase,
  RecordPaymentInput,
  ReprocessInput,
  RevenueReport,
  SortOrder,
  StoragePool,
  StoragePoolTestResult,
  StripeAccount,
  StripeEvent,
  Subscription,
  TitleAccess,
  TitleDetail,
  TitleSortField,
  TitleSummary,
  TitleType,
  UpdateAdminInput,
  UpdateStoragePoolInput,
  UpdateTitleInput,
  UpdateViewerInput,
  Viewer,
  ViewerAccessConfig,
  ViewerDetail,
  ViewerSortField,
  ViewerStatus,
  ViewerSubscriptions,
  ViewerWatching,
} from './types';

export const authApi = {
  setupStatus: () => request<{ required: boolean }>('/v1/auth/setup'),
  setup: (body: { email: string; displayName: string; password: string }) =>
    request<Admin>('/v1/auth/setup', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    request<LoginResult>('/v1/auth/login', { method: 'POST', body }),
  logout: () => request<void>('/v1/auth/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => request<Me>('/v1/auth/me', { signal }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<void>('/v1/auth/password', { method: 'POST', body }),
};

export interface AssetListQuery {
  page: number;
  pageSize: number;
  status?: AssetStatus;
  q?: string;
  sort?: AssetSortField;
  order?: SortOrder;
}

export const assetsApi = {
  list: (query: AssetListQuery, signal?: AbortSignal) =>
    request<Page<Asset>>('/v1/assets', { query: { ...query }, signal }),
  get: (id: string, signal?: AbortSignal) => request<Asset>(`/v1/assets/${id}`, { signal }),
  media: (id: string, signal?: AbortSignal) =>
    request<AssetMedia>(`/v1/assets/${id}/media`, { signal }),
  create: (body: CreateAssetInput) => request<CreatedAsset>('/v1/assets', { method: 'POST', body }),
  rename: (id: string, title: string) =>
    request<Asset>(`/v1/assets/${id}`, { method: 'PATCH', body: { title } }),
  reprocess: (id: string, body: ReprocessInput) =>
    request<Asset>(`/v1/assets/${id}/reprocess`, { method: 'POST', body }),
  playback: (id: string) => request<Playback>(`/v1/assets/${id}/playback`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/v1/assets/${id}`, { method: 'DELETE' }),
};

export interface JobListQuery {
  page: number;
  pageSize: number;
  status?: JobStatus;
  assetId?: string;
}

export const jobsApi = {
  list: (query: JobListQuery, signal?: AbortSignal) =>
    request<Page<Job>>('/v1/jobs', { query: { ...query }, signal }),
  cancel: (id: string) => request<Job>(`/v1/jobs/${id}/cancel`, { method: 'POST' }),
  retry: (id: string) => request<Job>(`/v1/jobs/${id}/retry`, { method: 'POST' }),
};

export const profilesApi = {
  list: (signal?: AbortSignal) => request<EncodingProfile[]>('/v1/encoding-profiles', { signal }),
  create: (body: EncodingProfileInput) =>
    request<EncodingProfile>('/v1/encoding-profiles', { method: 'POST', body }),
  update: (
    id: string,
    body: Partial<Omit<EncodingProfileInput, 'description'>> & { description?: string | null },
  ) => request<EncodingProfile>(`/v1/encoding-profiles/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<void>(`/v1/encoding-profiles/${id}`, { method: 'DELETE' }),
};

export const storageApi = {
  list: (signal?: AbortSignal) => request<StoragePool[]>('/v1/storage-pools', { signal }),
  create: (body: CreateStoragePoolInput) =>
    request<StoragePool>('/v1/storage-pools', { method: 'POST', body }),
  update: (id: string, body: UpdateStoragePoolInput) =>
    request<StoragePool>(`/v1/storage-pools/${id}`, { method: 'PATCH', body }),
  test: (id: string) =>
    request<StoragePoolTestResult>(`/v1/storage-pools/${id}/test`, { method: 'POST' }),
};

export const adminsApi = {
  list: (query: { page: number; pageSize: number }, signal?: AbortSignal) =>
    request<Page<Admin>>('/v1/admins', { query, signal }),
  create: (body: CreateAdminInput) => request<Admin>('/v1/admins', { method: 'POST', body }),
  update: (id: string, body: UpdateAdminInput) =>
    request<Admin>(`/v1/admins/${id}`, { method: 'PATCH', body }),
};

export interface ViewerListQuery {
  page: number;
  pageSize: number;
  status?: ViewerStatus;
  /** Only viewers with ("yes") or without ("no") a running subscription. */
  subscribed?: 'yes' | 'no';
  q?: string;
  sort?: ViewerSortField;
  order?: SortOrder;
}

export const billingApi = {
  overview: (signal?: AbortSignal) => request<BillingOverview>('/v1/billing', { signal }),
  plans: (signal?: AbortSignal) => request<Plan[]>('/v1/plans', { signal }),
  createPlan: (body: PlanInput) => request<Plan>('/v1/plans', { method: 'POST', body }),
  updatePlan: (id: string, body: Partial<PlanInput>) =>
    request<Plan>(`/v1/plans/${id}`, { method: 'PATCH', body }),
  deletePlan: (id: string) => request<void>(`/v1/plans/${id}`, { method: 'DELETE' }),
  orderPlans: (ids: string[]) =>
    request<Plan[]>('/v1/plans/order', { method: 'PUT', body: { ids } }),
  subscriptionsOf: (viewerId: string, signal?: AbortSignal) =>
    request<ViewerSubscriptions>(`/v1/viewers/${viewerId}/subscriptions`, { signal }),
  grant: (viewerId: string, body: GrantSubscriptionInput) =>
    request<Subscription>(`/v1/viewers/${viewerId}/subscriptions`, { method: 'POST', body }),
  change: (id: string, body: Partial<GrantSubscriptionInput>) =>
    request<Subscription>(`/v1/subscriptions/${id}`, { method: 'PATCH', body }),
  end: (id: string) => request<Subscription>(`/v1/subscriptions/${id}/end`, { method: 'POST' }),
  /** Reads a subscription paid online from Stripe again. */
  refresh: (id: string) =>
    request<Subscription>(`/v1/subscriptions/${id}/refresh`, { method: 'POST' }),
  /** Asks Stripe which account the key belongs to. */
  checkStripe: () => request<StripeAccount>('/v1/billing/stripe/check', { method: 'POST' }),
  stripeEvents: (signal?: AbortSignal) =>
    request<StripeEvent[]>('/v1/billing/stripe/events', { signal }),
};

export const packagesApi = {
  list: (signal?: AbortSignal) => request<Package[]>('/v1/packages', { signal }),
  create: (body: { name: string; description: string | null }) =>
    request<Package>('/v1/packages', { method: 'POST', body }),
  update: (id: string, body: { name?: string; description?: string | null }) =>
    request<Package>(`/v1/packages/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<void>(`/v1/packages/${id}`, { method: 'DELETE' }),
  order: (ids: string[]) =>
    request<Package[]>('/v1/packages/order', { method: 'PUT', body: { ids } }),
  /** Puts titles into a package and takes titles out of it. */
  changeTitles: (id: string, body: { add?: string[]; remove?: string[] }) =>
    request<Package>(`/v1/packages/${id}/titles`, { method: 'PUT', body }),
};

export const purchasesApi = {
  ofViewer: (viewerId: string, signal?: AbortSignal) =>
    request<{ items: Purchase[] }>(`/v1/viewers/${viewerId}/purchases`, { signal }),
  /** Gives a viewer a title by hand. */
  grant: (viewerId: string, body: GrantPurchaseInput) =>
    request<Purchase>(`/v1/viewers/${viewerId}/purchases`, { method: 'POST', body }),
  revoke: (id: string) => request<Purchase>(`/v1/purchases/${id}/revoke`, { method: 'POST' }),
  /** The currency of all prices, which is public. For those who set prices without billing rights. */
  currency: async (signal?: AbortSignal) =>
    (await request<{ currency: string }>('/v1/catalog/plans', { signal })).currency,
};

export const paymentsApi = {
  revenue: (query: { months: number; timeZone: string }, signal?: AbortSignal) =>
    request<RevenueReport>('/v1/billing/revenue', { query, signal }),
  list: (query: PaymentListQuery, signal?: AbortSignal) =>
    request<Page<Payment>>('/v1/payments', { query: { ...query }, signal }),
  /** The payments as a CSV file, with the same filters as the list. */
  exportCsv: (query: Omit<PaymentListQuery, 'page' | 'pageSize'>) =>
    download('/v1/payments/export', { ...query }),
  ofViewer: (viewerId: string, signal?: AbortSignal) =>
    request<{ items: Payment[] }>(`/v1/viewers/${viewerId}/payments`, { signal }),
  record: (viewerId: string, body: RecordPaymentInput) =>
    request<Payment>(`/v1/viewers/${viewerId}/payments`, { method: 'POST', body }),
  remove: (id: string) => request<void>(`/v1/payments/${id}`, { method: 'DELETE' }),
  /** Reads the paid invoices from Stripe into the books. */
  importFromStripe: () =>
    request<{ checked: number; added: number; complete: boolean }>(
      '/v1/billing/stripe/import-payments',
      { method: 'POST' },
    ),
};

export const mailApi = {
  status: (signal?: AbortSignal) => request<MailStatus>('/v1/mail', { signal }),
  test: (to: string) => request<void>('/v1/mail/test', { method: 'POST', body: { to } }),
};

export const viewersApi = {
  list: (query: ViewerListQuery, signal?: AbortSignal) =>
    request<Page<Viewer>>('/v1/viewers', { query: { ...query }, signal }),
  get: (id: string, signal?: AbortSignal) => request<ViewerDetail>(`/v1/viewers/${id}`, { signal }),
  watching: (id: string, signal?: AbortSignal) =>
    request<ViewerWatching>(`/v1/viewers/${id}/watching`, { signal }),
  create: (body: CreateViewerInput) => request<Viewer>('/v1/viewers', { method: 'POST', body }),
  update: (id: string, body: UpdateViewerInput) =>
    request<Viewer>(`/v1/viewers/${id}`, { method: 'PATCH', body }),
  resetPassword: (id: string, newPassword: string) =>
    request<void>(`/v1/viewers/${id}/password`, { method: 'POST', body: { newPassword } }),
  sendPasswordEmail: (id: string) =>
    request<void>(`/v1/viewers/${id}/password-email`, { method: 'POST' }),
  sendVerificationEmail: (id: string) =>
    request<void>(`/v1/viewers/${id}/verification-email`, { method: 'POST' }),
  signOut: (id: string) =>
    request<{ sessionsEnded: number }>(`/v1/viewers/${id}/sign-out`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/v1/viewers/${id}`, { method: 'DELETE' }),
  /** What is open to the public. Needs no permission. */
  access: (signal?: AbortSignal) => request<ViewerAccessConfig>('/v1/viewer/config', { signal }),
};

export const apiKeysApi = {
  list: (signal?: AbortSignal) => request<ApiKey[]>('/v1/api-keys', { signal }),
  create: (body: CreateApiKeyInput) =>
    request<CreatedApiKey>('/v1/api-keys', { method: 'POST', body }),
  revoke: (id: string) => request<void>(`/v1/api-keys/${id}`, { method: 'DELETE' }),
};

export interface AuditQuery {
  page: number;
  pageSize: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  adminId?: string;
}

export const auditApi = {
  list: (query: AuditQuery, signal?: AbortSignal) =>
    request<Page<AuditEntry>>('/v1/audit-logs', { query: { ...query }, signal }),
};

export const statsApi = {
  overview: (signal?: AbortSignal) => request<OverviewStats>('/v1/stats/overview', { signal }),
};

export interface TitleListQuery {
  page: number;
  pageSize: number;
  type?: TitleType;
  status?: PublishStatus;
  access?: TitleAccess;
  categoryId?: string;
  genreId?: string;
  /** Titles this person has a part in. */
  personId?: string;
  seriesStatus?: SeriesStatus;
  /** "ready": the video is there. "missing": a movie without one, a series with an episode that lacks one. */
  video?: 'ready' | 'missing';
  collectionId?: string;
  availability?: Availability;
  packageId?: string;
  /** "none": paid titles in no package. */
  packaged?: 'none';
  q?: string;
  sort?: TitleSortField;
  order?: SortOrder;
}

export const metadataApi = {
  status: (signal?: AbortSignal) => request<MetadataStatus>('/v1/metadata', { signal }),
  search: (
    query: { type: TitleType; q: string; year?: number; language?: string },
    signal?: AbortSignal,
  ) => request<MetadataSearchResult[]>('/v1/metadata/search', { query: { ...query }, signal }),
  preview: (query: { id: string; language?: string; specials?: boolean }, signal?: AbortSignal) =>
    request<MetadataPreview>('/v1/metadata/preview', {
      query: {
        id: query.id,
        language: query.language,
        specials: query.specials ? 'true' : undefined,
      },
      signal,
    }),
  /** Creates a draft title from an entry at the source. */
  importNew: (body: MetadataParts & { allowDuplicate?: boolean }) =>
    request<ImportResult>('/v1/metadata/import', { method: 'POST', body }),
  /** Brings details of an entry into an existing title. */
  apply: (titleId: string, body: MetadataParts & { overwrite?: boolean }) =>
    request<ImportResult>(`/v1/titles/${titleId}/metadata`, { method: 'POST', body }),
};

export const titlesApi = {
  list: (query: TitleListQuery, signal?: AbortSignal) =>
    request<Page<TitleSummary>>('/v1/titles', { query: { ...query }, signal }),
  get: (id: string, signal?: AbortSignal) => request<TitleDetail>(`/v1/titles/${id}`, { signal }),
  create: (body: { type: TitleType; name: string }) =>
    request<TitleDetail>('/v1/titles', { method: 'POST', body }),
  update: (id: string, body: UpdateTitleInput) =>
    request<TitleDetail>(`/v1/titles/${id}`, { method: 'PATCH', body }),
  setStatus: (id: string, status: PublishStatus) =>
    request<TitleDetail>(`/v1/titles/${id}/status`, { method: 'PUT', body: { status } }),
  remove: (id: string) => request<void>(`/v1/titles/${id}`, { method: 'DELETE' }),

  createSeason: (titleId: string, body: { name?: string | null }) =>
    request<TitleDetail>(`/v1/titles/${titleId}/seasons`, { method: 'POST', body }),
  updateSeason: (
    seasonId: string,
    body: {
      number?: number;
      name?: string | null;
      synopsis?: string | null;
      airDate?: string | null;
      posterId?: string | null;
    },
  ) => request<TitleDetail>(`/v1/seasons/${seasonId}`, { method: 'PATCH', body }),
  removeSeason: (seasonId: string) =>
    request<TitleDetail>(`/v1/seasons/${seasonId}`, { method: 'DELETE' }),

  createEpisode: (seasonId: string, body: EpisodeInput & { name: string }) =>
    request<Episode>(`/v1/seasons/${seasonId}/episodes`, { method: 'POST', body }),
  updateEpisode: (episodeId: string, body: EpisodeInput) =>
    request<Episode>(`/v1/episodes/${episodeId}`, { method: 'PATCH', body }),
  removeEpisode: (episodeId: string) =>
    request<TitleDetail>(`/v1/episodes/${episodeId}`, { method: 'DELETE' }),

  /** Replaces the cast and crew of a title with the list given, in its order. */
  replaceCredits: (titleId: string, credits: CreditInput[]) =>
    request<Credit[]>(`/v1/titles/${titleId}/credits`, { method: 'PUT', body: { credits } }),
};

export const genresApi = {
  list: (signal?: AbortSignal) => request<Genre[]>('/v1/genres', { signal }),
  create: (body: { name: string }) => request<Genre>('/v1/genres', { method: 'POST', body }),
  update: (id: string, body: { name?: string; slug?: string }) =>
    request<Genre>(`/v1/genres/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<void>(`/v1/genres/${id}`, { method: 'DELETE' }),
};

export interface PeopleQuery {
  page: number;
  pageSize: number;
  q?: string;
  sort?: 'name' | 'createdAt' | 'credits';
  order?: SortOrder;
}

export const peopleApi = {
  list: (query: PeopleQuery, signal?: AbortSignal) =>
    request<Page<Person>>('/v1/people', { query: { ...query }, signal }),
  get: (id: string, signal?: AbortSignal) => request<PersonDetail>(`/v1/people/${id}`, { signal }),
  create: (body: { name: string; knownFor?: string | null }) =>
    request<Person>('/v1/people', { method: 'POST', body }),
  update: (
    id: string,
    body: {
      name?: string;
      slug?: string;
      knownFor?: string | null;
      biography?: string | null;
      portraitId?: string | null;
    },
  ) => request<Person>(`/v1/people/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<void>(`/v1/people/${id}`, { method: 'DELETE' }),
};

export const collectionsApi = {
  list: (signal?: AbortSignal) => request<Collection[]>('/v1/collections', { signal }),
  get: (id: string, signal?: AbortSignal) =>
    request<CollectionDetail>(`/v1/collections/${id}`, { signal }),
  create: (body: { name: string; synopsis?: string; visible?: boolean; titleIds?: string[] }) =>
    request<CollectionDetail>('/v1/collections', { method: 'POST', body }),
  update: (
    id: string,
    body: {
      name?: string;
      slug?: string;
      synopsis?: string;
      visible?: boolean;
      posterId?: string | null;
      backdropId?: string | null;
    },
  ) => request<CollectionDetail>(`/v1/collections/${id}`, { method: 'PATCH', body }),
  setTitles: (id: string, titleIds: string[]) =>
    request<CollectionDetail>(`/v1/collections/${id}/titles`, {
      method: 'PUT',
      body: { titleIds },
    }),
  reorder: (ids: string[]) =>
    request<Collection[]>('/v1/collections/order', { method: 'PUT', body: { ids } }),
  remove: (id: string) => request<void>(`/v1/collections/${id}`, { method: 'DELETE' }),
};

export const translationsApi = {
  list: (titleId: string, signal?: AbortSignal) =>
    request<Translation[]>(`/v1/titles/${titleId}/translations`, { signal }),
  save: (titleId: string, language: string, body: TranslationInput) =>
    request<Translation[]>(`/v1/titles/${titleId}/translations/${language}`, {
      method: 'PUT',
      body,
    }),
  remove: (titleId: string, language: string) =>
    request<void>(`/v1/titles/${titleId}/translations/${language}`, { method: 'DELETE' }),
  /** What the source says in this language. Changes nothing. */
  source: (titleId: string, language: string) =>
    request<SourceTranslation>(`/v1/titles/${titleId}/translations/${language}/source`),
  languages: (signal?: AbortSignal) =>
    request<{ language: string; titles: number }[]>('/v1/translations/languages', { signal }),
};

export const extrasApi = {
  add: (titleId: string, body: { kind: ExtraKind; name: string; assetId: string }) =>
    request<Extra[]>(`/v1/titles/${titleId}/extras`, { method: 'POST', body }),
  update: (id: string, body: { kind?: ExtraKind; name?: string }) =>
    request<Extra[]>(`/v1/extras/${id}`, { method: 'PATCH', body }),
  reorder: (titleId: string, ids: string[]) =>
    request<Extra[]>(`/v1/titles/${titleId}/extras/order`, { method: 'PUT', body: { ids } }),
  remove: (id: string) => request<void>(`/v1/extras/${id}`, { method: 'DELETE' }),
};

export const categoriesApi = {
  list: (signal?: AbortSignal) => request<Category[]>('/v1/categories', { signal }),
  create: (body: { name: string; description?: string | null }) =>
    request<Category>('/v1/categories', { method: 'POST', body }),
  update: (id: string, body: { name?: string; slug?: string; description?: string | null }) =>
    request<Category>(`/v1/categories/${id}`, { method: 'PATCH', body }),
  reorder: (ids: string[]) =>
    request<Category[]>('/v1/categories/order', { method: 'PUT', body: { ids } }),
  remove: (id: string) => request<void>(`/v1/categories/${id}`, { method: 'DELETE' }),
};

export const imagesApi = {
  upload: (kind: ImageKind, file: Blob) =>
    uploadFile<CatalogImage>(`/v1/images?kind=${kind}`, file),
  remove: (id: string) => request<void>(`/v1/images/${id}`, { method: 'DELETE' }),
};

export const channelsApi = {
  list: (signal?: AbortSignal) => request<Channel[]>('/v1/channels', { signal }),
  get: (id: string, signal?: AbortSignal) =>
    request<ChannelDetails>(`/v1/channels/${id}`, { signal }),
  /** The full address of the source, which may carry a password. */
  source: (id: string, signal?: AbortSignal) =>
    request<{ source: string }>(`/v1/channels/${id}/source`, { signal }),
  create: (body: ChannelInput) => request<Channel>('/v1/channels', { method: 'POST', body }),
  update: (id: string, body: Partial<ChannelInput>) =>
    request<Channel>(`/v1/channels/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => request<void>(`/v1/channels/${id}`, { method: 'DELETE' }),
  start: (id: string) => request<Channel>(`/v1/channels/${id}/start`, { method: 'POST' }),
  stop: (id: string) => request<Channel>(`/v1/channels/${id}/stop`, { method: 'POST' }),
  restart: (id: string) => request<Channel>(`/v1/channels/${id}/restart`, { method: 'POST' }),
  /** What to enter in an encoder, with the stream key. */
  encoder: (id: string, signal?: AbortSignal) =>
    request<EncoderSettings>(`/v1/channels/${id}/encoder`, { signal }),
  replaceStreamKey: (id: string) =>
    request<EncoderSettings>(`/v1/channels/${id}/stream-key`, { method: 'POST' }),
  /** Connects to a source and says what it carries. Takes up to 15 seconds. */
  probe: (source: string, signal?: AbortSignal) =>
    request<SourceProbe>('/v1/channels/probe', { method: 'POST', body: { source }, signal }),
  playback: (id: string, signal?: AbortSignal) =>
    request<LivePlayback>(`/v1/channels/${id}/playback`, { method: 'POST', signal }),
};

export const guideApi = {
  sources: (signal?: AbortSignal) => request<GuideSource[]>('/v1/guide/sources', { signal }),
  /** The full address of a source, which may carry a token. */
  sourceUrl: (id: string, signal?: AbortSignal) =>
    request<{ url: string }>(`/v1/guide/sources/${id}/url`, { signal }),
  createSource: (body: { name: string; url: string; enabled: boolean }) =>
    request<GuideSource>('/v1/guide/sources', { method: 'POST', body }),
  updateSource: (id: string, body: { name?: string; url?: string; enabled?: boolean }) =>
    request<GuideSource>(`/v1/guide/sources/${id}`, { method: 'PATCH', body }),
  removeSource: (id: string) => request<void>(`/v1/guide/sources/${id}`, { method: 'DELETE' }),
  /** Fetches and reads the file now. Answers when it is done, which can take a minute. */
  importSource: (id: string) =>
    request<GuideImportResult>(`/v1/guide/sources/${id}/import`, { method: 'POST' }),
  known: (q: string, signal?: AbortSignal) =>
    request<KnownGuideChannel[]>(`/v1/guide/channels?q=${encodeURIComponent(q)}`, { signal }),
  programmes: (channelId: string, from: string, to: string, signal?: AbortSignal) =>
    request<Programme[]>(
      `/v1/channels/${channelId}/programmes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { signal },
    ),
  createProgramme: (channelId: string, body: ProgrammeInput) =>
    request<Programme>(`/v1/channels/${channelId}/programmes`, { method: 'POST', body }),
  updateProgramme: (id: string, body: Partial<ProgrammeInput>) =>
    request<Programme>(`/v1/programmes/${id}`, { method: 'PATCH', body }),
  removeProgramme: (id: string) => request<void>(`/v1/programmes/${id}`, { method: 'DELETE' }),
};

export const recordingsApi = {
  list: (show: 'all' | 'open' | 'finished', page: number, signal?: AbortSignal) =>
    request<Page<Recording>>(`/v1/recordings?show=${show}&page=${page}&pageSize=25`, { signal }),
  create: (body: RecordingInput) => request<Recording>('/v1/recordings', { method: 'POST', body }),
  /** Records a programme of the guide. */
  recordProgramme: (programmeId: string) =>
    request<Recording>(`/v1/programmes/${programmeId}/record`, { method: 'POST' }),
  /** Calls a waiting recording off, or stops a running one and keeps what it has. */
  stop: (id: string) => request<Recording>(`/v1/recordings/${id}/stop`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/v1/recordings/${id}`, { method: 'DELETE' }),
};

export const edgesApi = {
  list: (signal?: AbortSignal) => request<EdgeServer[]>('/v1/edges', { signal }),
  create: (body: EdgeInput) => request<EdgeWithToken>('/v1/edges', { method: 'POST', body }),
  update: (id: string, body: Partial<EdgeInput>) =>
    request<EdgeServer>(`/v1/edges/${id}`, { method: 'PATCH', body }),
  /** Replaces the token of the agent. The old one stops working at once. */
  replaceToken: (id: string) => request<EdgeWithToken>(`/v1/edges/${id}/token`, { method: 'POST' }),
  /** Asks the agent to drop its copies. It does so with its next report. */
  purge: (id: string, scope: PurgeScope) =>
    request<EdgeServer>(`/v1/edges/${id}/purge`, { method: 'POST', body: { scope } }),
  traffic: (range: TrafficRange, signal?: AbortSignal) =>
    request<EdgeTraffic>(`/v1/edges/traffic?range=${range}`, { signal }),
  /** Who delivered what: main server, edges and viewers together. */
  overview: (range: TrafficRange, signal?: AbortSignal) =>
    request<DeliveryOverview>(`/v1/edges/overview?range=${range}`, { signal }),
  remove: (id: string) => request<void>(`/v1/edges/${id}`, { method: 'DELETE' }),
};

export const p2pApi = {
  /** Whether P2P is on, and how the tracker is doing. */
  status: (signal?: AbortSignal) => request<P2pStatus>('/v1/p2p', { signal }),
  /** How much of what viewers played came from other viewers. */
  traffic: (range: TrafficRange, signal?: AbortSignal) =>
    request<SharingTraffic>(`/v1/p2p/traffic?range=${range}`, { signal }),
};

export const backupsApi = {
  /** The settings, how well the installation is protected, and the backups there are. */
  overview: (signal?: AbortSignal) => request<BackupOverview>('/v1/backups', { signal }),
  /** Asks for a backup now. It is made within about twenty seconds. */
  create: () => request<Backup>('/v1/backups', { method: 'POST' }),
  saveSettings: (body: BackupSettings) =>
    request<BackupSettings>('/v1/backups/settings', { method: 'PUT', body }),
  /** A link that downloads the file. It works for a minute and needs no sign-in. */
  downloadLink: (id: string) =>
    request<{ path: string; expiresAt: string }>(`/v1/backups/${id}/download`, { method: 'POST' }),
  remove: (id: string) => request<void>(`/v1/backups/${id}`, { method: 'DELETE' }),
};

export const diagnosticsApi = {
  /** Looks at every part of the installation now. Takes a second or two. */
  report: (signal?: AbortSignal) => request<DiagnosticsReport>('/v1/diagnostics', { signal }),
  /** What the last look found, without looking again. */
  summary: (signal?: AbortSignal) =>
    request<{ summary: DiagnosticsSummary | null }>('/v1/diagnostics/summary', { signal }),
  saveSettings: (body: { emailAlerts: boolean }) =>
    request<{ emailAlerts: boolean }>('/v1/diagnostics/settings', { method: 'PUT', body }),
};
