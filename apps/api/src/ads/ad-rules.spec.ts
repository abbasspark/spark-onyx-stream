// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AD_SETTINGS,
  isWebAddress,
  MAX_BREAKS,
  pickByWeight,
  planBreaks,
  readAdSettings,
} from './ad-rules.js';

const on = { ...DEFAULT_AD_SETTINGS, enabled: true };
const minutes = (n: number) => n * 60_000;

describe('readAdSettings', () => {
  it('starts switched off', () => {
    expect(readAdSettings(undefined).enabled).toBe(false);
    expect(readAdSettings('junk')).toEqual(DEFAULT_AD_SETTINGS);
  });

  it('keeps what is valid and replaces what is not, field by field', () => {
    expect(
      readAdSettings({ enabled: true, midRollEveryMinutes: 'often', minDurationMinutes: 9999 }),
    ).toEqual({ ...DEFAULT_AD_SETTINGS, enabled: true, minDurationMinutes: 240 });
  });
});

describe('planBreaks', () => {
  it('plans nothing while ads are off', () => {
    expect(planBreaks(DEFAULT_AD_SETTINGS, { durationMs: minutes(90) })).toEqual([]);
  });

  it('plans a pre-roll by default', () => {
    expect(planBreaks(on, { durationMs: minutes(90) })).toEqual([{ position: 'PRE', atMs: null }]);
  });

  it('leaves short videos alone', () => {
    expect(planBreaks(on, { durationMs: minutes(8) })).toEqual([]);
  });

  it('places mid-rolls every so many minutes, and keeps clear of the end', () => {
    const planned = planBreaks(
      { ...on, preRoll: false, midRollEveryMinutes: 20 },
      { durationMs: minutes(70) },
    );
    expect(planned.map((item) => item.atMs)).toEqual([minutes(20), minutes(40), minutes(60)]);
    const tight = planBreaks(
      { ...on, preRoll: false, midRollEveryMinutes: 20 },
      { durationMs: minutes(64) },
    );
    expect(tight.map((item) => item.atMs)).toEqual([minutes(20), minutes(40)]);
  });

  it('does not stop anyone once the credits have started', () => {
    const planned = planBreaks(
      { ...on, preRoll: false, midRollEveryMinutes: 20 },
      { durationMs: minutes(120), creditsStartMs: minutes(50) },
    );
    expect(planned.map((item) => item.atMs)).toEqual([minutes(20), minutes(40)]);
  });

  it('orders pre, mid and post and caps the number of breaks', () => {
    const planned = planBreaks(
      { ...on, postRoll: true, midRollEveryMinutes: 1 },
      { durationMs: minutes(200) },
    );
    expect(planned).toHaveLength(MAX_BREAKS);
    expect(planned[0]?.position).toBe('PRE');
  });

  it('plans breaks that need no length for a video of unknown length', () => {
    expect(planBreaks({ ...on, midRollEveryMinutes: 10 }, { durationMs: null })).toEqual([
      { position: 'PRE', atMs: null },
    ]);
  });
});

describe('pickByWeight', () => {
  const sources = [
    { id: 'a', weight: 1 },
    { id: 'b', weight: 3 },
  ];

  it('chooses in proportion to the weights', () => {
    expect(pickByWeight(sources, 0)?.id).toBe('a');
    expect(pickByWeight(sources, 0.24)?.id).toBe('a');
    expect(pickByWeight(sources, 0.25)?.id).toBe('b');
    expect(pickByWeight(sources, 0.999)?.id).toBe('b');
  });

  it('chooses nothing without a source or a weight', () => {
    expect(pickByWeight([], 0.5)).toBeNull();
    expect(pickByWeight([{ id: 'a', weight: 0 }], 0.5)).toBeNull();
  });
});

describe('isWebAddress', () => {
  it('accepts web addresses only', () => {
    expect(isWebAddress('https://ads.example.com/vast?x=1')).toBe(true);
    expect(isWebAddress('javascript:alert(1)')).toBe(false);
    expect(isWebAddress('not an address')).toBe(false);
  });
});
