// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { mergeParams } from './address-params';

describe('mergeParams', () => {
  it('sets, replaces and keeps parameters', () => {
    expect(mergeParams('?status=DRAFT&page=3', { q: 'ocean', page: '1' })).toBe(
      'status=DRAFT&page=1&q=ocean',
    );
  });

  it('removes a parameter for null and for an empty text', () => {
    expect(mergeParams('?status=DRAFT&q=ocean&page=3', { q: '', page: null })).toBe('status=DRAFT');
  });

  it('accepts an empty address', () => {
    expect(mergeParams('', { q: 'a b' })).toBe('q=a+b');
    expect(mergeParams('', { q: null })).toBe('');
  });
});
