// SPDX-License-Identifier: AGPL-3.0-only
import type { Episode, Season, TitleDetail } from './types';
import { episodeCode, findEpisode, firstEpisode, watchHref } from './watch';

function episode(id: string, number: number): Episode {
  return { id, number, name: `Episode ${id}`, synopsis: null, still: null, durationMs: 60_000 };
}

function season(number: number, episodes: Episode[]): Season {
  return { number, name: null, synopsis: null, episodes };
}

const series = {
  seasons: [season(1, [episode('a', 1), episode('b', 2)]), season(2, [episode('c', 1)])],
} as TitleDetail;

describe('findEpisode', () => {
  it('finds the episode, its season and the one after it', () => {
    const place = findEpisode(series, 'a');
    expect(place?.season.number).toBe(1);
    expect(place?.next?.episode.id).toBe('b');
  });

  it('continues with the first episode of the next season', () => {
    const place = findEpisode(series, 'b');
    expect(place?.next).toMatchObject({ season: { number: 2 }, episode: { id: 'c' } });
  });

  it('has nothing after the last episode and nothing for an unknown one', () => {
    expect(findEpisode(series, 'c')?.next).toBeNull();
    expect(findEpisode(series, 'zzz')).toBeNull();
  });
});

describe('firstEpisode', () => {
  it('skips a season without episodes', () => {
    const title = { seasons: [season(1, []), season(2, [episode('x', 4)])] } as TitleDetail;
    expect(firstEpisode(title)?.episode.id).toBe('x');
    expect(firstEpisode({ seasons: [] } as unknown as TitleDetail)).toBeNull();
  });
});

describe('names and addresses', () => {
  it('builds them the same way everywhere', () => {
    expect(episodeCode(2, 5)).toBe('S2 E5');
    expect(watchHref('deep-ocean')).toBe('/watch/deep-ocean');
    expect(watchHref('deep-ocean', 'abc')).toBe('/watch/deep-ocean/abc');
  });
});
