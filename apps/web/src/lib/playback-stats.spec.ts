// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { bufferAhead, droppedShare, EMPTY_READING, formatRate, hostOf } from './playback-stats';

/** A stand-in for the browser's TimeRanges, which has no constructor. */
function ranges(...pairs: [number, number][]): TimeRanges {
  return {
    length: pairs.length,
    start: (index: number) => pairs[index]?.[0] ?? 0,
    end: (index: number) => pairs[index]?.[1] ?? 0,
  } as TimeRanges;
}

describe('bufferAhead', () => {
  it('is nothing without any loaded video', () => {
    expect(bufferAhead(undefined, 10)).toBe(0);
    expect(bufferAhead(ranges(), 10)).toBe(0);
  });

  it('measures from the position to the end of the stretch it is in', () => {
    expect(bufferAhead(ranges([0, 30]), 10)).toBe(20);
  });

  it('takes the stretch the position is in, not the first one', () => {
    expect(bufferAhead(ranges([0, 5], [40, 80]), 50)).toBe(30);
  });

  it('counts nothing when the position is in a gap', () => {
    expect(bufferAhead(ranges([0, 5], [40, 80]), 20)).toBe(0);
  });
});

describe('formatRate', () => {
  it('writes megabits above a million', () => {
    expect(formatRate(4_200_000)).toBe('4.2 Mbps');
    expect(formatRate(12_000_000)).toBe('12 Mbps');
  });

  it('writes kilobits below one', () => {
    expect(formatRate(850_000)).toBe('850 kbps');
  });

  it('has a dash for nothing to say', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(0)).toBe('—');
    expect(formatRate(Number.NaN)).toBe('—');
  });
});

describe('hostOf', () => {
  it('names the server of an address', () => {
    expect(hostOf('https://edge-2.example.com/live/a.ts')).toBe('edge-2.example.com');
  });

  it('works on an address without a server of its own', () => {
    expect(hostOf('/media/part-3.ts')).toBe('local');
  });

  it('gives nothing for nothing', () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf(undefined)).toBeNull();
  });
});

describe('droppedShare', () => {
  it('has a dash before any frame was shown', () => {
    expect(droppedShare(EMPTY_READING)).toBe('—');
  });

  it('counts the lost frames against those shown', () => {
    expect(droppedShare({ ...EMPTY_READING, dropped: 24, frames: 1200 })).toBe('24 (2.0%)');
  });

  it('does not round a handful down to nothing', () => {
    expect(droppedShare({ ...EMPTY_READING, dropped: 1, frames: 100_000 })).toBe('1 (<0.1%)');
  });
});
