// SPDX-License-Identifier: AGPL-3.0-only
import { parseRange } from './byte-range.js';

describe('parseRange', () => {
  it('returns none without a header', () => {
    expect(parseRange(undefined, 1000)).toEqual({ kind: 'none' });
  });

  it('parses a closed range', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ kind: 'range', range: { start: 0, end: 99 } });
  });

  it('parses an open-ended range', () => {
    expect(parseRange('bytes=900-', 1000)).toEqual({
      kind: 'range',
      range: { start: 900, end: 999 },
    });
  });

  it('parses a suffix range', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({
      kind: 'range',
      range: { start: 900, end: 999 },
    });
    expect(parseRange('bytes=-5000', 1000)).toEqual({
      kind: 'range',
      range: { start: 0, end: 999 },
    });
  });

  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=500-99999', 1000)).toEqual({
      kind: 'range',
      range: { start: 500, end: 999 },
    });
  });

  it('reports ranges that cannot be satisfied', () => {
    expect(parseRange('bytes=1000-', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=500-100', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=-0', 1000)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
  });

  it('ignores multiple ranges, other units and malformed headers', () => {
    expect(parseRange('bytes=0-10,20-30', 1000)).toEqual({ kind: 'none' });
    expect(parseRange('items=0-10', 1000)).toEqual({ kind: 'none' });
    expect(parseRange('bytes=abc', 1000)).toEqual({ kind: 'none' });
    expect(parseRange('bytes=-', 1000)).toEqual({ kind: 'none' });
  });
});
