// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { ageFromRating, describeAge, describeLimit, parseAge } from './age-rating';

describe('ageFromRating', () => {
  it('reads the number out of a rating', () => {
    expect(ageFromRating('FSK 12')).toBe(12);
    expect(ageFromRating('PG-13')).toBe(13);
    expect(ageFromRating('16')).toBe(16);
    expect(ageFromRating('0')).toBe(0);
  });

  it('knows the common ratings without a number', () => {
    expect(ageFromRating('G')).toBe(0);
    expect(ageFromRating(' tv-ma ')).toBe(17);
    expect(ageFromRating('PG')).toBe(8);
    expect(ageFromRating('R')).toBe(17);
  });

  it('reads nothing out of what it does not know', () => {
    for (const rating of [null, undefined, '', '  ', 'Livre', 'NR', '99']) {
      expect(ageFromRating(rating)).toBeNull();
    }
  });
});

describe('describeAge', () => {
  it('says an age the way a rating is said', () => {
    expect(describeAge(0)).toBe('All ages');
    expect(describeAge(12)).toBe('12+');
    expect(describeAge(null)).toBe('Not rated');
    expect(describeAge(undefined)).toBe('Not rated');
  });
});

describe('parseAge', () => {
  it('takes whole years up to 21, and empty for none', () => {
    expect(parseAge('0')).toBe(0);
    expect(parseAge(' 21 ')).toBe(21);
    expect(parseAge('')).toBeNull();
  });

  it('takes nothing else', () => {
    for (const text of ['22', '-1', '1.5', 'twelve', '123']) {
      expect(parseAge(text)).toBeUndefined();
    }
  });
});

describe('describeLimit', () => {
  it('says the limit of a profile, and nothing without one', () => {
    expect(describeLimit(12)).toBe('Up to 12');
    expect(describeLimit(0)).toBe('All ages only');
    expect(describeLimit(null)).toBeNull();
  });
});
