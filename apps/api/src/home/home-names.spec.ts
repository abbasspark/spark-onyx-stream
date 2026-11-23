// SPDX-License-Identifier: AGPL-3.0-only
import { browsePath, defaultSectionName, isShownAt, type NamedSection } from './home-names.js';

const section = (values: Partial<NamedSection>): NamedSection => ({
  kind: 'TITLES',
  name: null,
  source: 'ALL',
  sort: 'NEWEST',
  titleType: null,
  category: null,
  genre: null,
  collection: null,
  ...values,
});
const drama = { name: 'Drama', slug: 'drama' };

describe('defaultSectionName', () => {
  it('names a row after what it shows', () => {
    expect(defaultSectionName(section({}))).toBe('New');
    expect(defaultSectionName(section({ titleType: 'MOVIE' }))).toBe('New movies');
    expect(defaultSectionName(section({ sort: 'RATING', titleType: 'SERIES' }))).toBe(
      'Top rated series',
    );
    expect(defaultSectionName(section({ sort: 'RELEASED' }))).toBe('Latest releases');
    expect(defaultSectionName(section({ sort: 'NAME', titleType: 'MOVIE' }))).toBe('All movies');
    expect(defaultSectionName(section({ source: 'FEATURED' }))).toBe('Featured');
    expect(defaultSectionName(section({ source: 'CATEGORY', category: drama }))).toBe('Drama');
    expect(
      defaultSectionName(section({ source: 'GENRE', genre: drama, titleType: 'SERIES' })),
    ).toBe('Drama series');
    expect(
      defaultSectionName(
        section({ source: 'COLLECTION', collection: { name: 'Saga', slug: 's' } }),
      ),
    ).toBe('Saga');
    expect(defaultSectionName(section({ source: 'MANUAL' }))).toBe('Our picks');
    expect(defaultSectionName(section({ kind: 'CONTINUE_WATCHING' }))).toBe('Continue watching');
  });
});

describe('defaultSectionName on a page about one kind of title', () => {
  it('does not repeat the kind the page is about', () => {
    expect(defaultSectionName(section({ titleType: 'MOVIE' }), 'MOVIE')).toBe('New');
    expect(defaultSectionName(section({ titleType: 'MOVIE', sort: 'RATING' }), 'MOVIE')).toBe(
      'Top rated',
    );
    expect(
      defaultSectionName(
        section({ source: 'CATEGORY', category: drama, titleType: 'MOVIE' }),
        'MOVIE',
      ),
    ).toBe('Drama');
    // A row about the other kind still says so.
    expect(defaultSectionName(section({ titleType: 'SERIES' }), 'MOVIE')).toBe('New series');
  });
});

describe('browsePath', () => {
  it('leads to the browse page with the same filters', () => {
    expect(browsePath(section({}))).toBe('/browse');
    expect(browsePath(section({ titleType: 'MOVIE', sort: 'RATING' }))).toBe(
      '/browse?type=MOVIE&sort=rating',
    );
    expect(browsePath(section({ source: 'CATEGORY', category: drama }))).toBe(
      '/browse?category=drama',
    );
    expect(browsePath(section({ source: 'GENRE', genre: drama, sort: 'NAME' }))).toBe(
      '/browse?genre=drama&sort=name',
    );
    expect(browsePath(section({ source: 'FEATURED' }))).toBe('/browse?featured=true');
  });
  it('leads to the page of a collection, and nowhere for picked titles', () => {
    expect(
      browsePath(section({ source: 'COLLECTION', collection: { name: 'Saga', slug: 'saga' } })),
    ).toBe('/collection/saga');
    expect(browsePath(section({ source: 'MANUAL' }))).toBeNull();
    expect(browsePath(section({ kind: 'HERO' }))).toBeNull();
  });
});

describe('browsePath on the page of a category or genre', () => {
  const page = { kind: 'category', slug: 'drama' } as const;
  it('stays inside the category of the page', () => {
    expect(browsePath(section({}), page)).toBe('/browse?category=drama');
    expect(browsePath(section({ titleType: 'MOVIE', sort: 'RATING' }), page)).toBe(
      '/browse?type=MOVIE&category=drama&sort=rating',
    );
    expect(
      browsePath(section({ source: 'GENRE', genre: { name: 'Crime', slug: 'crime' } }), page),
    ).toBe('/browse?genre=crime&category=drama');
    expect(browsePath(section({ source: 'FEATURED' }), { kind: 'genre', slug: 'crime' })).toBe(
      '/browse?genre=crime&featured=true',
    );
  });
  it('has no address for what the browse page cannot show', () => {
    expect(browsePath(section({ source: 'CATEGORY', category: drama }), page)).toBeNull();
    expect(
      browsePath(
        section({ source: 'COLLECTION', collection: { name: 'Saga', slug: 'saga' } }),
        page,
      ),
    ).toBeNull();
  });
});

describe('isShownAt', () => {
  const now = new Date('2026-12-10T12:00:00Z');
  const base = { visible: true, visibleFrom: null, visibleUntil: null };
  it('needs the switch and the dates', () => {
    expect(isShownAt(base, now)).toBe(true);
    expect(isShownAt({ ...base, visible: false }, now)).toBe(false);
    expect(isShownAt({ ...base, visibleFrom: new Date('2026-12-24T00:00:00Z') }, now)).toBe(false);
    expect(isShownAt({ ...base, visibleUntil: new Date('2026-12-01T00:00:00Z') }, now)).toBe(false);
    expect(
      isShownAt(
        {
          ...base,
          visibleFrom: new Date('2026-12-01T00:00:00Z'),
          visibleUntil: new Date('2026-12-27T00:00:00Z'),
        },
        now,
      ),
    ).toBe(true);
  });
});
