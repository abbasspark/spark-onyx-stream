// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
// @ts-expect-error The script is plain JavaScript.
import { fill, serverAddress, tizenIds } from './package.mjs';

describe('serverAddress', () => {
  it('takes an origin and drops a trailing slash', () => {
    expect(serverAddress('https://tv.example.com/')).toBe('https://tv.example.com');
    expect(serverAddress('')).toBe('');
  });
  it('refuses what is not an origin', () => {
    expect(() => serverAddress('tv.example.com')).toThrow();
    expect(() => serverAddress('https://tv.example.com/app')).toThrow();
  });
});

describe('tizenIds', () => {
  it('makes a ten character package id', () => {
    expect(tizenIds('de.example.onyxstream').packageId).toMatch(/^[a-z0-9]{10}$/);
  });
  it('gives the same ids for the same id, and different ones for another', () => {
    expect(tizenIds('de.example.a')).toEqual(tizenIds('de.example.a'));
    expect(tizenIds('de.example.a').packageId).not.toBe(tizenIds('de.example.b').packageId);
  });
});

describe('fill', () => {
  it('replaces every mark', () => {
    expect(fill('__A__ and __A__ and __B__', { A: '1', B: '2' })).toBe('1 and 1 and 2');
  });
});
