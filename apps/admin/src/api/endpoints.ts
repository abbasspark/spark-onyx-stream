// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './client';
import type {
  Admin,
  ApiKey,
  Asset,
  AssetSortField,
  AssetStatus,
  AuditEntry,
  CreateAdminInput,
  CreateApiKeyInput,
  CreateAssetInput,
  CreatedApiKey,
  CreatedAsset,
  CreateStoragePoolInput,
  EncodingProfile,
  EncodingProfileInput,
  Job,
  JobStatus,
  LoginResult,
  Me,
  OverviewStats,
  Page,
  Playback,
  ReprocessInput,
  SortOrder,
  StoragePool,
  StoragePoolTestResult,
  UpdateAdminInput,
  UpdateStoragePoolInput,
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
  adminId?: string;
}

export const auditApi = {
  list: (query: AuditQuery, signal?: AbortSignal) =>
    request<Page<AuditEntry>>('/v1/audit-logs', { query: { ...query }, signal }),
};

export const statsApi = {
  overview: (signal?: AbortSignal) => request<OverviewStats>('/v1/stats/overview', { signal }),
};
