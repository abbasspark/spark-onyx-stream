// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { HomeSection } from '@/api/types';
import {
  describeSection,
  formProblem,
  isLayoutPage,
  moved,
  placedAt,
  presetsFor,
  type SectionForm,
  sectionState,
  sortsFor,
} from './home';

const section = (values: Partial<HomeSection>) =>
  ({
    kind: 'TITLES',
    source: 'ALL',
    category: null,
    genre: null,
    collection: null,
    titleType: null,
    sort: 'NEWEST',
    limit: 20,
    layout: 'POSTER',
    visible: true,
    visibleFrom: null,
    visibleUntil: null,
    count: 3,
    ...values,
  }) as HomeSection;

describe('describeSection', () => {
  it('says what a row shows in one line', () => {
    expect(describeSection(section({}))).toBe('The whole catalog, newest first, up to 20');
    expect(
      describeSection(
        section({
          source: 'CATEGORY',
          category: { id: '1', name: 'Drama' },
          titleType: 'MOVIE',
          sort: 'RATING',
          layout: 'LANDSCAPE',
        }),
      ),
    ).toBe('Movies of the category Drama, best rated first, up to 20, as wide cards');
    expect(
      describeSection(
        section({ source: 'MANUAL', sort: 'CURATED', limit: 10, layout: 'NUMBERED' }),
      ),
    ).toBe('Titles picked by hand, in your order, up to 10, as a numbered top list');
    expect(
      describeSection(
        section({ source: 'COLLECTION', collection: { id: '1', name: 'Saga' }, sort: 'CURATED' }),
      ),
    ).toBe('Titles of the collection Saga, in its own order, up to 20');
  });
  it('says how many titles the opening lets take turns', () => {
    expect(describeSection(section({ kind: 'HERO', source: 'FEATURED', limit: 5 }))).toBe(
      'Featured titles, newest first, up to 5 that take turns',
    );
    expect(describeSection(section({ kind: 'HERO', limit: 1 }))).toContain('one title');
  });
});

describe('sectionState', () => {
  const now = new Date('2026-12-10T12:00:00Z').getTime();
  it('says why a section is shown or not', () => {
    expect(sectionState(section({}), now)).toBe('shown');
    expect(sectionState(section({ visible: false }), now)).toBe('off');
    expect(sectionState(section({ visibleFrom: '2026-12-24T00:00:00Z' }), now)).toBe('scheduled');
    expect(sectionState(section({ visibleUntil: '2026-12-01T00:00:00Z' }), now)).toBe('ended');
    expect(sectionState(section({ count: 0 }), now)).toBe('empty');
    expect(sectionState(section({ kind: 'CONTINUE_WATCHING', count: 0 }), now)).toBe('shown');
  });
});

describe('sortsFor', () => {
  it('offers an own order only where there is one', () => {
    expect(sortsFor('MANUAL')).toEqual(['CURATED']);
    expect(sortsFor('COLLECTION')[0]).toBe('CURATED');
    expect(sortsFor('ALL')).not.toContain('CURATED');
  });
});

describe('formProblem', () => {
  const form = (values: Partial<SectionForm>): SectionForm => ({
    name: '',
    source: 'ALL',
    categoryId: '',
    genreId: '',
    collectionId: '',
    titleType: 'ALL',
    sort: 'NEWEST',
    limit: 20,
    layout: 'POSTER',
    visible: true,
    from: '',
    until: '',
    picked: [],
    ...values,
  });
  it('names what is missing', () => {
    expect(formProblem('TITLES', form({}))).toBeNull();
    expect(formProblem('TITLES', form({ source: 'CATEGORY' }))).toBe('Choose the category.');
    expect(formProblem('TITLES', form({ source: 'MANUAL' }))).toBe('Pick at least one title.');
    expect(formProblem('TITLES', form({ limit: 2 }))).toBe('Show between 4 and 40 titles.');
    expect(formProblem('HERO', form({ limit: 2 }))).toBeNull();
    expect(formProblem('HERO', form({ limit: 9 }))).toBe('Show between 1 and 8 titles.');
    expect(
      formProblem('TITLES', form({ from: '2026-12-24T00:00', until: '2026-12-01T00:00' })),
    ).toBe('The end must come after the start.');
    expect(formProblem('CONTINUE_WATCHING', form({ source: 'CATEGORY' }))).toBeNull();
  });
});

describe('moved and placedAt', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const ids = (list: { id: string }[]) => list.map((item) => item.id).join('');
  it('move one place, and not past the ends', () => {
    expect(ids(moved(items, 0, 1))).toBe('bac');
    expect(ids(moved(items, 2, -1))).toBe('acb');
    expect(ids(moved(items, 0, -1))).toBe('abc');
  });
  it('put a dragged entry where another is', () => {
    expect(ids(placedAt(items, 'a', 'c'))).toBe('bca');
    expect(ids(placedAt(items, 'c', 'a'))).toBe('cab');
    expect(ids(placedAt(items, 'a', 'a'))).toBe('abc');
    expect(ids(placedAt(items, 'x', 'a'))).toBe('abc');
  });
});

describe('pages', () => {
  it('are known by their name in addresses', () => {
    expect(isLayoutPage('movies')).toBe(true);
    expect(isLayoutPage('live')).toBe(true);
    expect(isLayoutPage('channels')).toBe(false);
    expect(isLayoutPage(undefined)).toBe(false);
    expect(isLayoutPage('toString')).toBe(false);
  });
  it('say that a section of the page of categories stays within the category', () => {
    expect(describeSection(section({}), 'category')).toBe(
      'Everything in the category, newest first, up to 20',
    );
    expect(describeSection(section({ titleType: 'MOVIE' }), 'genre')).toBe(
      'All movies of the genre, newest first, up to 20',
    );
    expect(describeSection(section({ source: 'FEATURED' }), 'genre')).toBe(
      'Featured titles of the genre, newest first, up to 20',
    );
  });

  it('do not offer a row for a category on the page of categories', () => {
    const keys = (page: 'category' | 'genre') => presetsFor(page).map((preset) => preset.key);
    expect(keys('category')).not.toContain('category');
    expect(keys('category')).toContain('genre');
    expect(keys('genre')).not.toContain('genre');
    expect(keys('genre')).toContain('category');
  });
  it('offer rows about their own kind of title', () => {
    expect(presetsFor('home').map((preset) => preset.key)).toContain('movies');
    const movies = presetsFor('movies');
    expect(movies.map((preset) => preset.key)).not.toContain('series');
    expect(movies.map((preset) => preset.key)).not.toContain('movies');
    expect(movies.every((preset) => preset.input.titleType === 'MOVIE')).toBe(true);
    expect(presetsFor('series').find((preset) => preset.key === 'top')?.input).toMatchObject({
      titleType: 'SERIES',
      layout: 'NUMBERED',
    });
  });
});
