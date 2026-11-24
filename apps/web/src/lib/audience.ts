// SPDX-License-Identifier: AGPL-3.0-only
//
// Who the pages of this browser are for: a profile with an age limit sees a
// smaller catalog.
//
// The API holds the limit that counts: it reads it from the sign-in, and no
// request can talk it into playing more. The cookie here only tells the
// server of the website which catalog to draw the pages from, so that a
// child's profile is not shown cards it cannot open.

/** The cookie that carries the age limit of the profile in use. */
export const AUDIENCE_COOKIE = 'onyx_audience';

/** The highest limit there is. Above it a limit means nothing. */
export const MAX_AUDIENCE_AGE = 18;

/** A sign-in that still has to choose a profile sees what suits every age. */
export const LOCKED_AGE = 0;

/** A year: long enough for a television that is rarely signed in again. */
const KEEP_SECONDS = 60 * 60 * 24 * 365;

/** A limit as the catalog knows it: whole years from 0 to 18. Anything else is none. */
export function readAudience(value: string | undefined | null): number | undefined {
  const text = value?.trim();
  if (!text || !/^\d{1,2}$/.test(text)) {
    return undefined;
  }
  const age = Number(text);
  return age <= MAX_AUDIENCE_AGE ? age : undefined;
}

/** Reads the limit out of the text of `document.cookie`. */
export function audienceFromCookies(cookies: string): number | undefined {
  for (const part of cookies.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === AUDIENCE_COOKIE) {
      return readAudience(rest.join('='));
    }
  }
  return undefined;
}

/** Adds the limit to an address of the catalog. Without one the address stays as it is. */
export function withAudience(path: string, maxAge: number | undefined): string {
  if (maxAge === undefined) {
    return path;
  }
  return `${path}${path.includes('?') ? '&' : '?'}maxAge=${maxAge}`;
}

/** What to assign to `document.cookie` to remember a limit, or to forget it with null. */
export function audienceCookie(maxAge: number | null): string {
  return maxAge === null
    ? `${AUDIENCE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
    : `${AUDIENCE_COOKIE}=${maxAge}; Path=/; Max-Age=${KEEP_SECONDS}; SameSite=Lax`;
}

/**
 * The limit in force for a sign-in.
 *
 * @returns Null when everything may be seen: a visitor, or a profile without a limit.
 */
export function limitOf(session: {
  chooseProfile?: boolean;
  profile: { maxAge?: number | null } | null;
}): number | null {
  if (!session.profile) {
    return null;
  }
  if (session.chooseProfile) {
    return LOCKED_AGE;
  }
  return session.profile.maxAge ?? null;
}

export interface AgeChoice {
  /** Null is no limit. */
  value: number | null;
  label: string;
  hint: string;
}

/** The limits a profile is offered. The API takes any age from 0 to 18. */
export const AGE_CHOICES: readonly AgeChoice[] = [
  { value: null, label: 'Everything', hint: 'No limit' },
  { value: 16, label: 'Up to 16', hint: 'Older teenagers' },
  { value: 12, label: 'Up to 12', hint: 'Children' },
  { value: 6, label: 'Up to 6', hint: 'Small children' },
  { value: 0, label: 'All ages only', hint: 'Rated for everyone' },
];

/** "Up to 12" for a limit, as said next to a profile. Null for none. */
export function describeLimit(maxAge: number | null | undefined): string | null {
  if (maxAge === null || maxAge === undefined) {
    return null;
  }
  return maxAge === 0 ? 'All ages only' : `Up to ${maxAge}`;
}

/** A PIN as the API takes it: four to six digits. */
export function isPin(value: string): boolean {
  return /^\d{4,6}$/.test(value);
}
