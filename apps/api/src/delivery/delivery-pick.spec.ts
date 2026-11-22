// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { chooseEdge, pickByWeight, rankFor, VIDEO_SPREAD } from './delivery-pick.js';

const edges = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, weight: 10 }));

describe('choosing an edge', () => {
  it('gives none when there is no edge', () => {
    expect(chooseEdge('video', 'x', [])).toBeNull();
    expect(chooseEdge('live', 'x', [])).toBeNull();
  });

  it('ranks the edges of a video the same way every time', () => {
    expect(rankFor('video-1', edges)).toEqual(rankFor('video-1', [...edges].reverse()));
  });

  it('keeps a video on a few edges', () => {
    const used = new Set<string>();
    for (let step = 0; step < 200; step += 1) {
      used.add(chooseEdge('video', 'video-1', edges, step / 200)?.id ?? '');
    }
    expect(used.size).toBe(VIDEO_SPREAD);
  });

  it('spreads different videos over all edges', () => {
    const used = new Set<string>();
    for (let video = 0; video < 200; video += 1) {
      used.add(chooseEdge('video', `video-${video}`, edges, 0.1)?.id ?? '');
    }
    expect(used.size).toBe(edges.length);
  });

  it('moves only the videos of an edge that goes away', () => {
    const without = edges.filter((edge) => edge.id !== 'c');
    let moved = 0;
    let onRemoved = 0;
    for (let video = 0; video < 500; video += 1) {
      const before = rankFor(`video-${video}`, edges)[0];
      const after = rankFor(`video-${video}`, without)[0];
      if (before?.id === 'c') {
        onRemoved += 1;
      } else if (before?.id !== after?.id) {
        moved += 1;
      }
    }
    expect(onRemoved).toBeGreaterThan(0);
    expect(moved).toBe(0);
  });

  it('gives a heavier edge more videos', () => {
    const uneven = [
      { id: 'big', weight: 30 },
      { id: 'small', weight: 10 },
    ];
    let big = 0;
    for (let video = 0; video < 2000; video += 1) {
      if (rankFor(`video-${video}`, uneven)[0]?.id === 'big') {
        big += 1;
      }
    }
    // Three quarters, give or take.
    expect(big).toBeGreaterThan(1350);
    expect(big).toBeLessThan(1650);
  });

  it('sends a live channel to every edge, by weight', () => {
    const uneven = [
      { id: 'big', weight: 30 },
      { id: 'small', weight: 10 },
    ];
    expect(pickByWeight(uneven, 0)?.id).toBe('big');
    expect(pickByWeight(uneven, 0.74)?.id).toBe('big');
    expect(pickByWeight(uneven, 0.76)?.id).toBe('small');
    expect(pickByWeight(uneven, 0.999)?.id).toBe('small');
    expect(chooseEdge('live', 'channel', uneven, 0.9)?.id).toBe('small');
  });
});
