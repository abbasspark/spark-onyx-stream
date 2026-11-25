// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  type AdPlan,
  fillErrorCode,
  fillPlayerMacros,
  pendingBreak,
  quartilesCrossed,
  reachedBreak,
  skipState,
} from './ads';

const plan: AdPlan = {
  breaks: [
    { id: 'pre-0', position: 'PRE', atMs: null, sourceId: 's' },
    { id: 'mid-600000', position: 'MID', atMs: 600_000, sourceId: 's' },
    { id: 'mid-1200000', position: 'MID', atMs: 1_200_000, sourceId: 's' },
    { id: 'post-0', position: 'POST', atMs: null, sourceId: 's' },
  ],
};

describe('pendingBreak', () => {
  it('finds the break before or after the video until it has played', () => {
    expect(pendingBreak(plan, 'PRE', new Set())?.id).toBe('pre-0');
    expect(pendingBreak(plan, 'PRE', new Set(['pre-0']))).toBeNull();
    expect(pendingBreak(plan, 'POST', new Set())?.id).toBe('post-0');
    expect(pendingBreak(null, 'PRE', new Set())).toBeNull();
  });
});

describe('reachedBreak', () => {
  it('finds the break the video just played into', () => {
    expect(reachedBreak(plan, new Set(), 599.6, 600.1)?.id).toBe('mid-600000');
    expect(reachedBreak(plan, new Set(), 100, 100.5)).toBeNull();
  });

  it('skips a break that played, and one that was jumped over', () => {
    expect(reachedBreak(plan, new Set(['mid-600000']), 599.6, 600.1)).toBeNull();
    // A seek from 5 minutes to 15: nobody is stopped for what they skipped.
    expect(reachedBreak(plan, new Set(), 300, 900)).toBeNull();
  });

  it('does not stop anyone who plays backwards', () => {
    expect(reachedBreak(plan, new Set(), 601, 599)).toBeNull();
  });
});

describe('quartilesCrossed', () => {
  it('names each quartile once, as playing passes it', () => {
    expect(quartilesCrossed(4000, 5100, 20_000).map((item) => item.tracked)).toEqual([
      'firstQuartile',
    ]);
    expect(quartilesCrossed(5100, 9000, 20_000)).toEqual([]);
    expect(quartilesCrossed(9000, 15_500, 20_000).map((item) => item.counted)).toEqual([
      'MIDPOINT',
      'THIRD_QUARTILE',
    ]);
  });

  it('has nothing for an ad of unknown length', () => {
    expect(quartilesCrossed(0, 5000, 0)).toEqual([]);
  });
});

describe('skipState', () => {
  it('counts down to the moment a viewer may skip', () => {
    expect(skipState(5000, 1200)).toEqual({ skippable: false, secondsLeft: 4 });
    expect(skipState(5000, 5000)).toEqual({ skippable: true, secondsLeft: 0 });
    expect(skipState(null, 99_000)).toEqual({ skippable: false, secondsLeft: 0 });
  });
});

describe('macros', () => {
  it('puts the error code and the play head where the address asks', () => {
    expect(fillErrorCode('https://e.example.com/?c=[ERRORCODE]', 405)).toBe(
      'https://e.example.com/?c=405',
    );
    expect(
      fillPlayerMacros('https://t.example.com/?p=[CONTENTPLAYHEAD]&r=[CACHEBUSTING]', {
        position: 12.3,
        random: 77,
      }),
    ).toBe('https://t.example.com/?p=12300&r=77');
  });
});
