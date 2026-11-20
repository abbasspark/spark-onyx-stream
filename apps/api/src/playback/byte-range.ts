// SPDX-License-Identifier: AGPL-3.0-only

/** A satisfiable byte range, both ends inclusive. */
export interface ByteRange {
  start: number;
  end: number;
}

export type RangeResult =
  { kind: 'none' } | { kind: 'range'; range: ByteRange } | { kind: 'unsatisfiable' };

/**
 * Interprets an HTTP Range header for a file of the given size.
 *
 * Supports the three single-range forms: "bytes=0-99", "bytes=100-" and
 * "bytes=-50" (the last 50 bytes). A header with several ranges or another
 * unit is ignored, as the HTTP specification allows, and the whole file is sent.
 */
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) {
    return { kind: 'none' };
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return { kind: 'none' };
  }
  const [, startText = '', endText = ''] = match;

  if (startText === '' && endText === '') {
    return { kind: 'none' };
  }

  if (startText === '') {
    const suffixLength = Number(endText);
    if (suffixLength === 0 || size === 0) {
      return { kind: 'unsatisfiable' };
    }
    return { kind: 'range', range: { start: Math.max(0, size - suffixLength), end: size - 1 } };
  }

  const start = Number(startText);
  const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  if (start >= size || start > end) {
    return { kind: 'unsatisfiable' };
  }
  return { kind: 'range', range: { start, end } };
}
