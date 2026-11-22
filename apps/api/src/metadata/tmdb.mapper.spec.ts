// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  ageRatingOf,
  cleanLongText,
  cleanText,
  creditsOf,
  dateOf,
  episodesOf,
  factsOf,
  languageOf,
  MAX_CAST,
  minutesOf,
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
          {
            season_number: 2,
            name: 'Two',
            episode_count: 3,
            air_date: '2022-01-10',
            poster_path: '/s2.jpg',
          },
          { season_number: 1, name: 'Season 1', episode_count: 8, air_date: 'soon' },
          { season_number: 3, episode_count: 0 },
          { name: 'No number', episode_count: 4 },
        ],
      }),
    ).toEqual([
      { number: 1, name: null, episodeCount: 8, airDate: null, poster: null },
      { number: 2, name: 'Two', episodeCount: 3, airDate: '2022-01-10', poster: '/s2.jpg' },
    ]);
  });

  it('orders episodes, names the nameless and keeps each number once', () => {
    expect(
      episodesOf([
        { episode_number: 2, name: '', still_path: '/b.jpg' },
        {
          episode_number: 1,
          name: 'Pilot',
          overview: 'It begins.',
          air_date: '2021-09-05',
          runtime: 52,
        },
        { episode_number: 2, name: 'Again' },
        { episode_number: -1, name: 'Negative' },
        { name: 'No number' },
      ]),
    ).toEqual([
      {
        number: 1,
        name: 'Pilot',
        synopsis: 'It begins.',
        still: null,
        airDate: '2021-09-05',
        runtimeMinutes: 52,
      },
      {
        number: 2,
        name: 'Episode 2',
        synopsis: null,
        still: '/b.jpg',
        airDate: null,
        runtimeMinutes: null,
      },
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

describe('facts', () => {
  it('reads the facts of a movie', () => {
    expect(
      factsOf('movie', {
        release_date: '1999-03-31',
        runtime: 136,
        production_countries: [
          { iso_3166_1: 'US' },
          { iso_3166_1: 'AU' },
          { iso_3166_1: 'US' },
          { iso_3166_1: 'usa' },
        ],
        production_companies: [
          { name: 'Village Roadshow' },
          { name: ' Village  Roadshow ' },
          { name: '' },
          { name: 'Silver Pictures' },
        ],
        keywords: { keywords: [{ name: 'hacker' }, { name: 'Hacker' }, { name: 'dystopia' }] },
        imdb_id: 'tt0133093',
        vote_average: 8.219,
        vote_count: 26_000,
        status: 'Released',
      }),
    ).toEqual({
      releaseDate: '1999-03-31',
      runtimeMinutes: 136,
      countries: ['US', 'AU'],
      studios: ['Village Roadshow', 'Silver Pictures'],
      keywords: ['hacker', 'dystopia'],
      imdbId: 'tt0133093',
      rating: 8.2,
      ratingCount: 26_000,
      seriesStatus: null,
      lastAirDate: null,
    });
  });

  it('finds the IMDb id of a movie among its external ids when it is not on the movie itself', () => {
    expect(factsOf('movie', { external_ids: { imdb_id: 'tt0133093' } }).imdbId).toBe('tt0133093');
    expect(factsOf('movie', { imdb_id: 'not-an-id' }).imdbId).toBeNull();
  });

  it('reads the facts of a series from where a series keeps them', () => {
    const facts = factsOf('tv', {
      first_air_date: '2021-09-05',
      last_air_date: '2023-04-02',
      episode_run_time: [0, 48, 52],
      external_ids: { imdb_id: 'tt1234567' },
      imdb_id: 'tt9999999',
      keywords: { results: [{ name: 'ocean' }] },
      status: 'Returning Series',
    });
    expect(facts).toMatchObject({
      releaseDate: '2021-09-05',
      lastAirDate: '2023-04-02',
      runtimeMinutes: 48,
      imdbId: 'tt1234567',
      keywords: ['ocean'],
      seriesStatus: 'RUNNING',
    });
  });

  it('tells how a series stands', () => {
    const status = (value: string) => factsOf('tv', { status: value }).seriesStatus;
    expect(status('Ended')).toBe('ENDED');
    expect(status('Canceled')).toBe('CANCELLED');
    expect(status('In Production')).toBe('UPCOMING');
    expect(status('Planned')).toBe('UPCOMING');
    expect(status('Something new')).toBeNull();
  });

  it('takes nothing that makes no sense', () => {
    expect(
      factsOf('movie', {
        release_date: '1999-02-31',
        runtime: -5,
        imdb_id: 'nm0000206',
        vote_average: 7,
        vote_count: 0,
      }),
    ).toEqual({
      releaseDate: null,
      runtimeMinutes: null,
      countries: [],
      studios: [],
      keywords: [],
      imdbId: null,
      rating: null,
      ratingCount: null,
      seriesStatus: null,
      lastAirDate: null,
    });
    expect(dateOf('1999-03-31')).toBe('1999-03-31');
    expect(dateOf('1999-13-01')).toBeNull();
    expect(dateOf(19990331)).toBeNull();
    expect(minutesOf(90)).toBe(90);
    expect(minutesOf(90.5)).toBeNull();
    expect(minutesOf(100_000)).toBeNull();
  });
});

describe('people', () => {
  const person = (id: number, name: string, extra: object = {}) => ({ id, name, ...extra });

  it('lists the cast of a movie in order, then the crew that matters', () => {
    const credits = creditsOf('movie', {
      credits: {
        cast: [
          person(2, 'Carrie-Anne Moss', { character: 'Trinity', order: 2 }),
          person(1, 'Keanu Reeves', {
            character: 'Neo',
            order: 0,
            profile_path: '/keanu.jpg',
            known_for_department: 'Acting',
          }),
          person(1, 'Keanu Reeves', { character: 'Thomas Anderson', order: 5 }),
          { name: 'No id', character: 'Nobody' },
        ],
        crew: [
          person(10, 'Bill Pope', { job: 'Director of Photography' }),
          person(11, 'A Gaffer', { job: 'Gaffer' }),
          person(12, 'Lana Wachowski', { job: 'Director' }),
          person(13, 'Lilly Wachowski', { job: 'Director' }),
          person(12, 'Lana Wachowski', { job: 'Screenplay' }),
        ],
      },
    });
    expect(credits.map(({ kind, name, role }) => `${kind} ${name}: ${role}`)).toEqual([
      'CAST Keanu Reeves: Neo',
      'CAST Carrie-Anne Moss: Trinity',
      'CREW Lana Wachowski: Director',
      'CREW Lilly Wachowski: Director',
      'CREW Lana Wachowski: Screenplay',
      'CREW Bill Pope: Director of Photography',
    ]);
    expect(credits[0]).toMatchObject({ personId: 1, portrait: '/keanu.jpg', knownFor: 'Acting' });
  });

  it('gives an actor of a series the part played longest, and its makers first', () => {
    const credits = creditsOf('tv', {
      created_by: [person(20, 'Ada Creator')],
      aggregate_credits: {
        cast: [
          person(1, 'Ben Diver', {
            order: 0,
            roles: [
              { character: 'Young Ben', episode_count: 2 },
              { character: 'Ben', episode_count: 30 },
            ],
          }),
        ],
        crew: [
          person(30, 'One Episode', { jobs: [{ job: 'Director', episode_count: 1 }] }),
          person(31, 'Most Episodes', {
            jobs: [
              { job: 'Director', episode_count: 12 },
              { job: 'Writer', episode_count: 3 },
            ],
          }),
        ],
      },
    });
    expect(credits.map(({ name, role }) => `${name}: ${role}`)).toEqual([
      'Ben Diver: Ben',
      'Ada Creator: Creator',
      'Most Episodes: Director',
      'One Episode: Director',
      'Most Episodes: Writer',
    ]);
  });

  it('stops at twenty of the cast and four per job', () => {
    const cast = Array.from({ length: 40 }, (_, index) =>
      person(index + 1, `Actor ${index}`, { order: index }),
    );
    const crew = Array.from({ length: 9 }, (_, index) =>
      person(100 + index, `Producer ${index}`, { job: 'Producer' }),
    );
    const credits = creditsOf('movie', { credits: { cast, crew } });
    expect(credits.filter((credit) => credit.kind === 'CAST')).toHaveLength(MAX_CAST);
    expect(credits.filter((credit) => credit.role === 'Producer')).toHaveLength(4);
  });

  it('copes with a title nobody is listed for', () => {
    expect(creditsOf('movie', {})).toEqual([]);
    expect(creditsOf('tv', { aggregate_credits: {} })).toEqual([]);
  });
});
