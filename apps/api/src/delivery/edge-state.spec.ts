// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { isFull } from './edge-state.js';

describe('an edge at its bandwidth limit', () => {
  it('is never full without a limit', () => {
    expect(isFull(10_000_000_000, null)).toBe(false);
  });

  it('is not full before it has reported anything', () => {
    expect(isFull(null, 100)).toBe(false);
  });

  it('is full from 90 % of the limit on', () => {
    // 100 Mbit/s is 100,000,000 bit/s.
    expect(isFull(89_000_000, 100)).toBe(false);
    expect(isFull(90_000_000, 100)).toBe(true);
    expect(isFull(250_000_000, 100)).toBe(true);
  });
});
