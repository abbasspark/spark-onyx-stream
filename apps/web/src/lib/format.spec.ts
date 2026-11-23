// SPDX-License-Identifier: AGPL-3.0-only
import {
  describeLength,
  formatClock,
  formatDay,
  formatMinutes,
  formatRating,
  formatRuntime,
  groupCrew,
  isoDuration,
  truncate,
} from './format';
import type { TitleCard } from './types';

describe('formatRuntime', () => {
  it('writes hours and minutes the way people say them', () => {
    expect(formatRuntime(102 * 60_000)).toBe('1 h 42 min');
    expect(formatRuntime(120 * 60_000)).toBe('2 h');
    expect(formatRuntime(47 * 60_000)).toBe('47 min');
    expect(formatRuntime(20_000)).toBe('under a minute');
  });

  it('has nothing to say about an unknown length', () => {
    expect(formatRuntime(null)).toBeNull();
    expect(formatRuntime(0)).toBeNull();
  });
});

describe('formatClock', () => {
  it('shows hours only when there are any', () => {
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(245)).toBe('4:05');
    expect(formatClock(3723)).toBe('1:02:03');
  });

  it('treats values a player reports before it knows better as zero', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('isoDuration', () => {
  it('writes the form search engines read', () => {
    expect(isoDuration(102 * 60_000)).toBe('PT1H42M');
    expect(isoDuration(120 * 60_000)).toBe('PT2H');
    expect(isoDuration(47 * 60_000)).toBe('PT47M');
    expect(isoDuration(10_000)).toBe('PT1M');
    expect(isoDuration(null)).toBeUndefined();
  });
});

describe('describeLength', () => {
  const card = { type: 'MOVIE', durationMs: 5_400_000, seasonCount: 0, episodeCount: 0 };

  it('gives a movie its running time and a series its size', () => {
    expect(describeLength(card as TitleCard)).toBe('1 h 30 min');
    const series = { ...card, type: 'SERIES', durationMs: null };
    expect(describeLength({ ...series, seasonCount: 1, episodeCount: 1 } as TitleCard)).toBe(
      '1 episode',
    );
    expect(describeLength({ ...series, seasonCount: 1, episodeCount: 8 } as TitleCard)).toBe(
      '8 episodes',
    );
    expect(describeLength({ ...series, seasonCount: 3, episodeCount: 30 } as TitleCard)).toBe(
      '3 seasons',
    );
  });
});

describe('truncate', () => {
  it('leaves a short text alone and tidies its spaces', () => {
    expect(truncate('  A  night\ntrain. ', 50)).toBe('A night train.');
  });

  it('cuts at a word and marks the cut', () => {
    const cut = truncate('A night train crosses the border while a storm closes every road.', 40);
    expect(cut).toBe('A night train crosses the border while…');
    expect(cut.length).toBeLessThanOrEqual(40);
  });

  it('cuts inside a word when there is no good place to break', () => {
    expect(truncate('Supercalifragilisticexpialidocious', 10)).toBe('Supercali…');
  });
});

describe('facts of a title', () => {
  it('writes a day, a length in minutes and a rating', () => {
    expect(formatDay('2024-03-14')).toBe('March 14, 2024');
    expect(formatDay(null)).toBeNull();
    expect(formatDay('soon')).toBeNull();
    expect(formatMinutes(118)).toBe('1 h 58 min');
    expect(formatMinutes(0)).toBeNull();
    expect(formatMinutes(undefined)).toBeNull();
    expect(formatRating(8)).toBe('8.0');
    expect(formatRating(0)).toBeNull();
    expect(formatRating(null)).toBeNull();
  });
});

describe('groupCrew', () => {
  it('puts people of one job together, in the order the jobs come', () => {
    const crew = [
      { slug: 'leni', role: 'Director' },
      { slug: 'sam', role: 'Writer' },
      { slug: 'leni', role: 'Writer' },
      { slug: 'ada', role: 'Director' },
      { slug: 'ada', role: 'Director' },
      { slug: 'noor', role: null },
    ];
    expect(
      groupCrew(crew).map((group) => [group.job, group.people.map((person) => person.slug)]),
    ).toEqual([
      ['Director', ['leni', 'ada']],
      ['Writer', ['sam', 'leni']],
      ['Crew', ['noor']],
    ]);
    expect(groupCrew([])).toEqual([]);
  });
});
