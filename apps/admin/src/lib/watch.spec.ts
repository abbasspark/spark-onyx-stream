// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { countIn, intervalText, parseTmdbReference, placeOf, recognisedAs } from './watch';

describe('watched locations in words', () => {
  it('say where they are', () => {
    expect(placeOf({ driver: 'LOCAL', config: { basePath: '/watch/in' } })).toBe('/watch/in');
    const bucket = {
      bucket: 'incoming',
      region: 'us-east-1',
      forcePathStyle: false,
      accessKeyId: 'k',
      secretAccessKeySet: true as const,
    };
    expect(placeOf({ driver: 'S3', config: bucket })).toBe('incoming');
    expect(placeOf({ driver: 'S3', config: { ...bucket, keyPrefix: 'films' } })).toBe(
      'incoming/films',
    );
  });

  it('say how often they are looked through', () => {
    expect(intervalText(1)).toBe('every minute');
    expect(intervalText(5)).toBe('every 5 minutes');
    expect(intervalText(60)).toBe('every hour');
    expect(intervalText(120)).toBe('every 2 hours');
    expect(intervalText(90)).toBe('every 90 minutes');
    expect(intervalText(1440)).toBe('once a day');
  });

  it('count their files by state', () => {
    const counts = { FAILED: 2, CONFLICT: 1, IMPORTED: 40 };
    expect(countIn(counts, ['UNRECOGNISED', 'CONFLICT', 'FAILED'])).toBe(3);
    expect(countIn({}, ['FAILED'])).toBe(0);
  });
});

describe('recognisedAs', () => {
  it('names a movie and an episode', () => {
    expect(recognisedAs({ metadataId: 'movie:603', seasonNumber: null, episodeNumber: null })).toBe(
      'Movie 603',
    );
    expect(recognisedAs({ metadataId: 'tv:1399', seasonNumber: 1, episodeNumber: 5 })).toBe(
      'Series 1399 · S01E05',
    );
    expect(recognisedAs({ metadataId: null, seasonNumber: null, episodeNumber: null })).toBeNull();
  });
});

describe('parseTmdbReference', () => {
  it('reads a number, a tagged id and an address of TMDB', () => {
    expect(parseTmdbReference(' 603 ')).toEqual({ id: 603, kind: null });
    expect(parseTmdbReference('tv:1399')).toEqual({ id: 1399, kind: 'SERIES' });
    expect(parseTmdbReference('movie/603')).toEqual({ id: 603, kind: 'MOVIE' });
    expect(parseTmdbReference('https://www.themoviedb.org/movie/603-the-matrix')).toEqual({
      id: 603,
      kind: 'MOVIE',
    });
    expect(parseTmdbReference('themoviedb.org/tv/1399-game-of-thrones/season/1')).toEqual({
      id: 1399,
      kind: 'SERIES',
    });
  });

  it('is nothing for what holds no id', () => {
    for (const text of ['', 'the matrix', '0', '-5', '12345678901', 'imdb.com/title/tt0133093']) {
      expect(parseTmdbReference(text), text).toBeNull();
    }
  });
});
