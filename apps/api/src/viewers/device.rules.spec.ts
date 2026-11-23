// SPDX-License-Identifier: AGPL-3.0-only
import {
  formatUserCode,
  generateUserCode,
  normalizeUserCode,
  USER_CODE_ALPHABET,
  verificationUrls,
} from './device.rules.js';

describe('user codes', () => {
  it('are eight characters from the alphabet, different each time', () => {
    const codes = new Set(Array.from({ length: 200 }, generateUserCode));
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toHaveLength(8);
      expect([...code].every((letter) => USER_CODE_ALPHABET.includes(letter))).toBe(true);
    }
  });

  it('leave out vowels and what is mixed up at a distance', () => {
    for (const letter of 'AEIOU0125SBLZY8') {
      expect(USER_CODE_ALPHABET).not.toContain(letter);
    }
  });

  it('are shown in two groups', () => {
    expect(formatUserCode('CDFGHJKM')).toBe('CDFG-HJKM');
  });

  it('are read however they are typed', () => {
    expect(normalizeUserCode('cdfg-hjkm')).toBe('CDFGHJKM');
    expect(normalizeUserCode(' CDFG HJKM ')).toBe('CDFGHJKM');
    expect(normalizeUserCode('CDFGHJKM')).toBe('CDFGHJKM');
  });

  it('are not looked up when they cannot be one', () => {
    expect(normalizeUserCode('CDFG-HJK')).toBeNull();
    expect(normalizeUserCode('CDFG-HJKMN')).toBeNull();
    expect(normalizeUserCode('ABCD-EFGH')).toBeNull();
    expect(normalizeUserCode('')).toBeNull();
  });
});

describe('verificationUrls', () => {
  it('lead to the page of the site, once with the code filled in', () => {
    expect(verificationUrls('https://tv.example.com/', 'CDFGHJKM')).toEqual({
      url: 'https://tv.example.com/activate',
      complete: 'https://tv.example.com/activate?code=CDFG-HJKM',
    });
  });
});
