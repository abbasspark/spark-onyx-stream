// SPDX-License-Identifier: AGPL-3.0-only
import { diffSnapshots, summarize } from './title-diff.js';
import type { TitleSnapshot } from './title-snapshot.js';

function snapshot(
  over: Partial<TitleSnapshot> = {},
  fields: Partial<TitleSnapshot['fields']> = {},
) {
  const base: TitleSnapshot = {
    v: 1,
    fields: {
      name: 'Harbour Lights',
      slug: 'harbour-lights',
      originalName: null,
      tagline: null,
      synopsis: 'A port town in winter.',
      releaseYear: 2024,
      releaseDate: null,
      runtimeMinutes: 118,
      ageRating: null,
      originalLanguage: null,
      imdbId: null,
      seriesStatus: null,
      status: 'DRAFT',
      isFeatured: false,
      availableFrom: null,
      availableUntil: null,
      access: 'FREE',
      purchaseOnly: false,
      rentAmount: null,
      buyAmount: null,
      ...fields,
    },
    countries: ['DE'],
    studios: [],
    keywords: ['harbour'],
    images: { poster: 'p1', backdrop: null, logo: null },
    video: null,
    trailer: null,
    extras: [],
    genres: [{ id: 'g1', name: 'Drama' }],
    categories: [],
    packages: [],
    credits: [
      { personId: 'a', name: 'Mira Castell', kind: 'CAST', role: 'Greta' },
      { personId: 'b', name: 'Jonas Reuter', kind: 'CAST', role: 'Olaf' },
    ],
    translations: {},
    seasons: [],
    ...over,
  };
  return base;
}

const fieldsOf = (changes: { field: string }[]) => changes.map((change) => change.field);

