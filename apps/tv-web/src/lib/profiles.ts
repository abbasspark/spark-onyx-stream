// SPDX-License-Identifier: AGPL-3.0-only
import { storage } from './storage';

/** What a profile as the API gives it looks like to this app. */
export interface ProfileLike {
  id: string;
  name: string;
  color: string;
  locked: boolean;
}

/** What each colour of the API looks like. The same as on the website. */
export const PROFILE_COLORS: Record<string, string> = {
  amber: '#e6a85c',
  coral: '#e8785f',
  rose: '#dc7ba0',
  violet: '#a493e6',
  blue: '#74a8ea',
  teal: '#52b8aa',
  green: '#8dbd70',
  slate: '#a3abb5',
};

/** A colour the API may add later is drawn as slate until this app knows it. */
export function colorOf(name: string): string {
  return PROFILE_COLORS[name] ?? (PROFILE_COLORS.slate as string);
}

/** The letter in a profile's circle. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** One profile without a PIN is not a question worth asking: it is taken. */
export function onlyChoice<P extends ProfileLike>(profiles: readonly P[]): P | null {
  const [only] = profiles;
  return profiles.length === 1 && only && !only.locked ? only : null;
}

/** The profile this device chose, kept so that a restart does not ask again. */
export function chosenProfile(): { id: string; name: string } | null {
  const kept = storage.get('profile');
  if (!kept) {
    return null;
  }
  try {
    const parsed = JSON.parse(kept) as { id?: unknown; name?: unknown };
    return typeof parsed.id === 'string' && typeof parsed.name === 'string'
      ? { id: parsed.id, name: parsed.name }
      : null;
  } catch {
    return null;
  }
}

export function rememberProfile(profile: { id: string; name: string }): void {
  storage.set('profile', JSON.stringify({ id: profile.id, name: profile.name }));
}

export function forgetProfile(): void {
  storage.remove('profile');
}
