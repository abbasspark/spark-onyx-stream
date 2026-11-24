// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { errorCodeOf, errorWordsOf } from './use-quality';

describe('errorCodeOf', () => {
  it('names what a streaming library reports by a short word', () => {
    expect(errorCodeOf({ type: 'networkError', details: 'fragLoadError' })).toBe('network');
    expect(errorCodeOf({ type: 'networkError', details: 'manifestLoadTimeOut' })).toBe('timeout');
    expect(errorCodeOf({ type: 'mediaError', details: 'bufferAppendError' })).toBe('media');
    expect(errorCodeOf({ type: 'keySystemError', details: 'keySystemNoKeys' })).toBe('key');
    expect(errorCodeOf({ type: 'networkError', details: 'keyLoadError' })).toBe('key');
    expect(errorCodeOf({ type: 'otherError', details: 'internalException' })).toBe('other');
    expect(errorCodeOf({})).toBe('other');
  });

  it('reads a refused address as one that ran out', () => {
    for (const code of [401, 403, 410]) {
      expect(
        errorCodeOf({ type: 'networkError', details: 'fragLoadError', response: { code } }),
      ).toBe('expired');
    }
    expect(
      errorCodeOf({ type: 'networkError', details: 'fragLoadError', response: { code: 404 } }),
    ).toBe('network');
  });
});

describe('errorWordsOf', () => {
  it('says what failed and how the server answered, without an address', () => {
    expect(errorWordsOf({ details: 'fragLoadError', response: { code: 404 } })).toBe(
      'fragLoadError (404)',
    );
    expect(errorWordsOf({ details: 'bufferStalledError' })).toBe('bufferStalledError');
    expect(errorWordsOf({})).toBe('error');
  });
});
