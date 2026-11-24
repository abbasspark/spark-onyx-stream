// SPDX-License-Identifier: AGPL-3.0-only
//
// Profiles: the people who share an account, each with their own history.
import { call } from './viewer-api';

export interface Profile {
  id: string;
  name: string;
  /** Name of a colour, such as "amber". See PROFILE_COLORS. */
  color: string;
  /** The profile the account started with. It cannot be deleted. */
  isMain: boolean;
  /** A profile for a child. An API from before parental controls leaves these three out. */
  isKids?: boolean;
  /** The oldest age rating this profile sees. Null is everything. */
  maxAge?: number | null;
  /** Whether choosing this profile asks for its PIN. */
  locked?: boolean;
  /** The language this profile likes to hear, such as "de". Null or missing: each video in its own. */
  audioLanguage?: string | null;
  /** The language this profile reads subtitles in. Null or missing: subtitles are off. */
  subtitleLanguage?: string | null;
}

/** What a profile likes to hear and to read. */
export interface PlaybackPreferences {
  audioLanguage: string | null;
  subtitleLanguage: string | null;
}

/** What can be said about a profile when it is added or changed. */
export interface ProfileInput {
  name?: string;
  color?: string;
  isKids?: boolean;
  maxAge?: number | null;
  audioLanguage?: string | null;
  subtitleLanguage?: string | null;
}

export interface Profiles {
  profiles: Profile[];
  /** The profile in use on this device. */
  currentId: string;
  /** How many profiles an account can have. */
  limit: number;
  /** The colours a profile can have. */
  colors: string[];
}

/**
 * What each colour of the API looks like on this site. The first is the
 * amber of the site itself; the others are as strong, so the letter on them
 * reads the same on all.
 */
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

/** A colour the API may add later is drawn as slate until this site knows it. */
export function colorOf(name: string): string {
  return PROFILE_COLORS[name] ?? (PROFILE_COLORS.slate as string);
}

/** What a colour is called for someone who cannot see it. */
export function colorLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The letter drawn on a profile: the first of its name, whatever the script. */
export function initialOf(name: string): string {
  return ([...name.trim()][0] ?? '?').toUpperCase();
}

export const profilesApi = {
  list: () => call<Profiles>('GET', '/profiles'),
  create: (input: ProfileInput & { name: string }) => call<Profile>('POST', '/profiles', input),
  update: (id: string, input: ProfileInput) => call<Profile>('PATCH', `/profiles/${id}`, input),
  remove: (id: string) => call<void>('DELETE', `/profiles/${id}`),
  /**
   * Chooses who is watching on this device. A profile with a PIN needs it:
   * the error then carries the code "pin_required", "pin_wrong" or "pin_locked".
   */
  select: (id: string, pin?: string) =>
    call<Profile>('POST', `/profiles/${id}/select`, pin ? { pin } : {}),
  /**
   * Remembers what the profile in use chose in the player, so the next
   * video starts the same way on every device.
   */
  setPreferences: (input: Partial<PlaybackPreferences>) =>
    call<PlaybackPreferences>('PATCH', '/preferences', input),
  /** Puts a PIN on a profile, or takes it off with null. Asks for the account's password. */
  setPin: (id: string, pin: string | null, password: string) =>
    call<Profile>('PUT', `/profiles/${id}/pin`, { pin, password }),
};
