// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { type Box, nearest } from './focus';

const box = (left: number, top: number, width = 100, height = 100): Box => ({
  left,
  top,
  width,
  height,
});

describe('nearest', () => {
  // Two rows of three cards.
  const grid = [
    { id: 'a1', box: box(0, 0) },
    { id: 'a2', box: box(120, 0) },
    { id: 'a3', box: box(240, 0) },
    { id: 'b1', box: box(0, 120) },
    { id: 'b2', box: box(120, 120) },
    { id: 'b3', box: box(240, 120) },
  ];
  const others = (id: string) => grid.filter((item) => item.id !== id);

  it('moves along a row', () => {
    expect(nearest(box(0, 0), others('a1'), 'right')).toBe('a2');
    expect(nearest(box(240, 0), others('a3'), 'left')).toBe('a2');
  });

  it('moves between rows, staying in the column', () => {
    expect(nearest(box(120, 0), others('a2'), 'down')).toBe('b2');
    expect(nearest(box(120, 120), others('b2'), 'up')).toBe('a2');
  });

  it('prefers the card in line over a nearer one off to the side', () => {
    const items = [
      { id: 'inline', box: box(0, 300) },
      { id: 'aside', box: box(140, 150) },
    ];
    expect(nearest(box(0, 0), items, 'down')).toBe('inline');
  });

  it('stays where it is at the edge', () => {
    expect(nearest(box(0, 0), others('a1'), 'left')).toBeNull();
    expect(nearest(box(0, 0), others('a1'), 'up')).toBeNull();
    expect(nearest(box(240, 120), others('b3'), 'right')).toBeNull();
  });

  it('ignores a place that overlaps the start', () => {
    expect(nearest(box(0, 0), [{ id: 'same', box: box(0, 0) }], 'right')).toBeNull();
  });
});
