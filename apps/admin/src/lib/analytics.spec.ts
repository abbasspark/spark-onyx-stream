// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  bucketDays,
  busiestHours,
  changeOf,
  formatHour,
  formatWatchTime,
  niceTop,
  rangeOfPreset,
} from './analytics';

describe('rangeOfPreset', () => {
  it('counts back from today, today included', () => {
    const today = new Date(2026, 11, 10, 15, 30);
    expect(rangeOfPreset('7', today)).toEqual({ from: '2026-12-04', to: '2026-12-10' });
    expect(rangeOfPreset('28', today)).toEqual({ from: '2026-11-13', to: '2026-12-10' });
    expect(rangeOfPreset('365', today)).toEqual({ from: '2025-12-11', to: '2026-12-10' });
  });
});

describe('changeOf', () => {
  it('compares with the days before', () => {
    expect(changeOf(112, 100)).toEqual({ direction: 'up', label: '+12 %' });
    expect(changeOf(50, 100)).toEqual({ direction: 'down', label: '−50 %' });
    expect(changeOf(1001, 1000)).toEqual({ direction: 'same', label: '0 %' });
    expect(changeOf(5, 0)).toEqual({ direction: 'up', label: 'new' });
    expect(changeOf(0, 0)).toBeNull();
  });
});

describe('formatWatchTime', () => {
  it('uses the units that say something', () => {
    expect(formatWatchTime(40)).toBe('40 s');
    expect(formatWatchTime(840)).toBe('14 min');
    expect(formatWatchTime(7500)).toBe('2 h 5 min');
    expect(formatWatchTime(7200)).toBe('2 h');
    expect(formatWatchTime(4_320_000)).toBe('1,200 h');
  });
});

describe('niceTop', () => {
  it('rounds up to 1, 2 or 5 times a power of ten', () => {
    expect(niceTop(0)).toBe(1);
    expect(niceTop(3)).toBe(5);
    expect(niceTop(17)).toBe(20);
    expect(niceTop(100)).toBe(100);
    expect(niceTop(101)).toBe(200);
    expect(niceTop(7400)).toBe(10000);
  });
});

describe('bucketDays', () => {
  const days = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      day: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
      views: 1,
    }));
  const sum = (slice: readonly { views: number }[]) =>
    slice.reduce((total, day) => total + day.views, 0);

  it('keeps days as they are up to about three months', () => {
    const buckets = bucketDays(days(28), sum);
    expect(buckets).toHaveLength(28);
    expect(buckets[0]).toMatchObject({ from: '2026-01-01', to: '2026-01-01', value: 1 });
  });
  it('adds a long stretch up by week', () => {
    const buckets = bucketDays(days(365), sum);
    expect(buckets).toHaveLength(53);
    expect(buckets[0]).toMatchObject({ from: '2026-01-01', to: '2026-01-07', value: 7 });
    expect(buckets.at(-1)?.value).toBe(1);
  });
});

describe('hours', () => {
  it('are named as people say them', () => {
    expect([0, 9, 12, 21].map(formatHour)).toEqual(['12 am', '9 am', '12 pm', '9 pm']);
  });
  it('find the three busiest in a row, also around midnight', () => {
    const hours = Array.from({ length: 24 }, () => 0);
    expect(busiestHours(hours)).toBeNull();
    hours[20] = 5;
    hours[21] = 9;
    hours[22] = 4;
    expect(busiestHours(hours)).toBe('Most is watched between 8 pm and 11 pm');
    const late = Array.from({ length: 24 }, () => 0);
    late[23] = 5;
    late[0] = 5;
    expect(busiestHours(late)).toBe('Most is watched between 10 pm and 1 am');
  });
});
