// SPDX-License-Identifier: AGPL-3.0-only
import type { ViewerStream, ViewerStreams, ViewerWatchingItem } from '@/api/types';
import { formatDuration } from './format';

const BROWSERS: readonly (readonly [pattern: RegExp, name: string])[] = [
  // Order matters: most browsers also name the ones they are built on.
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\/|\bOpera\b/, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bChrome\/|\bCriOS\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [pattern: RegExp, name: string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b.*\bTV\b|\bSmart-?TV\b|\bTizen\b|\bWeb0S\b|\bwebOS\b/i, 'TV'],
  [/\bAndroid\b/, 'Android'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
  [/\bCrOS\b/, 'Chromebook'],
  [/\bLinux\b/, 'Linux'],
];

/**
 * A short name for a device from what its browser or app says about itself,
 * such as "Chrome on Windows". The full text is long and hard to read, and it
 * is only a claim: it helps to tell devices apart, not to prove anything.
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) {
    return 'Unknown device';
  }
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) {
    return `${browser} on ${system}`;
  }
  // An app or a script: its own name, the part before the version.
  return browser ?? system ?? (userAgent.split(/[/\s(]/)[0]?.slice(0, 40) || 'Unknown device');
}

/** Letters and digits that are not mistaken for each other when read or typed. */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Makes a random password to hand to a viewer, in groups that are easy to
 * read out: "kT7w-Zq3m-Xb9n-Rf4d".
 *
 * @param random Returns that many random bytes. A parameter so tests can fix the outcome.
 */
export function generatePassword(
  random: (count: number) => Uint8Array = (count) => crypto.getRandomValues(new Uint8Array(count)),
): string {
  const groups: string[] = [];
  let group = '';
  while (groups.length < 4) {
    for (const byte of random(32)) {
      // Bytes past the last full run of the alphabet would favour its first letters.
      if (byte >= 256 - (256 % PASSWORD_ALPHABET.length)) {
        continue;
      }
      group += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (group.length === 4) {
        groups.push(group);
        group = '';
        if (groups.length === 4) {
          break;
        }
      }
    }
  }
  return groups.join('-');
}

/** One or two letters for the round picture of a person without a photo. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0]];
  return letters
    .map((word) => [...(word ?? '')][0] ?? '')
    .join('')
    .toUpperCase();
}

export interface WatchingSummary {
  /** For an episode "S1 E3 The Trench", for a movie null. */
  episode: string | null;
  /** "Watched", "12:30 of 45:00", or for a finished video watched again "12:30 of 45:00, watched before". */
  state: string;
  /** How much of the video is behind the viewer, 0 to 100. */
  percent: number;
}

/** One video of a viewer's history in words. */
export function summarizeWatching(item: ViewerWatchingItem): WatchingSummary {
  const episode = item.episode
    ? `S${item.episode.seasonNumber} E${item.episode.number} ${item.episode.name}`
    : null;
  const finished = item.completedAt !== null;
  if (item.position <= 0) {
    return { episode, state: finished ? 'Watched' : 'Not started', percent: finished ? 100 : 0 };
  }
  const where = `${formatDuration(item.position * 1000)} of ${formatDuration(item.duration * 1000)}`;
  return {
    episode,
    state: finished ? `${where}, watched before` : where,
    percent:
      item.duration > 0 ? Math.min(100, Math.round((item.position / item.duration) * 100)) : 0,
  };
}

/** The colours of profiles, as the viewer website draws them. */
const PROFILE_COLORS: Record<string, string> = {
  amber: '#e6a85c',
  coral: '#e8785f',
  rose: '#dc7ba0',
  violet: '#a493e6',
  blue: '#74a8ea',
  teal: '#52b8aa',
  green: '#8dbd70',
  slate: '#a3abb5',
};

/** A colour this panel does not know yet is drawn as slate. */
export function profileColor(name: string): string {
  return PROFILE_COLORS[name] ?? (PROFILE_COLORS.slate as string);
}

const STREAM_DEVICES: Record<ViewerStream['device'], string> = {
  DESKTOP: 'Computer',
  MOBILE: 'Phone',
  TABLET: 'Tablet',
  TV: 'TV',
  OTHER: 'Device',
};

/** "Phone, Safari on iOS": the kind of device, and what it said it is. */
export function describeStreamDevice(stream: Pick<ViewerStream, 'device' | 'userAgent'>): string {
  const kind = STREAM_DEVICES[stream.device] ?? STREAM_DEVICES.OTHER;
  return stream.userAgent ? `${kind}, ${describeDevice(stream.userAgent)}` : kind;
}

/**
 * On how many devices a viewer may play at once, and where that comes from:
 * "Up to 2 devices at once, from the plan".
 */
export function describeStreamLimit(view: Pick<ViewerStreams, 'limit' | 'source'>): string {
  const from = {
    VIEWER: 'set for this viewer',
    PLAN: 'from the plan',
    SITE: 'the limit of the installation',
  }[view.source];
  if (view.limit === null) {
    return 'On any number of devices at once';
  }
  return `Up to ${view.limit} ${view.limit === 1 ? 'device' : 'devices'} at once, ${from}`;
}

/**
 * Reads the field for a number of devices. Empty is "not set".
 *
 * @returns The number, null for empty, or "invalid".
 */
export function parseStreamLimit(text: string): number | null | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return /^\d+$/.test(trimmed) && value >= 1 && value <= 20 ? value : 'invalid';
}
