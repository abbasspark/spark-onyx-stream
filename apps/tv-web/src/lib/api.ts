// SPDX-License-Identifier: AGPL-3.0-only
import type { Schemas } from '@onyx/api-client';
import { clientName, deviceName, detectPlatform } from './platform';
import { installationId, storage } from './storage';

export const APP_VERSION = '0.1.0';

export type Home = Schemas['PublicHome'];
export type TitleCard = Schemas['PublicTitleCard'];
export type TitleDetail = Schemas['PublicTitleDetail'];
export type Episode = Schemas['PublicEpisode'];
export type Playback = Schemas['PlayAnswer'];
export type WatchingItem = Schemas['WatchingItem'];
export type DeviceCodeStart = Schemas['StartedDeviceCode'];
export type DeviceCodePoll = Schemas['DeviceCodePoll'];

/** What a call that went wrong says, for the screen to show. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

const platform = detectPlatform(navigator.userAgent);

/** Called when the server says the sign-in is no longer good. */
let onSignedOut: () => void = () => undefined;
export function whenSignedOut(callback: () => void): void {
  onSignedOut = callback;
}

export function token(): string | null {
  return storage.get('token');
}

async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  signed = true,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Onyx-Client': clientName(platform, APP_VERSION),
  };
  const kept = signed ? token() : null;
  if (kept) {
    headers.Authorization = `Bearer ${kept}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  let response: Response;
  try {
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    response = await fetch(`/v1/${path}`, init);
  } catch {
    throw new ApiError('The service could not be reached.', 0, null);
  }
  if (response.ok) {
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
  const failure = (await response.json().catch(() => null)) as {
    message?: string;
    code?: string;
  } | null;
  if (response.status === 401 && signed && kept) {
    storage.remove('token');
    onSignedOut();
  }
  throw new ApiError(
    failure?.message?.trim() || 'The server refused.',
    response.status,
    failure?.code ?? null,
  );
}

export const api = {
  home: () => call<Home>('GET', 'catalog/home'),
  title: (slug: string) => call<TitleDetail>('GET', `catalog/titles/${encodeURIComponent(slug)}`),
  watching: () => call<{ items: WatchingItem[] }>('GET', 'viewer/watching'),
  playTitle: (slug: string) =>
    call<Playback>('POST', `catalog/titles/${encodeURIComponent(slug)}/playback`),
  playEpisode: (id: string) => call<Playback>('POST', `catalog/episodes/${id}/playback`),
  startDeviceCode: () =>
    call<DeviceCodeStart>(
      'POST',
      'viewer/device-codes',
      {
        device: {
          installationId: installationId(),
          name: deviceName(platform),
          kind: 'TV',
          platform: platform === 'browser' ? 'tv-web' : platform,
          appVersion: APP_VERSION,
        },
      },
      false,
    ),
  pollDeviceCode: (deviceCode: string) =>
    call<DeviceCodePoll>('POST', 'viewer/device-codes/token', { deviceCode }, false),
  /** Says where the viewer is, in seconds. */
  reportPosition: (title: string, episodeId: string | null, position: number, duration: number) =>
    call<{ saved: number }>('PUT', 'viewer/watching', {
      items: [
        {
          title,
          ...(episodeId ? { episodeId } : {}),
          position,
          duration,
        },
      ],
    }),
};
