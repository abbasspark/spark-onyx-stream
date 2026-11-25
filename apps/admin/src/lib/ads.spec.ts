// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { AdFigures, AdSettings, AdSource } from '@/api/types';
import {
  clickRate,
  completionRate,
  describeBreaks,
  funnelOf,
  isWebAddress,
  parseWhole,
  percentOf,
  shareOf,
  skipRate,
} from './ads';

const figures = (changes: Partial<AdFigures> = {}): AdFigures => ({
  impressions: 200,
  firstQuartile: 180,
  midpoint: 150,
  thirdQuartile: 120,
  completes: 100,
  skips: 50,
  clicks: 10,
  errors: 0,
  ...changes,
});

const source = (changes: Partial<AdSource>): AdSource => ({
  id: 'a',
  name: 'A',
  kind: 'VAST_TAG',
  vastUrl: 'https://ads.example/tag',
  asset: null,
  clickUrl: null,
  skipAfterSeconds: null,
  weight: 1,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  ...changes,
});

const settings = (changes: Partial<AdSettings> = {}): AdSettings => ({
  enabled: true,
  preRoll: true,
  postRoll: false,
  midRollEveryMinutes: 0,
  minDurationMinutes: 10,
  ...changes,
});

describe('rates', () => {
  it('round to whole percents and stay empty without ads', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBeNull();
    expect(completionRate(figures())).toBe(50);
    expect(skipRate(figures())).toBe(25);
    expect(clickRate(figures())).toBe(5);
    expect(completionRate(figures({ impressions: 0 }))).toBeNull();
  });
  it('lists the funnel in playing order', () => {
    expect(funnelOf(figures()).map((step) => step.value)).toEqual([200, 180, 150, 120, 100]);
  });
});

describe('shareOf', () => {
  it('splits by weight among the active sources', () => {
    const list = [
      source({ id: '1', weight: 3 }),
      source({ id: '2', weight: 1 }),
      source({ id: '3', weight: 5, isActive: false }),
    ];
    expect(shareOf(list[0]!, list)).toBe(75);
    expect(shareOf(list[1]!, list)).toBe(25);
    expect(shareOf(list[2]!, list)).toBeNull();
  });
});

describe('describeBreaks', () => {
  it('says when ads are off', () => {
    expect(describeBreaks(settings({ enabled: false }))).toMatch(/off/);
  });
  it('names each place in plain words', () => {
    expect(describeBreaks(settings({ postRoll: true, midRollEveryMinutes: 20 }))).toBe(
      'Viewers without an ad-free plan see an ad before the video, every 20 minutes during it and after it. Videos shorter than 10 minutes are left alone.',
    );
  });
  it('asks for a place when none is chosen', () => {
    expect(describeBreaks(settings({ preRoll: false }))).toMatch(/Pick at least one/);
  });
});

describe('parseWhole', () => {
  it('reads numbers in range', () => {
    expect(parseWhole('', 0, 60)).toBeNull();
    expect(parseWhole(' 5 ', 0, 60)).toBe(5);
    expect(parseWhole('61', 0, 60)).toBe('invalid');
    expect(parseWhole('2.5', 0, 60)).toBe('invalid');
  });
});

describe('isWebAddress', () => {
  it('accepts web addresses only', () => {
    expect(isWebAddress('https://ads.example/vast?x=1')).toBe(true);
    expect(isWebAddress('javascript:alert(1)')).toBe(false);
    expect(isWebAddress('not a url')).toBe(false);
  });
});
