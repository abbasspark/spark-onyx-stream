// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { SimilarItem, SimilarSignal, SimilarView } from '@/api/types';
import {
  arrangeDraft,
  barParts,
  describeSignal,
  draftOf,
  listSummary,
  movePinned,
  sameDraft,
  strongSignals,
  weakSummary,
} from './similar';

const signal = (over: Partial<SimilarSignal> & Pick<SimilarSignal, 'signal'>): SimilarSignal => ({
  points: 1,
  count: 1,
  names: [],
  ...over,
});

function item(id: string, over: Partial<SimilarItem> = {}): SimilarItem {
  return {
    title: {
      id,
      slug: id,
      name: id.toUpperCase(),
      type: 'MOVIE',
      releaseYear: 2020,
      ageRating: null,
      status: 'PUBLISHED',
      poster: null,
    },
    pinned: false,
    score: 30,
    signals: [],
    rank: null,
    unseen: null,
    ...over,
  };
}

function view(items: SimilarItem[], hidden: SimilarItem[] = []): SimilarView {
  return {
    title: { id: 'source', name: 'Source', type: 'MOVIE' },
    items,
    hidden,
    shownByDefault: 12,
    most: 30,
    weights: {} as SimilarView['weights'],
    watching: null,
  };
}

describe('barParts', () => {
  it('draws strong reasons in the order of the legend and the rest as one part', () => {
    const parts = barParts([
      signal({ signal: 'genres', points: 22 }),
      signal({ signal: 'kind', points: 2 }),
      signal({ signal: 'collection', points: 20 }),
      signal({ signal: 'era', points: 1.6 }),
    ]);
    expect(parts.map((part) => [part.key, part.points])).toEqual([
      ['collection', 20],
      ['genres', 22],
      ['rest', 3.6],
    ]);
  });

  it('has no part for nothing', () => {
    expect(barParts([])).toEqual([]);
  });
});

describe('describeSignal', () => {
  it('names what is shared and cuts a long list', () => {
    expect(describeSignal(signal({ signal: 'genres', count: 2, names: ['Crime', 'Drama'] }))).toBe(
      'Genres: Crime, Drama',
    );
    expect(
      describeSignal(signal({ signal: 'keywords', count: 6, names: ['a', 'b', 'c', 'd', 'e'] })),
    ).toBe('Keywords: a, b, c and 3 more');
    expect(describeSignal(signal({ signal: 'collection', names: ['The Harbour Films'] }))).toBe(
      'Collection: The Harbour Films',
    );
  });

  it('counts the profiles that watched both', () => {
    expect(describeSignal(signal({ signal: 'watched', count: 1 }))).toBe(
      'Watched together by 1 profile',
    );
    expect(describeSignal(signal({ signal: 'watched', count: 14 }))).toBe(
      'Watched together by 14 profiles',
    );
  });

  it('keeps the strong reasons for the chips and sums up the others', () => {
    const signals = [
      signal({ signal: 'genres', names: ['Drama'] }),
      signal({ signal: 'kind' }),
      signal({ signal: 'studio', names: ['Northlight'] }),
    ];
    expect(strongSignals(signals).map((entry) => entry.signal)).toEqual(['genres']);
    expect(weakSummary(signals)).toBe('Both movies, or both series · Studio: Northlight');
    expect(weakSummary([signals[0] as SimilarSignal])).toBeNull();
  });
});

describe('the draft of an editor', () => {
  const saved = view(
    [
      item('pin', { pinned: true, score: null, rank: 1 }),
      item('a', { score: 40, rank: 2 }),
      item('b', { score: 30, rank: null, unseen: 'unplayable' }),
      item('c', { score: 20, rank: 3 }),
    ],
    [item('gone', { score: 50 })],
  );

  it('is read from what was saved', () => {
    expect(draftOf(saved)).toEqual({ pinned: ['pin'], hidden: ['gone'] });
    expect(sameDraft(draftOf(saved), { pinned: ['pin'], hidden: ['gone'] })).toBe(true);
    expect(sameDraft({ pinned: ['a', 'b'], hidden: [] }, { pinned: ['b', 'a'], hidden: [] })).toBe(
      false,
    );
    expect(sameDraft({ pinned: [], hidden: ['a', 'b'] }, { pinned: [], hidden: ['b', 'a'] })).toBe(
      true,
    );
  });

  it('shows the list as it will be, and counts the places again', () => {
    const known = new Map([['new', { ...item('new').title, status: 'DRAFT' as const }]]);
    const { items, hidden } = arrangeDraft(
      saved,
      { pinned: ['c', 'new'], hidden: ['a', 'gone'] },
      known,
    );
    expect(items.map((entry) => [entry.title.id, entry.pinned, entry.rank, entry.fresh])).toEqual([
      ['c', true, 1, false],
      ['new', true, null, true],
      ['b', false, null, false],
    ]);
    // "pin" shared nothing: let go, it is not among the found ones.
    expect(items.some((entry) => entry.title.id === 'pin')).toBe(false);
    expect(hidden.map((entry) => entry.title.id)).toEqual(['a', 'gone']);
  });

  it('lets a hidden title that is shown again take its place by how alike it is', () => {
    const { items } = arrangeDraft(saved, { pinned: [], hidden: [] }, new Map());
    expect(items.map((entry) => entry.title.id)).toEqual(['gone', 'a', 'b', 'c']);
    expect(items.map((entry) => entry.rank)).toEqual([1, 2, null, 3]);
  });

  it('moves pinned titles among themselves', () => {
    const draft = { pinned: ['a', 'b', 'c'], hidden: [] };
    expect(movePinned(draft, 'c', -1).pinned).toEqual(['a', 'c', 'b']);
    expect(movePinned(draft, 'a', -1)).toBe(draft);
    expect(movePinned(draft, 'c', 1)).toBe(draft);
    expect(movePinned(draft, 'x', 1)).toBe(draft);
  });

  it('sums the list up in a line', () => {
    const { items } = arrangeDraft(saved, draftOf(saved), new Map());
    expect(listSummary(items, draftOf(saved), 12)).toBe(
      '3 shown on the website · 1 pinned · 1 hidden',
    );
    expect(listSummary(items, { pinned: [], hidden: [] }, 2)).toBe(
      '2 shown on the website, 3 found',
    );
    expect(listSummary([], { pinned: [], hidden: [] }, 12)).toBe('Nothing shown to viewers');
  });
});
