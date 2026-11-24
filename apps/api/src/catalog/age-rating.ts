// SPDX-License-Identifier: AGPL-3.0-only

/** The highest age a title can be said to suit from. */
export const MAX_TITLE_AGE = 21;
/** The highest limit a profile can have. Above it a limit means nothing. */
export const MAX_PROFILE_AGE = 18;
/** The limit a profile for a child starts with. */
export const KIDS_DEFAULT_AGE = 12;
/** What a sign-in sees until it chose a profile: only what suits every age. */
export const LOCKED_AGE = 0;

/** Ratings without a number in them, by the age they stand for. */
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
  // "Parental guidance" names no age. Eight is where most systems put their next step.
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
 * The age a rating stands for, as far as it can be read: "FSK 12" is 12,
 * "PG-13" is 13, "TV-MA" is 17, "G" is 0. Ratings differ by country and
 * there is no end to them, so this reads the number when there is one and
 * knows the common ones without.
 *
 * @returns null for a rating it cannot read. An admin then says the age.
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
