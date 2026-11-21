// SPDX-License-Identifier: AGPL-3.0-only
import { request, uploadFile } from './client';
import type {
  Admin,
  ApiKey,
  Asset,
  AssetMedia,
  AssetSortField,
  AssetStatus,
  AuditEntry,
  CatalogImage,
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
  ImageKind,
  Job,
  JobStatus,
  LoginResult,
  Me,
  OverviewStats,
  Page,
  Playback,
  PublishStatus,
  ReprocessInput,
  SortOrder,
  StoragePool,
  StoragePoolTestResult,
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
  ViewerWatching,
  ViewerSortField,
  ViewerStatus,
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
  q?: string;
  sort?: ViewerSortField;
  order?: SortOrder;
}

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
  categoryId?: string;
  q?: string;
  sort?: TitleSortField;
  order?: SortOrder;
}

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
    body: { number?: number; name?: string | null; synopsis?: string | null },
  ) => request<TitleDetail>(`/v1/seasons/${seasonId}`, { method: 'PATCH', body }),
  removeSeason: (seasonId: string) =>
    request<TitleDetail>(`/v1/seasons/${seasonId}`, { method: 'DELETE' }),

  createEpisode: (seasonId: string, body: EpisodeInput & { name: string }) =>
    request<Episode>(`/v1/seasons/${seasonId}/episodes`, { method: 'POST', body }),
  updateEpisode: (episodeId: string, body: EpisodeInput) =>
    request<Episode>(`/v1/episodes/${episodeId}`, { method: 'PATCH', body }),
  removeEpisode: (episodeId: string) =>
    request<TitleDetail>(`/v1/episodes/${episodeId}`, { method: 'DELETE' }),
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
