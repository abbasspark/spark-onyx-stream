// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { clampWatchedAt, judgePosition } from './watch-rules.js';

describe('judgePosition', () => {
  it('counts a video as watched from where its credits begin, when that is known', () => {
    // The credits of an hour begin at 52 minutes, long before 95 percent.
    expect(judgePosition(3100, 3600, 3120)).toMatchObject({ kind: 'in-progress' });
    expect(judgePosition(3120, 3600, 3120)).toEqual({ kind: 'finished', durationSeconds: 3600 });
    // Without credits, and before them, the usual rule holds.
    expect(judgePosition(3120, 3600)).toMatchObject({ kind: 'in-progress' });
    expect(judgePosition(3500, 3600, 3590)).toEqual({ kind: 'finished', durationSeconds: 3600 });
  });

  it('does not count the first seconds', () => {
    expect(judgePosition(0, 3600)).toEqual({ kind: 'not-started' });
    expect(judgePosition(14.9, 3600)).toEqual({ kind: 'not-started' });
  });

  it('remembers a position in the middle in whole seconds', () => {
    expect(judgePosition(15, 3600)).toEqual({
      kind: 'in-progress',
      positionSeconds: 15,
      durationSeconds: 3600,
    });
    expect(judgePosition(1234.9, 3600.4)).toEqual({
      kind: 'in-progress',
      positionSeconds: 1234,
      durationSeconds: 3600,
    });
  });

  it('counts the credits as the end', () => {
    expect(judgePosition(3419, 3600).kind).toBe('in-progress');
    expect(judgePosition(3420, 3600)).toEqual({ kind: 'finished', durationSeconds: 3600 });
    expect(judgePosition(3600, 3600).kind).toBe('finished');
  });

  it('can finish a clip that is shorter than the first seconds', () => {
    expect(judgePosition(5, 12)).toEqual({ kind: 'not-started' });
    expect(judgePosition(12, 12)).toEqual({ kind: 'finished', durationSeconds: 12 });
  });

  it('has nothing to remember of a video without a length', () => {
    expect(judgePosition(30, 0)).toEqual({ kind: 'not-started' });
    expect(judgePosition(30, 0.2)).toEqual({ kind: 'not-started' });
  });
});

describe('clampWatchedAt', () => {
  const now = new Date('2026-11-21T10:00:00Z');

  it('believes a time in the past', () => {
    const earlier = new Date('2026-11-20T08:00:00Z');
    expect(clampWatchedAt(earlier, now)).toBe(earlier);
  });

  it('does not believe a time in the future', () => {
    expect(clampWatchedAt(new Date('2027-01-01T00:00:00Z'), now)).toBe(now);
  });

  it('uses now when the device says nothing', () => {
    expect(clampWatchedAt(undefined, now)).toBe(now);
  });
});
