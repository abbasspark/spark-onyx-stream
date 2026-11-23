// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { TitleDetail } from '@/api/types';
import {
  availabilityOf,
  availabilityProblem,
  changedFields,
  fromLocalInput,
  moved,
  toLocalInput,
  countStates,
  creditsProblem,
  describeContent,
  episodeState,
  factsProblem,
  formatRating,
  formatRuntime,
  parseList,
  priceProblem,
  sectionPath,
  sharedSearch,
  titlePath,
  toCreditInputs,
  toForm,
  videoProgress,
  yearsOf,
} from './catalog';

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
  readyEpisodeCount: 0,
  availableFrom: null,
  availableUntil: null,
  extras: [],
  translations: [],
  collections: [],
  releaseDate: null,
  runtimeMinutes: null,
  rating: null,
  seriesStatus: null,
  genres: [{ id: 'g1', name: 'Thriller' }],
  countries: ['DE'],
  studios: ['Nachtfilm'],
  keywords: ['train', 'night'],
  imdbId: null,
  ratingCount: null,
  lastAirDate: null,
  credits: [],
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

describe('sections', () => {
  it('sends a movie and a series to their own addresses', () => {
    expect(titlePath({ id: 't1', type: 'MOVIE' })).toBe('/movies/t1');
    expect(titlePath({ id: 't2', type: 'SERIES' })).toBe('/series/t2');
    expect(sectionPath('SERIES')).toBe('/series');
  });

  it('carries only the filters both sections know to the other one', () => {
    expect(
      sharedSearch('?category=c1&q=night&page=3&sort=rating&running=ENDED&video=missing'),
    ).toBe('?q=night&category=c1');
    expect(sharedSearch('?page=2')).toBe('');
    expect(sharedSearch('')).toBe('');
  });
});

describe('facts', () => {
  const saved = toForm(title);

  it('writes lengths and ratings for reading', () => {
    expect(formatRuntime(136)).toBe('2 h 16 min');
    expect(formatRuntime(48)).toBe('48 min');
    expect(formatRuntime(120)).toBe('2 h');
    expect(formatRuntime(null)).toBe('–');
    expect(formatRating(8)).toBe('8.0');
    expect(formatRating(null)).toBe('–');
  });

  it('reads a typed list once per entry', () => {
    expect(parseList(' heist, Train ,heist\n night ,, ')).toEqual(['heist', 'Train', 'night']);
  });

  it('sends facts that changed, with countries in capitals', () => {
    expect(
      changedFields(saved, {
        ...saved,
        releaseDate: '2024-03-14',
        runtimeMinutes: '112',
        countries: 'de, fr',
        keywords: 'train, night, heist',
        imdbId: ' tt1234567 ',
        genreIds: ['g1', 'g2'],
      }),
    ).toEqual({
      releaseDate: '2024-03-14',
      runtimeMinutes: 112,
      countries: ['DE', 'FR'],
      keywords: ['train', 'night', 'heist'],
      imdbId: 'tt1234567',
      genreIds: ['g1', 'g2'],
    });
  });

  it('leaves lists alone when only their spacing changed', () => {
    expect(changedFields(saved, { ...saved, keywords: 'train ,night', countries: 'DE,' })).toEqual(
      {},
    );
  });

  it('clears facts that were emptied', () => {
    const before = toForm({ ...title, releaseDate: '2024-03-14', runtimeMinutes: 112 });
    expect(changedFields(before, { ...before, releaseDate: '', runtimeMinutes: '' })).toEqual({
      releaseDate: null,
      runtimeMinutes: null,
    });
  });

  it('names what is wrong with the facts', () => {
    expect(factsProblem(saved)).toBeNull();
    expect(factsProblem({ ...saved, runtimeMinutes: '1h' })).toContain('whole minutes');
    expect(factsProblem({ ...saved, countries: 'Germany' })).toContain('two letters');
    expect(factsProblem({ ...saved, imdbId: '133093' })).toContain('tt0133093');
  });

  it('writes the years of a series by its state', () => {
    const series = { releaseYear: 2019, seriesStatus: 'ENDED', lastAirDate: '2023-05-28' } as const;
    expect(yearsOf(series)).toBe('2019–2023');
    expect(yearsOf({ ...series, seriesStatus: 'RUNNING' })).toBe('2019–');
    expect(yearsOf({ ...series, lastAirDate: '2019-12-01' })).toBe('2019');
    expect(yearsOf({ ...series, releaseYear: null })).toBe('');
  });
});

