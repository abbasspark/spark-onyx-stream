// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  ageRatingOf,
  cleanLongText,
  cleanText,
  episodesOf,
  languageOf,
  parseMetadataId,
  pickLogo,
  safeImagePath,
  seasonNameOf,
  seasonsOf,
  toImportedTitle,
  toSearchResult,
  yearOf,
} from './tmdb.mapper.js';

describe('parseMetadataId', () => {
  it('reads the kind and the number', () => {
    expect(parseMetadataId('movie:603')).toEqual({ kind: 'movie', id: 603, type: 'MOVIE' });
    expect(parseMetadataId('tv:1399')).toEqual({ kind: 'tv', id: 1399, type: 'SERIES' });
  });

  it('refuses everything else', () => {
    for (const value of [
      '603',
      'movie:',
      'movie:-1',
      'person:5',
      'tv:1/season/2',
      'movie:1e9',
      '',
    ]) {
      expect(parseMetadataId(value)).toBeNull();
    }
  });
});

describe('safeImagePath', () => {
  it('takes a plain file name and asks for drawings as PNG', () => {
    expect(safeImagePath('/aBc_123-x.jpg')).toBe('/aBc_123-x.jpg');
    expect(safeImagePath('/logo.svg')).toBe('/logo.png');
  });

  it('drops anything that could lead elsewhere', () => {
    for (const value of [
      null,
      undefined,
      42,
      'poster.jpg',
      '/a/b.jpg',
      '/../x.jpg',
      '//evil.example/x.jpg',
      'http://evil.example/x.jpg',
      '/x.jpg?size=1',
      '/x.exe',
      '/%2e%2e.jpg',
    ]) {
      expect(safeImagePath(value)).toBeNull();
    }
  });
});

describe('cleaning text', () => {
  it('treats empty text as missing', () => {
    expect(cleanText('', 10)).toBeNull();
    expect(cleanText('   ', 10)).toBeNull();
    expect(cleanText(undefined, 10)).toBeNull();
    expect(cleanText(5, 10)).toBeNull();
  });

  it('makes one line of a short text', () => {
    expect(cleanText('  Free\n your   mind. ', 50)).toBe('Free your mind.');
  });

  it('cuts at a word and says so', () => {
    const cut = cleanText('A very long tagline that goes on and on', 20);
    expect(cut).toBe('A very long tagline…');
    expect(cut?.length).toBeLessThanOrEqual(20);
  });

  it('keeps the paragraphs of a synopsis', () => {
    expect(cleanLongText('One.  \r\n\r\n\r\n\r\nTwo  words.\n', 100)).toBe('One.\n\nTwo words.');
    expect(cleanLongText('x'.repeat(30), 10)).toHaveLength(10);
  });
});

describe('small fields', () => {
  it('reads the year of a date', () => {
    expect(yearOf('1999-03-31')).toBe(1999);
    expect(yearOf('')).toBeNull();
    expect(yearOf('1999')).toBeNull();
    expect(yearOf('0001-01-01')).toBeNull();
  });

  it('takes a real language code only', () => {
    expect(languageOf('de')).toBe('de');
    expect(languageOf('xx')).toBeNull();
    expect(languageOf('EN')).toBeNull();
    expect(languageOf(null)).toBeNull();
  });

  it('finds the age rating of the country', () => {
    const movie = {
      release_dates: {
        results: [
          { iso_3166_1: 'US', release_dates: [{ certification: '' }, { certification: 'PG-13' }] },
          { iso_3166_1: 'DE', release_dates: [{ certification: '12' }] },
        ],
      },
    };
    expect(ageRatingOf(movie, 'US')).toBe('PG-13');
    expect(ageRatingOf(movie, 'DE')).toBe('12');
    expect(ageRatingOf(movie, 'FR')).toBeNull();
    expect(
      ageRatingOf({ content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] } }, 'US'),
    ).toBe('TV-MA');
  });

  it('does not store "Season 2" as the name of season 2', () => {
    expect(seasonNameOf('Season 2', 2)).toBeNull();
    expect(seasonNameOf('Staffel 2', 2)).toBeNull();
    expect(seasonNameOf('Season 2', 3)).toBe('Season 2');
    expect(seasonNameOf('The Abyss', 2)).toBe('The Abyss');
  });
});

