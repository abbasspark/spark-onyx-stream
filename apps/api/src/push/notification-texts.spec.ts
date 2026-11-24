// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { newEpisodesText, newTitlesDigestText, newTitleText } from './notification-texts.js';

describe('newEpisodesText', () => {
  it('names one episode', () => {
    expect(newEpisodesText('Signal Fires', [{ season: 2, number: 5, name: 'The Trench' }])).toEqual(
      { title: 'New episode of Signal Fires', body: 'S2 E5 · The Trench' },
    );
  });

  it('does not say "Episode 5" twice', () => {
    expect(
      newEpisodesText('Signal Fires', [{ season: 2, number: 5, name: 'Episode 5' }]).body,
    ).toBe('S2 E5 is here.');
  });

  it('tells of several at once, as a stretch when they follow each other', () => {
    const episode = (season: number, number: number) => ({ season, number, name: 'x' });
    expect(newEpisodesText('Signal Fires', [episode(1, 3), episode(1, 1), episode(1, 2)])).toEqual({
      title: '3 new episodes of Signal Fires',
      body: 'Season 1, episodes 1 to 3.',
    });
    expect(newEpisodesText('Signal Fires', [episode(1, 1), episode(1, 4)]).body).toBe(
      'Season 1: 2 episodes.',
    );
    expect(newEpisodesText('Signal Fires', [episode(1, 8), episode(2, 1)]).body).toBe(
      'Seasons 1 to 2.',
    );
  });

  it('cuts a very long name', () => {
    expect(
      newEpisodesText('x'.repeat(300), [{ season: 1, number: 1, name: 'a' }]).title,
    ).toHaveLength(120);
  });
});

describe('new titles', () => {
  it('uses the tagline of a title, or says what it is', () => {
    expect(
      newTitleText({ name: 'Glass Tide', type: 'MOVIE', tagline: 'The sea keeps score.' }),
    ).toEqual({ title: 'New: Glass Tide', body: 'The sea keeps score.' });
    expect(newTitleText({ name: 'Glass Tide', type: 'SERIES', tagline: ' ' }).body).toBe(
      'A new series to watch.',
    );
  });

  it('names a few of many', () => {
    expect(newTitlesDigestText(['A', 'B', 'C', 'D', 'E'])).toEqual({
      title: '5 new titles',
      body: 'A, B, C and 2 more.',
    });
    expect(newTitlesDigestText(['A', 'B', 'C']).body).toBe('A, B, C.');
  });
});
