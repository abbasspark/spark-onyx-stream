// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  audienceCookie,
  audienceFromCookies,
  describeLimit,
  isPin,
  limitOf,
  readAudience,
  withAudience,
} from './audience';

describe('readAudience', () => {
  it('takes whole years from 0 to 18', () => {
    expect(readAudience('0')).toBe(0);
    expect(readAudience(' 12 ')).toBe(12);
    expect(readAudience('18')).toBe(18);
  });

  it('takes nothing else for a limit', () => {
    for (const value of [undefined, null, '', '19', '-1', '1.5', 'twelve', '120']) {
      expect(readAudience(value)).toBeUndefined();
    }
  });
});

describe('audienceFromCookies', () => {
  it('finds the limit among other cookies', () => {
    expect(audienceFromCookies('onyx_language=de; onyx_audience=12; other=1')).toBe(12);
    expect(audienceFromCookies('onyx_audience=0')).toBe(0);
  });

  it('finds none without the cookie, or with one that is no limit', () => {
    expect(audienceFromCookies('')).toBeUndefined();
    expect(audienceFromCookies('onyx_language=de')).toBeUndefined();
    expect(audienceFromCookies('onyx_audience=all')).toBeUndefined();
    expect(audienceFromCookies('not_onyx_audience=12')).toBeUndefined();
  });
});

describe('withAudience', () => {
  it('adds the limit to an address, also to one that has a question already', () => {
    expect(withAudience('/home', 12)).toBe('/home?maxAge=12');
    expect(withAudience('/titles?sort=name', 0)).toBe('/titles?sort=name&maxAge=0');
  });

  it('leaves the address alone without a limit', () => {
    expect(withAudience('/home', undefined)).toBe('/home');
  });
});

describe('audienceCookie', () => {
  it('remembers a limit for the whole site, and forgets it', () => {
    expect(audienceCookie(12)).toMatch(/^onyx_audience=12; Path=\/; Max-Age=\d+; SameSite=Lax$/);
    expect(audienceCookie(0)).toContain('onyx_audience=0;');
    expect(audienceCookie(null)).toBe('onyx_audience=; Path=/; Max-Age=0; SameSite=Lax');
  });

  it('writes what it reads', () => {
    expect(audienceFromCookies(audienceCookie(16).split(';')[0] as string)).toBe(16);
  });
});

describe('limitOf', () => {
  it('is none for a visitor and for a profile without a limit', () => {
    expect(limitOf({ profile: null })).toBeNull();
    expect(limitOf({ profile: { maxAge: null } })).toBeNull();
    // An API from before limits says nothing about them.
    expect(limitOf({ profile: {} })).toBeNull();
  });

  it('is the limit of the profile', () => {
    expect(limitOf({ profile: { maxAge: 12 } })).toBe(12);
    expect(limitOf({ profile: { maxAge: 0 } })).toBe(0);
  });

  it('is the strictest while a profile still has to be chosen', () => {
    expect(limitOf({ chooseProfile: true, profile: { maxAge: null } })).toBe(0);
  });
});

describe('describeLimit', () => {
  it('says a limit in words', () => {
    expect(describeLimit(12)).toBe('Up to 12');
    expect(describeLimit(0)).toBe('All ages only');
    expect(describeLimit(null)).toBeNull();
    expect(describeLimit(undefined)).toBeNull();
  });
});

describe('isPin', () => {
  it('takes four to six digits', () => {
    expect(isPin('1234')).toBe(true);
    expect(isPin('123456')).toBe(true);
    for (const value of ['', '123', '1234567', '12a4', ' 1234']) {
      expect(isPin(value)).toBe(false);
    }
  });
});