describe('diffSnapshots', () => {
  it('finds nothing between two equal moments', () => {
    expect(diffSnapshots(snapshot(), snapshot())).toEqual([]);
  });

  it('shows texts and values as before and after, with how to show them', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({}, { synopsis: 'A port town in spring.', rentAmount: 399, status: 'PUBLISHED' }),
    );
    expect(changes).toEqual([
      {
        group: 'texts',
        field: 'synopsis',
        label: 'Synopsis',
        kind: 'text',
        before: 'A port town in winter.',
        after: 'A port town in spring.',
      },
      {
        group: 'publishing',
        field: 'status',
        label: 'Status',
        kind: 'value',
        format: 'status',
        before: 'DRAFT',
        after: 'PUBLISHED',
      },
      {
        group: 'access',
        field: 'rentAmount',
        label: 'Rental price',
        kind: 'value',
        format: 'money',
        before: null,
        after: '399',
      },
    ]);
  });

  it('treats an empty text as none', () => {
    expect(diffSnapshots(snapshot({}, { tagline: '' }), snapshot({}, { tagline: null }))).toEqual(
      [],
    );
  });

  it('says what joined and left a list, and does not mind a rename', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({
        genres: [
          { id: 'g1', name: 'Dramas' },
          { id: 'g2', name: 'Thriller' },
        ],
        keywords: ['winter'],
        countries: ['DE', 'DK'],
      }),
    );
    expect(changes).toEqual([
      {
        group: 'facts',
        field: 'countries',
        label: 'Countries',
        kind: 'list',
        added: ['DK'],
        removed: [],
      },
      {
        group: 'classification',
        field: 'genres',
        label: 'Genres',
        kind: 'list',
        added: ['Thriller'],
        removed: [],
      },
      {
        group: 'classification',
        field: 'keywords',
        label: 'Keywords',
        kind: 'list',
        added: ['winter'],
        removed: ['harbour'],
      },
    ]);
  });

  it('tells a new part from a new order among the people', () => {
    const base = snapshot();
    const swapped = snapshot({ credits: [...base.credits].reverse() });
    expect(diffSnapshots(base, swapped)).toEqual([
      {
        group: 'people',
        field: 'cast',
        label: 'Cast',
        kind: 'list',
        added: [],
        removed: [],
        reordered: true,
      },
    ]);

    const recast = snapshot({
      credits: [
        { personId: 'a', name: 'Mira Castell', kind: 'CAST', role: 'Greta Holm' },
        { personId: 'c', name: 'Leni Hartwig', kind: 'CREW', role: 'Director' },
      ],
    });
    expect(diffSnapshots(base, recast)).toMatchObject([
      {
        field: 'cast',
        added: ['Mira Castell (Greta Holm)'],
        removed: ['Mira Castell (Greta)', 'Jonas Reuter (Olaf)'],
      },
      { field: 'crew', added: ['Leni Hartwig (Director)'], removed: [] },
    ]);
  });

  it('follows pictures, videos and extras', () => {
    const changes = diffSnapshots(
      snapshot({ extras: [{ assetId: 'x', name: 'Teaser', kind: 'TEASER' }] }),
      snapshot({
        images: { poster: 'p2', backdrop: 'b1', logo: null },
        video: { id: 'v1', name: 'Film.mp4' },
      }),
    );
    expect(changes).toMatchObject([
      { field: 'poster', format: 'picture', before: 'p1', after: 'p2' },
      { field: 'backdrop', before: null, after: 'b1' },
      { field: 'video', before: null, after: 'Film.mp4' },
      { field: 'extras', added: [], removed: ['Teaser'] },
    ]);
  });

  it('follows languages and the texts in them', () => {
    const de = { name: 'Hafenlichter', tagline: null, synopsis: null };
    const added = diffSnapshots(snapshot(), snapshot({ translations: { de } }));
    expect(added).toMatchObject([{ field: 'languages', added: ['de'], removed: [] }]);

    const edited = diffSnapshots(
      snapshot({ translations: { de } }),
      snapshot({ translations: { de: { ...de, synopsis: 'Eine Hafenstadt.' } } }),
    );
    expect(edited).toEqual([
      {
        group: 'translations',
        field: 'translation:de:synopsis',
        label: 'de: synopsis',
        kind: 'text',
        before: null,
        after: 'Eine Hafenstadt.',
      },
    ]);
  });

  it('follows seasons and episodes', () => {
    const one = { number: 1, name: 'Low water', synopsis: null, status: 'DRAFT', assetId: null };
    const before = snapshot({
      seasons: [{ number: 1, name: null, synopsis: null, episodes: [one] }],
    });
    const after = snapshot({
      seasons: [
        {
          number: 1,
          name: 'First winter',
          synopsis: null,
          episodes: [
            { ...one, status: 'PUBLISHED', assetId: 'v1' },
            { number: 2, name: 'High water', synopsis: null, status: 'DRAFT', assetId: null },
          ],
        },
        {
          number: 2,
          name: null,
          synopsis: null,
          episodes: [{ ...one, name: 'Thaw' }],
        },
      ],
    });
    const changes = diffSnapshots(before, after);
    expect(fieldsOf(changes)).toEqual([
      'seasons',
      'season:1:name',
      'season:1:episodes',
      'season:1:episode:1:status',
      'season:1:episode:1:video',
      'season:2:episodes',
    ]);
    expect(changes[0]).toMatchObject({ added: ['Season 2'], removed: [] });
    expect(changes[2]).toMatchObject({ label: 'Season 1: episodes', added: ['2. High water'] });
    expect(changes[4]).toMatchObject({
      label: 'Season 1, episode 1: video',
      before: null,
      after: 'A video',
    });
    expect(changes[5]).toMatchObject({ added: ['1. Thaw'] });
  });
});

describe('summarize', () => {
  it('names the first changes and counts the rest', () => {
    const changes = diffSnapshots(
      snapshot(),
      snapshot({ keywords: [], countries: [] }, { synopsis: 'x', name: 'y' }),
    );
    expect(summarize(changes)).toBe('Name, Synopsis and 2 more');
    expect(summarize(changes.slice(0, 2))).toBe('Name and Synopsis');
    expect(summarize([])).toBe('Nothing changed');
  });
});
