// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './client';
import type {
  Admin,
  Asset,
  AssetStatus,
  CreateAssetInput,
  CreatedAsset,
  Job,
  JobStatus,
  LoginResult,
  Me,
  Page,
  Playback,
  ReprocessInput,
} from './types';

export const authApi = {
  setupStatus: () => request<{ required: boolean }>('/v1/auth/setup'),
  setup: (body: { email: string; displayName: string; password: string }) =>
    request<Admin>('/v1/auth/setup', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    request<LoginResult>('/v1/auth/login', { method: 'POST', body }),
  logout: () => request<void>('/v1/auth/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => request<Me>('/v1/auth/me', { signal }),
};

export interface AssetListQuery {
  page: number;
  pageSize: number;
  status?: AssetStatus;
  q?: string;
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
