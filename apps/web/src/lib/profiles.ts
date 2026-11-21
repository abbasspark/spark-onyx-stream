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
  create: (input: { name: string; color?: string }) => call<Profile>('POST', '/profiles', input),
  update: (id: string, input: { name?: string; color?: string }) =>
    call<Profile>('PATCH', `/profiles/${id}`, input),
  remove: (id: string) => call<void>('DELETE', `/profiles/${id}`),
  /** Chooses who is watching on this device. */
  select: (id: string) => call<Profile>('POST', `/profiles/${id}/select`),
};
