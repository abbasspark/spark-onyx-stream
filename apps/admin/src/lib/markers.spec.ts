// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  describeDetection,
  formatMoment,
  type Marker,
  markersProblem,
  parseMoment,
  sameMarkers,
  suggestMarker,
} from './markers';

const HOUR = 3_600_000;
const intro: Marker = { kind: 'INTRO', startMs: 60_000, endMs: 120_000 };
const credits: Marker = { kind: 'CREDITS', startMs: 3_400_000, endMs: null };

describe('formatMoment and parseMoment', () => {
  it('writes a moment the way it is read back', () => {
    for (const [milliseconds, text] of [
      [0, '0:00'],
      [5000, '0:05'],
      [90_500, '1:30.5'],
      [3_725_000, '1:02:05'],
      [59_960, '1:00'],
    ] as const) {
      expect(formatMoment(milliseconds)).toBe(text);
    }
    expect(parseMoment('1:30.5')).toBe(90_500);
    expect(parseMoment('1:02:05')).toBe(3_725_000);
    expect(parseMoment(formatMoment(754_300))).toBe(754_300);
  });

  it('reads what people type', () => {
    expect(parseMoment('90')).toBe(90_000);
    expect(parseMoment(' 2:05 ')).toBe(125_000);
    expect(parseMoment('1:30,5')).toBe(90_500);
    expect(parseMoment('0')).toBe(0);
  });

  it('reads nothing else', () => {
    for (const text of ['', 'abc', '1:75', '1:2:3:4', '-5', '1:', ':30', '1:60']) {
      expect(parseMoment(text)).toBeNull();
    }
  });
});

describe('markersProblem', () => {
  it('says what the API would say', () => {
    expect(markersProblem([intro, credits], HOUR)).toBeNull();
    expect(markersProblem([{ ...intro, endMs: null }], HOUR)).toBe('The intro needs an end');
    expect(markersProblem([{ ...intro, endMs: 60_200 }], HOUR)).toContain('less than a second');
    expect(markersProblem([{ ...credits, startMs: HOUR + 1 }], HOUR)).toContain(
      'the start is after the end of the video',
    );
    expect(markersProblem([intro, { kind: 'RECAP', startMs: 0, endMs: 70_000 }], HOUR)).toBe(
      'The recap and the intro overlap',
    );
  });
});

describe('sameMarkers', () => {
  it('compares what they say, not their order or where they come from', () => {
    expect(sameMarkers([intro, credits], [credits, { ...intro, source: 'DETECTED' }])).toBe(true);
    expect(sameMarkers([intro], [{ ...intro, endMs: 121_000 }])).toBe(false);
    expect(sameMarkers([intro], [])).toBe(false);
  });
});

describe('suggestMarker', () => {
  it('starts an intro where the player is, in the first half', () => {
    expect(suggestMarker('INTRO', 30_000, HOUR)).toEqual({
      kind: 'INTRO',
      startMs: 30_000,
      endMs: 90_000,
    });
    expect(suggestMarker('RECAP', 3_000_000, HOUR).startMs).toBe(0);
  });

  it('starts credits where the player is, in the second half, and lets them run to the end', () => {
    expect(suggestMarker('CREDITS', 3_300_000, HOUR)).toEqual({
      kind: 'CREDITS',
      startMs: 3_300_000,
      endMs: null,
    });
    expect(suggestMarker('CREDITS', 10_000, HOUR).startMs).toBe(HOUR - 120_000);
  });

  it('keeps a suggestion inside a short video', () => {
    expect(suggestMarker('INTRO', 0, 20_000).endMs).toBe(20_000);
  });
});

describe('describeDetection', () => {
  const base = { episodes: 8, keptManual: 0, perEpisode: [] };

  it('says what was found', () => {
    expect(describeDetection({ ...base, intros: 8, credits: 6 })).toBe(
      'Found an intro in all 8 episodes and credits in 6 of 8.',
    );
    expect(describeDetection({ ...base, intros: 0, credits: 3 })).toBe('Found credits in 3 of 8.');
  });

  it('says when nothing was found, and why that may be', () => {
    expect(describeDetection({ ...base, intros: 0, credits: 0 })).toContain('share no intro');
    expect(describeDetection({ ...base, intros: 0, credits: 0, keptManual: 4 })).toContain(
      'set by hand',
    );
  });
});