describe('episodes', () => {
  const video = (status: 'READY' | 'PROCESSING' | 'FAILED') => ({
    id: 'a1',
    title: 'Video',
    status,
    durationMs: 1000,
    height: 1080,
    playable: status === 'READY',
  });

  it('tells where an episode stands', () => {
    expect(episodeState({ status: 'DRAFT', asset: null })).toBe('empty');
    expect(episodeState({ status: 'DRAFT', asset: video('PROCESSING') })).toBe('working');
    expect(episodeState({ status: 'DRAFT', asset: video('FAILED') })).toBe('failed');
    expect(episodeState({ status: 'DRAFT', asset: video('READY') })).toBe('ready');
    expect(episodeState({ status: 'PUBLISHED', asset: video('READY') })).toBe('published');
  });

  it('counts the states in the order they are explained', () => {
    expect(
      countStates([
        { status: 'DRAFT', asset: null },
        { status: 'PUBLISHED', asset: video('READY') },
        { status: 'DRAFT', asset: null },
      ]),
    ).toEqual([
      ['published', 1],
      ['empty', 2],
    ]);
  });

  it('says how much of a series has its video', () => {
    expect(videoProgress({ episodeCount: 0, readyEpisodeCount: 0 }).label).toBe('No episodes yet');
    expect(videoProgress({ episodeCount: 8, readyEpisodeCount: 6 })).toEqual({
      percent: 75,
      label: '6 of 8 episodes have a video',
      complete: false,
    });
    expect(videoProgress({ episodeCount: 1, readyEpisodeCount: 1 }).label).toBe(
      'All 1 episode has a video',
    );
  });
});

describe('credits', () => {
  const person = { id: 'p1', slug: 'ana', name: 'Ana', portrait: null };

  it('saves credits with trimmed parts and no empty ones', () => {
    expect(
      toCreditInputs([
        { kind: 'CAST', role: ' Mara ', person },
        { kind: 'CREW', role: '  ', person },
      ]),
    ).toEqual([
      { personId: 'p1', kind: 'CAST', role: 'Mara' },
      { personId: 'p1', kind: 'CREW', role: null },
    ]);
  });

  it('refuses the same person twice with the same part', () => {
    const twice = [
      { personId: 'p1', kind: 'CREW', role: 'Director' },
      { personId: 'p1', kind: 'CREW', role: 'director' },
    ] as const;
    expect(creditsProblem(twice)).toContain('twice');
    expect(creditsProblem([twice[0], { ...twice[1], role: 'Writer' }])).toBeNull();
  });
});

describe('availability', () => {
  const now = Date.parse('2026-06-15T12:00:00Z');
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();

  it('tells where a title stands between its dates', () => {
    expect(availabilityOf({ availableFrom: null, availableUntil: null }, now)).toBe('always');
    expect(availabilityOf({ availableFrom: at(2), availableUntil: null }, now)).toBe('scheduled');
    expect(availabilityOf({ availableFrom: at(-2), availableUntil: null }, now)).toBe('current');
    expect(availabilityOf({ availableFrom: null, availableUntil: at(5) }, now)).toBe('current');
    expect(availabilityOf({ availableFrom: at(-9), availableUntil: at(-1) }, now)).toBe('ended');
    // The end itself is outside, as the server has it.
    expect(availabilityOf({ availableFrom: null, availableUntil: at(0) }, now)).toBe('ended');
  });

  it('takes a moment to a date field and back', () => {
    const iso = '2026-12-24T18:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('soon')).toBe('');
    expect(fromLocalInput('')).toBeNull();
  });

  it('wants the end after the start', () => {
    expect(availabilityProblem('2026-12-24T18:00', '2026-12-24T17:00')).toContain('after');
    expect(availabilityProblem('2026-12-24T18:00', '2026-12-24T18:00')).toContain('after');
    expect(availabilityProblem('2026-12-24T18:00', '2026-12-25T18:00')).toBeNull();
    expect(availabilityProblem('', '2026-12-25T18:00')).toBeNull();
  });

  it('sends the collections of a title only when they changed', () => {
    const saved = toForm({
      ...title,
      collections: [
        { id: 'c2', name: 'B' },
        { id: 'c1', name: 'A' },
      ],
    });
    expect(changedFields(saved, { ...saved, collectionIds: ['c2', 'c1'] })).toEqual({});
    expect(changedFields(saved, { ...saved, collectionIds: ['c1'] })).toEqual({
      collectionIds: ['c1'],
    });
  });
});

describe('moved', () => {
  it('moves an entry one step and leaves the list alone at its ends', () => {
    expect(moved(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moved(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moved(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moved(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
