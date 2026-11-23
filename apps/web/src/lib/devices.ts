// SPDX-License-Identifier: AGPL-3.0-only
//
// Signing a television in with a code, and the devices of an account.
// The types come from the description of the API.
import type { Schemas } from '@onyx/api-client';
import { call } from './viewer-api';

/** The device behind a code, as the viewer sees it before they answer. */
export type DeviceCodeRequest = Schemas['DeviceCodeRequest'];
export type DeviceKind = DeviceCodeRequest['device']['kind'];
/** The app a sign-in belongs to. */
export type DeviceRef = Schemas['DeviceRef'];

/** The characters a code is made of: no vowels, and nothing that looks like something else. */
const CODE_ALPHABET = 'CDFGHJKMNPQRTVWX34679';
const CODE_LENGTH = 8;

/**
 * What was typed, as the field shows it: capitals, a hyphen in the middle,
 * and nothing that cannot be part of a code. Pasting "cdfg hjkm" works.
 */
export function formatCodeInput(text: string): string {
  const letters = [...text.toUpperCase()]
    .filter((letter) => CODE_ALPHABET.includes(letter))
    .slice(0, CODE_LENGTH)
    .join('');
  return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
}

export function isCompleteCode(text: string): boolean {
  return formatCodeInput(text).length === CODE_LENGTH + 1;
}

const KINDS: Record<DeviceKind, string> = {
  TV: 'Television',
  MOBILE: 'Phone',
  TABLET: 'Tablet',
  DESKTOP: 'Computer',
  OTHER: 'Device',
};

/** The apps a platform name stands for, for people. */
const PLATFORMS: Record<string, string> = {
  'android-tv': 'Android TV',
  android: 'Android',
  'fire-tv': 'Fire TV',
  ios: 'iOS',
  tvos: 'Apple TV',
  tizen: 'Samsung TV',
  webos: 'LG TV',
  roku: 'Roku',
};

export function kindLabel(kind: DeviceKind): string {
  return KINDS[kind] ?? KINDS.OTHER;
}

/** "Television, Android TV, Chromecast with Google TV": what a device is, without its name. */
export function describeKind(device: {
  kind: DeviceKind;
  platform: string;
  model?: string | null;
}): string {
  const platform = PLATFORMS[device.platform] ?? device.platform;
  // "Television, Android TV" says it twice only in words, so both stay; a model that repeats the platform goes.
  const parts = [kindLabel(device.kind), platform];
  if (device.model && !device.model.toLowerCase().includes(platform.toLowerCase())) {
    parts.push(device.model);
  }
  return parts.join(', ');
}

/** "a moment ago", "3 minutes ago": how long a device has been waiting. */
export function askedAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) {
    return 'a moment ago';
  }
  return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`;
}

export const devicesApi = {
  /** The device that shows a code. Fails with 404 for a code that is wrong or over. */
  find: (code: string) =>
    call<DeviceCodeRequest>('GET', `/device-codes/${encodeURIComponent(code)}`),
  approve: (code: string) =>
    call<DeviceCodeRequest>('POST', `/device-codes/${encodeURIComponent(code)}/approve`),
  deny: (code: string) =>
    call<DeviceCodeRequest>('POST', `/device-codes/${encodeURIComponent(code)}/deny`),
  rename: (id: string, name: string) =>
    call<{ id: string; name: string }>('PATCH', `/devices/${id}`, { name }),
};
