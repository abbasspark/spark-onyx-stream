// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { TitleDetail } from '@/api/types';
import { changedFields, describeContent, priceProblem, toForm } from './catalog';

const title: TitleDetail = {
  id: 't1',
  type: 'MOVIE',
  slug: 'night-train',
  name: 'Night Train',
  releaseYear: 2024,
  status: 'DRAFT',
  publishedAt: null,
  isFeatured: false,
  access: 'FREE',
  poster: null,
  categories: [
    { id: 'c2', name: 'Drama' },
    { id: 'c1', name: 'Thriller' },
  ],
  packages: [{ id: 'p1', name: 'Films' }],
  rentAmount: 399,
  buyAmount: null,
  purchaseOnly: false,
  asset: null,
  seasonCount: 0,
  episodeCount: 0,
  isVisible: false,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  originalName: null,
  tagline: 'One night. One way out.',
  synopsis: null,
  ageRating: null,
  originalLanguage: 'en',
  backdrop: null,
  logo: null,
  trailerAsset: null,
  metadata: null,
  seasons: [],
  checklist: [],
};

describe('changedFields', () => {
  const saved = toForm(title);

  it('finds nothing to save in an untouched form', () => {
    expect(changedFields(saved, toForm(title))).toEqual({});
  });

  it('ignores spaces around a value and the order of the categories', () => {
    const form = { ...saved, name: '  Night Train ', categoryIds: ['c2', 'c1'] };
    expect(changedFields(saved, form)).toEqual({});
  });

  it('sends the packages when one was added or taken away', () => {
    expect(changedFields(saved, { ...saved, packageIds: ['p2', 'p1'] })).toEqual({
      packageIds: ['p2', 'p1'],
    });
    expect(changedFields(saved, { ...saved, packageIds: [] })).toEqual({ packageIds: [] });
    expect(changedFields(saved, { ...saved, packageIds: ['p1'] })).toEqual({});
  });

  it('sends a price that was set, changed or taken away, in the smallest unit', () => {
    expect(saved.rentPrice).toBe('3.99');
    expect(saved.buyPrice).toBe('');
    expect(changedFields(saved, { ...saved, buyPrice: '9,99' })).toEqual({ buyAmount: 999 });
    expect(changedFields(saved, { ...saved, rentPrice: '4' })).toEqual({ rentAmount: 400 });
    expect(changedFields(saved, { ...saved, rentPrice: '' })).toEqual({ rentAmount: null });
    // Written another way, it is the same price.
    expect(changedFields(saved, { ...saved, rentPrice: ' 3,99 ' })).toEqual({});
    expect(changedFields(saved, { ...saved, purchaseOnly: true })).toEqual({ purchaseOnly: true });
  });

  it('names what is wrong with the prices before anything is sent', () => {
    expect(priceProblem(saved, 'EUR')).toBeNull();
    expect(priceProblem({ ...saved, rentPrice: 'abc' }, 'EUR')).toMatch(/Write prices as numbers/);
    expect(changedFields(saved, { ...saved, rentPrice: 'abc' })).toEqual({});
    const onlyToBuy = { ...saved, isPaid: true, purchaseOnly: true, rentPrice: '' };
    expect(priceProblem(onlyToBuy, 'EUR')).toMatch(/nobody could watch/);
    expect(priceProblem({ ...onlyToBuy, buyPrice: '9.99' }, 'EUR')).toBeNull();
    // A free title sells nothing, so nothing is missing.
    expect(priceProblem({ ...onlyToBuy, isPaid: false }, 'EUR')).toBeNull();
  });

  it('sends only what changed', () => {
    const form = { ...saved, name: 'Night Train 2', isFeatured: true };
    expect(changedFields(saved, form)).toEqual({ name: 'Night Train 2', isFeatured: true });
  });

  it('clears an emptied text and an emptied year', () => {
    const form = { ...saved, tagline: ' ', releaseYear: '', originalLanguage: '' };
    expect(changedFields(saved, form)).toEqual({
      tagline: null,
      releaseYear: null,
      originalLanguage: null,
    });
  });

  it('sends the year as a number and the whole list of categories', () => {
    const form = { ...saved, releaseYear: '2025', categoryIds: ['c1'] };
    expect(changedFields(saved, form)).toEqual({ releaseYear: 2025, categoryIds: ['c1'] });
  });
});

describe('describeContent', () => {
  it('describes a movie by its video', () => {
    expect(describeContent(title)).toBe('No video yet');
    const video = {
      id: 'a1',
      title: 'Master',
      durationMs: 5_400_000,
      height: 1080,
      playable: true,
    };
    expect(describeContent({ ...title, asset: { ...video, status: 'PROCESSING' } })).toBe(
      'Video processing',
    );
    expect(describeContent({ ...title, asset: { ...video, status: 'READY' } })).toBe('1:30:00');
  });

  it('describes a series by its size', () => {
    const series = { ...title, type: 'SERIES' as const };
    expect(describeContent(series)).toBe('No seasons yet');
    expect(describeContent({ ...series, seasonCount: 1, episodeCount: 1 })).toBe(
      '1 season · 1 episode',
    );
    expect(describeContent({ ...series, seasonCount: 2, episodeCount: 14 })).toBe(
      '2 seasons · 14 episodes',
    );
  });
});

describe('access', () => {
  it('sends the access only when it changed', () => {
    const saved = toForm(title);
    expect(changedFields(saved, { ...saved, isPaid: true })).toEqual({ access: 'PAID' });
    const paid = toForm({ ...title, access: 'PAID' });
    expect(paid.isPaid).toBe(true);
    expect(changedFields(paid, { ...paid, isPaid: false })).toEqual({ access: 'FREE' });
  });
});
