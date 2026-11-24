// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  bandAt,
  endOf,
  type Marker,
  markerBands,
  runningMarker,
  skipLabel,
  watchedFrom,
} from './markers';

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

describe('markerBands', () => {
  const markers: Marker[] = [
    { kind: 'RECAP', startMs: 0, endMs: 40_000 },
    { kind: 'INTRO', startMs: 40_000, endMs: 90_000 },
    { kind: 'CREDITS', startMs: 3_400_000, endMs: null },
  ];

  it('has nothing to draw without markers or a length', () => {
    expect(markerBands(undefined, 3600)).toEqual([]);
    expect(markerBands(markers, 0)).toEqual([]);
  });

  it('places each stretch across the bar', () => {
    const bands = markerBands(markers, 3600);
    expect(bands).toHaveLength(3);
    expect(bands[1]).toMatchObject({
      kind: 'INTRO',
      name: 'Opening titles',
      startSeconds: 40,
      endSeconds: 90,
    });
    expect(bands[1]?.from).toBeCloseTo(40 / 3600, 5);
    expect(bands[1]?.to).toBeCloseTo(90 / 3600, 5);
  });

  it('runs credits without an end to the end of the video', () => {
    expect(markerBands(markers, 3600)[2]).toMatchObject({ endSeconds: 3600, to: 1 });
  });

  it('leaves out a stretch too thin to point at', () => {
    expect(markerBands([{ kind: 'INTRO', startMs: 10_000, endMs: 11_000 }], 3600)).toEqual([]);
  });

  it('keeps a stretch inside the video it belongs to', () => {
    const [band] = markerBands([{ kind: 'CREDITS', startMs: 9_000_000, endMs: null }], 3600);
    expect(band).toBeUndefined();
  });
});

describe('bandAt', () => {
  const bands = markerBands(
    [
      { kind: 'INTRO', startMs: 40_000, endMs: 90_000 },
      { kind: 'CREDITS', startMs: 3_400_000, endMs: null },
    ],
    3600,
  );

  it('names the stretch a moment falls in', () => {
    expect(bandAt(bands, 50)?.kind).toBe('INTRO');
    expect(bandAt(bands, 3500)?.kind).toBe('CREDITS');
  });

  it('gives nothing between the stretches', () => {
    expect(bandAt(bands, 600)).toBeNull();
    // The end of a stretch belongs to what comes after it.
    expect(bandAt(bands, 90)).toBeNull();
  });
});
