// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { ImportReport } from '@/api/types';
import { describeReport, describeSeasons, languageOptions, sourceUrl } from './metadata';

const NOTHING: ImportReport = {
  fields: [],
  categoriesCreated: [],
  genresCreated: [],
  peopleCreated: 0,
  credits: 0,
  seasonsCreated: 0,
  episodesCreated: 0,
  episodesUpdated: 0,
  picturesAdded: 0,
  warnings: [],
};

describe('describeReport', () => {
  it('says when there was nothing to add', () => {
    expect(describeReport(NOTHING)).toBe(
      'Nothing to add: the title has everything the source offers.',
    );
  });

  it('names the fields in words', () => {
    expect(describeReport({ ...NOTHING, fields: ['poster'] })).toBe('Filled poster.');
    expect(describeReport({ ...NOTHING, fields: ['tagline', 'releaseYear', 'poster'] })).toBe(
      'Filled tagline, year and poster.',
    );
  });

  it('counts seasons, episodes and new categories', () => {
    expect(
      describeReport({
        ...NOTHING,
        seasonsCreated: 2,
        episodesCreated: 1,
        episodesUpdated: 3,
        categoriesCreated: ['Drama'],
      }),
    ).toBe('Added 2 seasons and 1 episode. Updated 3 episodes. Created the category Drama.');
  });
});

describe('describeSeasons', () => {
  it('adds up the episodes', () => {
    expect(
      describeSeasons([
        { number: 1, name: null, episodeCount: 8 },
        { number: 2, name: null, episodeCount: 1 },
      ]),
    ).toBe('2 seasons, 9 episodes');
    expect(describeSeasons([{ number: 1, name: null, episodeCount: 1 }])).toBe(
      '1 season, 1 episode',
    );
    expect(describeSeasons([])).toBeNull();
  });
});

describe('languageOptions', () => {
  it('adds a default that is not in the list', () => {
    expect(languageOptions('en-US')[0]).toEqual({ value: 'en-US', label: 'English' });
    expect(languageOptions('fi-FI')[0]).toEqual({ value: 'fi-FI', label: 'fi-FI' });
  });
});

describe('sourceUrl', () => {
  it('leads to the entry on the site of the source', () => {
    expect(sourceUrl('movie:603')).toBe('https://www.themoviedb.org/movie/603');
    expect(sourceUrl('tv:1399')).toBe('https://www.themoviedb.org/tv/1399');
    expect(sourceUrl('nonsense')).toBeNull();
  });
});
