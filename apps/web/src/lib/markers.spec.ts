// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { endOf, type Marker, runningMarker, skipLabel, watchedFrom } from './markers';

const recap: Marker = { kind: 'RECAP', startMs: 0, endMs: 55_000 };
const intro: Marker = { kind: 'INTRO', startMs: 60_000, endMs: 120_000 };
const credits: Marker = { kind: 'CREDITS', startMs: 3_400_000, endMs: null };
const all = [recap, intro, credits];

describe('runningMarker', () => {
  it('is the stretch the video is in', () => {
    expect(runningMarker(all, 0, 3600)).toBe(recap);
    expect(runningMarker(all, 60, 3600)).toBe(intro);
    expect(runningMarker(all, 90.5, 3600)).toBe(intro);
    expect(runningMarker(all, 3500, 3600)).toBe(credits);
  });

  it('is nothing between stretches, or without any', () => {
    expect(runningMarker(all, 57, 3600)).toBeNull();
    expect(runningMarker(all, 1800, 3600)).toBeNull();
    expect(runningMarker([], 10, 3600)).toBeNull();
    expect(runningMarker(undefined, 10, 3600)).toBeNull();
    expect(runningMarker(all, 10, 0)).toBeNull();
  });

  it('is nothing in the last two seconds of a stretch, where a skip saves nothing', () => {
    expect(runningMarker(all, 117.9, 3600)).toBe(intro);
    expect(runningMarker(all, 118.5, 3600)).toBeNull();
    expect(runningMarker(all, 3599, 3600)).toBeNull();
  });
});

describe('endOf', () => {
  it('is the end of the stretch, and the end of the video for credits without one', () => {
    expect(endOf(intro, 3600)).toBe(120);
    expect(endOf(credits, 3600)).toBe(3600);
    expect(endOf({ ...credits, endMs: 3_550_000 }, 3600)).toBe(3550);
    // Never past the video.
    expect(endOf({ ...intro, endMs: 9_000_000 }, 3600)).toBe(3600);
  });
});

describe('skipLabel', () => {
  it('names what is skipped', () => {
    expect(skipLabel('INTRO')).toBe('Skip intro');
    expect(skipLabel('RECAP')).toBe('Skip recap');
    expect(skipLabel('CREDITS')).toBe('Skip credits');
  });
});

describe('watchedFrom', () => {
  it('is where the credits begin', () => {
    expect(watchedFrom(all, 3600)).toBe(3400);
  });

  it('is nothing without credits, or with credits in the first half', () => {
    expect(watchedFrom([intro], 3600)).toBeUndefined();
    expect(watchedFrom([{ kind: 'CREDITS', startMs: 600_000, endMs: null }], 3600)).toBeUndefined();
    expect(watchedFrom(undefined, 3600)).toBeUndefined();
    expect(watchedFrom(all, 0)).toBeUndefined();
  });
});