describe('pickLogo', () => {
  const logos = [
    { file_path: '/other.png', iso_639_1: 'ja', vote_average: 10 },
    { file_path: '/plain.png', iso_639_1: null, vote_average: 9 },
    { file_path: '/en-low.png', iso_639_1: 'en', vote_average: 2 },
    { file_path: '/en-high.svg', iso_639_1: 'en', vote_average: 8 },
    { file_path: '/de.png', iso_639_1: 'de', vote_average: 1 },
  ];

  it('prefers the wanted language, then English, then no words', () => {
    expect(pickLogo(logos, 'de-DE')).toBe('/de.png');
    expect(pickLogo(logos, 'fr-FR')).toBe('/en-high.png');
    expect(pickLogo(logos.slice(0, 2), 'fr')).toBe('/plain.png');
  });

  it('takes none in a language nobody asked for', () => {
    expect(pickLogo(logos.slice(0, 1), 'fr')).toBeNull();
    expect(pickLogo(undefined, 'en')).toBeNull();
  });
});

describe('seasons and episodes', () => {
  it('orders seasons and leaves out empty ones', () => {
    expect(
      seasonsOf({
        seasons: [
          { season_number: 2, name: 'Two', episode_count: 3 },
          { season_number: 1, name: 'Season 1', episode_count: 8 },
          { season_number: 3, episode_count: 0 },
          { name: 'No number', episode_count: 4 },
        ],
      }),
    ).toEqual([
      { number: 1, name: null, episodeCount: 8 },
      { number: 2, name: 'Two', episodeCount: 3 },
    ]);
  });

  it('orders episodes, names the nameless and keeps each number once', () => {
    expect(
      episodesOf([
        { episode_number: 2, name: '', still_path: '/b.jpg' },
        { episode_number: 1, name: 'Pilot', overview: 'It begins.' },
        { episode_number: 2, name: 'Again' },
        { episode_number: -1, name: 'Negative' },
        { name: 'No number' },
      ]),
    ).toEqual([
      { number: 1, name: 'Pilot', synopsis: 'It begins.', still: null },
      { number: 2, name: 'Episode 2', synopsis: null, still: '/b.jpg' },
    ]);
    expect(episodesOf(undefined)).toEqual([]);
  });
});

describe('titles', () => {
  it('turns a search hit into a result, or drops it', () => {
    expect(
      toSearchResult(
        'tv',
        { id: 7, name: 'Show', original_name: 'Show', first_air_date: '2020-01-01' },
        'https://img.example/w185',
      ),
    ).toEqual({
      id: 'tv:7',
      type: 'SERIES',
      name: 'Show',
      originalName: null,
      releaseYear: 2020,
      overview: null,
      posterUrl: null,
    });
    expect(toSearchResult('movie', { id: 7 }, '')).toBeNull();
    expect(toSearchResult('movie', { title: 'No id' }, '')).toBeNull();
  });

  it('reads a title, with each genre once', () => {
    const title = toImportedTitle(
      'movie',
      {
        id: 1,
        title: 'Film',
        original_title: 'Le Film',
        genres: [{ name: 'Drama' }, { name: 'Drama' }, { name: '' }, {}],
        original_language: 'fr',
      },
      { language: 'en-US', region: 'US' },
    );
    expect(title).toMatchObject({
      id: 'movie:1',
      type: 'MOVIE',
      name: 'Film',
      originalName: 'Le Film',
      genres: ['Drama'],
      originalLanguage: 'fr',
      seasons: [],
      artwork: { poster: null, backdrop: null, logo: null },
    });
  });

  it('refuses an answer without a name', () => {
    expect(() => toImportedTitle('movie', { id: 1 }, { language: 'en', region: 'US' })).toThrow();
    expect(() =>
      toImportedTitle('movie', { title: 'X' }, { language: 'en', region: 'US' }),
    ).toThrow();
  });
});
