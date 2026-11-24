// SPDX-License-Identifier: AGPL-3.0-only
//
// The age a title or channel suits from. Profiles of viewers can have an age
// limit: they see what suits up to that age, and nothing nobody rated.

/** The highest age a title can be said to suit from. */
export const MAX_TITLE_AGE = 21;

/** Ratings without a number in them, by the age they stand for. Kept in step with the API. */
const WORDS: Record<string, number> = {
  G: 0,
  U: 0,
  E: 0,
  ALL: 0,
  L: 0,
  T: 0,
  TP: 0,
  A: 0,
  AL: 0,
  'TV-Y': 0,
  'TV-G': 0,
  PG: 8,
  'TV-PG': 8,
  R: 17,
  M: 17,
  MA: 17,
  'TV-MA': 17,
  X: 18,
  XXX: 18,
  AO: 18,
};

/**
 * The age a rating stands for, as the API reads it when a rating is saved
 * without an age: "FSK 12" is 12, "PG-13" is 13, "TV-MA" is 17, "G" is 0.
 *
 * @returns null for a rating that cannot be read.
 */
export function ageFromRating(rating: string | null | undefined): number | null {
  const text = rating?.trim().toUpperCase();
  if (!text) {
    return null;
  }
  const word = WORDS[text];
  if (word !== undefined) {
    return word;
  }
  const digits = /\d{1,2}/.exec(text)?.[0];
  if (!digits) {
    return null;
  }
  const age = Number(digits);
  return age <= MAX_TITLE_AGE ? age : null;
}

/** The ages offered with one click. Any other age from 0 to 21 can be typed. */
export const AGE_STEPS = [0, 6, 12, 16, 18] as const;

/** "All ages" for 0, "12+" for 12, "Not rated" for none. */
export function describeAge(minAge: number | null | undefined): string {
  if (minAge === null || minAge === undefined) {
    return 'Not rated';
  }
  return minAge === 0 ? 'All ages' : `${minAge}+`;
}

/** The age a field holds as text: a whole number from 0 to 21. Undefined for anything else. */
export function parseAge(text: string): number | null | undefined {
  const value = text.trim();
  if (!value) {
    return null;
  }
  if (!/^\d{1,2}$/.test(value) || Number(value) > MAX_TITLE_AGE) {
    return undefined;
  }
  return Number(value);
}

/** What a profile of a viewer may watch, in words: "Up to 12", "All ages only". Null for no limit. */
export function describeLimit(maxAge: number | null | undefined): string | null {
  if (maxAge === null || maxAge === undefined) {
    return null;
  }
  return maxAge === 0 ? 'All ages only' : `Up to ${maxAge}`;
}
