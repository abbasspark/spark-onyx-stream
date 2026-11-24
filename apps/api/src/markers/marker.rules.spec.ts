// SPDX-License-Identifier: AGPL-3.0-only
import {
  type MarkerInput,
  markersProblem,
  normalizeMarkers,
  watchedFromSeconds,
} from './marker.rules.js';

const HOUR = 3_600_000;
const intro: MarkerInput = { kind: 'INTRO', startMs: 60_000, endMs: 120_000 };
const recap: MarkerInput = { kind: 'RECAP', startMs: 0, endMs: 55_000 };
const credits: MarkerInput = { kind: 'CREDITS', startMs: 3_400_000, endMs: null };

describe('markersProblem', () => {
  it('finds nothing wrong with a recap, an intro and credits in their places', () => {
    expect(markersProblem([credits, intro, recap], HOUR)).toBeNull();
    expect(markersProblem([], HOUR)).toBeNull();
    // Credits before a scene after them.
    expect(markersProblem([{ ...credits, endMs: 3_550_000 }], HOUR)).toBeNull();
  });

  it('takes one of each kind', () => {
    expect(markersProblem([intro, { ...intro, startMs: 200_000, endMs: 260_000 }], HOUR)).toBe(
      'The intro can be marked once in a video',
    );
  });

  it('asks for an end, after the start, of everything but the credits', () => {
    expect(markersProblem([{ ...intro, endMs: null }], HOUR)).toBe('The intro needs an end');
    expect(markersProblem([{ ...intro, endMs: 60_500 }], HOUR)).toContain('less than a second');
    expect(markersProblem([{ ...intro, endMs: 30_000 }], HOUR)).toContain(
      'the end is before the start',
    );
  });

  it('keeps markers inside the video, with a little room at the end', () => {
    expect(markersProblem([{ ...credits, startMs: HOUR }], HOUR)).toBe(
      'The credits: the start is after the end of the video',
    );
    expect(markersProblem([{ ...credits, endMs: HOUR + 60_000 }], HOUR)).toContain(
      'the end is after the end of the video',
    );
    expect(markersProblem([{ ...credits, endMs: HOUR + 1000 }], HOUR)).toBeNull();
    // Nothing to measure against while the length is not known.
    expect(markersProblem([{ ...credits, endMs: 9 * HOUR }], null)).toBeNull();
  });

  it('does not let markers overlap', () => {
    expect(markersProblem([{ ...recap, endMs: 70_000 }, intro], HOUR)).toBe(
      'The recap and the intro overlap',
    );
    expect(
      markersProblem([credits, { ...intro, startMs: 3_500_000, endMs: 3_520_000 }], HOUR),
    ).toBe('The credits and the intro overlap');
    // One may begin where the other ends.
    expect(markersProblem([{ ...recap, endMs: 60_000 }, intro], HOUR)).toBeNull();
  });
});

describe('normalizeMarkers', () => {
  it('puts them in the order of the video', () => {
    expect(normalizeMarkers([credits, intro, recap], HOUR).map((marker) => marker.kind)).toEqual([
      'RECAP',
      'INTRO',
      'CREDITS',
    ]);
  });

  it('lets credits that end with the video run to its end', () => {
    expect(normalizeMarkers([{ ...credits, endMs: HOUR + 800 }], HOUR)[0]!.endMs).toBeNull();
    expect(normalizeMarkers([{ ...credits, endMs: HOUR - 500 }], HOUR)[0]!.endMs).toBeNull();
    expect(normalizeMarkers([{ ...credits, endMs: 3_550_000 }], HOUR)[0]!.endMs).toBe(3_550_000);
    // An intro at the very end keeps its end.
    expect(
      normalizeMarkers([{ ...intro, startMs: HOUR - 5000, endMs: HOUR }], HOUR)[0]!.endMs,
    ).toBe(HOUR);
  });
});

describe('watchedFromSeconds', () => {
  it('is where the credits begin', () => {
    expect(watchedFromSeconds([intro, credits], 3600)).toBe(3400);
  });

  it('is nothing without credits, or with credits in the first half', () => {
    expect(watchedFromSeconds([intro], 3600)).toBeNull();
    expect(watchedFromSeconds([{ kind: 'CREDITS', startMs: 600_000 }], 3600)).toBeNull();
    expect(watchedFromSeconds([credits], 0)).toBeNull();
  });
});
