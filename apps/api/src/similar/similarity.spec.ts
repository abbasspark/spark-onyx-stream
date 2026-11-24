// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  arrangeSimilar,
  MIN_SCORE,
  rankSimilar,
  scoreCandidate,
  SIGNALS,
  type SimilarCandidate,
  type SimilarSource,
  WEIGHTS,
} from './similarity.js';

const source: SimilarSource = {
  type: 'MOVIE',
  releaseYear: 2010,
  originalLanguage: 'en',
  minAge: 12,
  genreCount: 3,
  categoryCount: 1,
};

function candidate(over: Partial<SimilarCandidate> = {}): SimilarCandidate {
  return {
    id: 'a',
    type: 'SERIES',
    releaseYear: null,
    originalLanguage: null,
    minAge: null,
    rating: null,
    genreCount: 3,
    categoryCount: 0,
    sharedGenres: 0,
    sharedCategories: 0,
    sharedCollections: 0,
    sharedKeywords: 0,
    sharedCast: 0,
    sharedCrew: 0,
    sharedStudios: 0,
    coViewers: 0,
    coStrength: 0,
    ...over,
  };
}

describe('the weights', () => {
  it('add up to 100 and name every reason', () => {
    expect(Object.keys(WEIGHTS).sort()).toEqual([...SIGNALS].sort());
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('scoreCandidate', () => {
  it('gives the full genre points only when both have exactly the same genres', () => {
    const same = scoreCandidate(source, candidate({ sharedGenres: 3 }));
    expect(same?.signals).toEqual([{ signal: 'genres', points: 22, count: 3 }]);

    // Two of three shared, and the other has one of its own: 2 of 4 in all.
    const half = scoreCandidate(source, candidate({ sharedGenres: 2 }));
    expect(half?.score).toBe(11);
  });

  it('does not call titles similar that only share weak things', () => {
    const weak = candidate({
      type: 'MOVIE',
      releaseYear: 2010,
      originalLanguage: 'en',
      sharedStudios: 1,
      sharedCategories: 1,
      categoryCount: 1,
    });
    expect(scoreCandidate(source, weak)).toBeNull();
  });

  it('drops what shares too little', () => {
    // One genre of three, the other has five: 1 of 7.
    const thin = candidate({ sharedGenres: 1, genreCount: 5 });
    expect(22 / 7).toBeLessThan(MIN_SCORE);
    expect(scoreCandidate(source, thin)).toBeNull();
  });

  it('counts keywords, cast and crew up to a number and no further', () => {
    const some = scoreCandidate(source, candidate({ sharedKeywords: 2, sharedCast: 3 }));
    expect(some?.signals).toEqual([
      { signal: 'cast', points: 10, count: 3 },
      { signal: 'keywords', points: 6, count: 2 },
    ]);
    const many = scoreCandidate(source, candidate({ sharedKeywords: 40, sharedCrew: 9 }));
    expect(many?.score).toBe(20);
  });

  it('lets a shared collection count by itself', () => {
    const scored = scoreCandidate(source, candidate({ sharedCollections: 1 }));
    expect(scored?.score).toBe(20);
  });

  it('counts what viewers watched together by the size of the overlap', () => {
    const strong = scoreCandidate(source, candidate({ coViewers: 40, coStrength: 0.6 }));
    expect(strong?.signals[0]).toEqual({ signal: 'watched', points: 20, count: 40 });
    const fair = scoreCandidate(source, candidate({ coViewers: 12, coStrength: 0.2 }));
    expect(fair?.score).toBe(10);
  });

  it('adds the weak reasons on top of a strong one', () => {
    const scored = scoreCandidate(
      source,
      candidate({
        sharedGenres: 3,
        type: 'MOVIE',
        releaseYear: 2010,
        originalLanguage: 'en',
        sharedStudios: 2,
        sharedCategories: 1,
        categoryCount: 1,
      }),
    );
    expect(scored?.score).toBe(22 + 2 + 2 + 2 + 1 + 1);
    expect(scored?.signals.map((entry) => entry.signal)).toEqual([
      'genres',
      'categories',
      'kind',
      'era',
      'studio',
      'language',
    ]);
  });

  it('lets the time of release fade over fifteen years', () => {
    const near = scoreCandidate(source, candidate({ sharedGenres: 3, releaseYear: 2013 }));
    expect(near?.signals.find((entry) => entry.signal === 'era')?.points).toBe(1.6);
    const far = scoreCandidate(source, candidate({ sharedGenres: 3, releaseYear: 1980 }));
    expect(far?.signals.some((entry) => entry.signal === 'era')).toBe(false);
  });

  it('pushes down a title for a much older audience', () => {
    const adult = candidate({ sharedGenres: 3, sharedCollections: 1, minAge: 18 });
    expect(scoreCandidate(source, adult)?.score).toBe(42 - 15);
    // Enough to remove one that was only fairly alike.
    expect(scoreCandidate(source, candidate({ sharedGenres: 3, minAge: 18 }))).toBeNull();
    // The other way round nothing is taken away.
    expect(scoreCandidate(source, candidate({ sharedGenres: 3, minAge: 6 }))?.score).toBe(22);
  });

  it('never goes above 100', () => {
    const everything = candidate({
      type: 'MOVIE',
      releaseYear: 2010,
      originalLanguage: 'en',
      categoryCount: 1,
      sharedGenres: 3,
      sharedCategories: 1,
      sharedCollections: 2,
      sharedKeywords: 9,
      sharedCast: 9,
      sharedCrew: 9,
      sharedStudios: 1,
      coViewers: 99,
      coStrength: 1,
    });
    expect(scoreCandidate(source, everything)?.score).toBe(100);
  });
});

describe('rankSimilar', () => {
  it('orders by points, then by rating, and leaves out what is not similar', () => {
    const ranked = rankSimilar(source, [
      candidate({ id: 'low', sharedGenres: 2 }),
      candidate({ id: 'none' }),
      candidate({ id: 'liked', sharedGenres: 3, rating: 8.1 }),
      candidate({ id: 'plain', sharedGenres: 3, rating: 6 }),
      candidate({ id: 'unrated', sharedGenres: 3 }),
      candidate({ id: 'top', sharedGenres: 3, sharedCollections: 1 }),
    ]);
    expect(ranked.map((entry) => entry.id)).toEqual(['top', 'liked', 'plain', 'unrated', 'low']);
  });
});

describe('arrangeSimilar', () => {
  it('puts pinned titles first, in their order, and removes hidden ones', () => {
    expect(arrangeSimilar(['a', 'b', 'c', 'd'], ['x', 'c'], new Set(['b']))).toEqual([
      'x',
      'c',
      'a',
      'd',
    ]);
  });

  it('lets hiding win over pinning', () => {
    expect(arrangeSimilar(['a'], ['x'], new Set(['x']))).toEqual(['a']);
  });
});
