// SPDX-License-Identifier: AGPL-3.0-only
import { ageFromRating } from './age-rating.js';

describe('ageFromRating', () => {
  it('reads the number in a rating', () => {
    expect(ageFromRating('FSK 12')).toBe(12);
    expect(ageFromRating('PG-13')).toBe(13);
    expect(ageFromRating('TV-14')).toBe(14);
    expect(ageFromRating('TV-Y7')).toBe(7);
    expect(ageFromRating('NC-17')).toBe(17);
    expect(ageFromRating('12A')).toBe(12);
    expect(ageFromRating('16')).toBe(16);
    expect(ageFromRating('0')).toBe(0);
    expect(ageFromRating('MA15+')).toBe(15);
  });

  it('knows the common ratings without a number', () => {
    expect(ageFromRating('G')).toBe(0);
    expect(ageFromRating('u')).toBe(0);
    expect(ageFromRating(' TV-G ')).toBe(0);
    expect(ageFromRating('PG')).toBe(8);
    expect(ageFromRating('R')).toBe(17);
    expect(ageFromRating('TV-MA')).toBe(17);
    expect(ageFromRating('X')).toBe(18);
  });

  it('gives up on what it cannot read', () => {
    expect(ageFromRating(null)).toBeNull();
    expect(ageFromRating('')).toBeNull();
    expect(ageFromRating('Unrated')).toBeNull();
    expect(ageFromRating('NR')).toBeNull();
    // A year is not an age.
    expect(ageFromRating('99')).toBeNull();
  });
});
