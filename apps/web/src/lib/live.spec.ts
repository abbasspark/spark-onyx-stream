// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import {
  channelByNumber,
  formatBehind,
  isLocked,
  liveHref,
  moreBeginWith,
  neighbour,
  onNow,
  placeOf,
  positionAt,
  programmeAt,
  progressOf,
  refusalOf,
  startOverPosition,
} from './live';
import type { Channel } from './types';

const channel = (slug: string, change: Partial<Channel> = {}): Channel => ({
  slug,
  name: slug,
  number: null,
  description: null,
  access: 'FREE',
  packageIds: [],
  onAir: true,
  ...change,
});

describe('isLocked', () => {
  const paid = channel('cartoons', { access: 'PAID', packageIds: ['kids'] });

  it('never locks a free channel', () => {
    expect(isLocked(channel('news'), null)).toBe(false);
  });

  it('locks a paid channel for those without a plan that opens it', () => {
    expect(isLocked(paid, null)).toBe(true);
    expect(isLocked(paid, { all: false, packageIds: ['sports'] })).toBe(true);
    expect(isLocked(paid, { all: false, packageIds: ['kids'] })).toBe(false);
    expect(isLocked(paid, { all: true, packageIds: [] })).toBe(false);
  });

  it('opens a paid channel in no package only to plans that open everything', () => {
    const unsorted = channel('extra', { access: 'PAID' });
    expect(isLocked(unsorted, { all: false, packageIds: ['kids'] })).toBe(true);
    expect(isLocked(unsorted, { all: true, packageIds: [] })).toBe(false);
  });
});

describe('neighbour', () => {
  const lineup = [channel('one'), channel('two'), channel('three')];

  it('steps through the lineup and goes round at the ends', () => {
    expect(neighbour(lineup, 'one', 1)?.slug).toBe('two');
    expect(neighbour(lineup, 'three', 1)?.slug).toBe('one');
    expect(neighbour(lineup, 'one', -1)?.slug).toBe('three');
  });

  it('has nowhere to go from a single or an unknown channel', () => {
    expect(neighbour([channel('one')], 'one', 1)).toBeNull();
    expect(neighbour(lineup, 'nine', 1)).toBeNull();
  });
});

describe('refusalOf', () => {
  it('tells the ways a channel can be closed apart', () => {
    expect(refusalOf(401, undefined)).toBe('sign-in');
    expect(refusalOf(402, 'subscription_required')).toBe('subscribe');
    expect(refusalOf(402, 'plan_required')).toBe('other-plan');
    expect(refusalOf(403, 'email_unverified')).toBe('confirm-email');
    expect(refusalOf(403, undefined)).toBe('closed');
    expect(refusalOf(409, 'off_air')).toBe('off-air');
    expect(refusalOf(404, undefined)).toBe('gone');
    expect(refusalOf(500, undefined)).toBe('failed');
  });
});

describe('liveHref', () => {
  it('leads to the page that plays a channel', () => {
    expect(liveHref('news-24')).toBe('/live/news-24');
  });
});

describe('the guide', () => {
  const at = (time: string) => Date.parse(`2026-11-22T${time}:00.000Z`);
  const programme = (title: string, from: string, to: string) => ({
    title,
    subtitle: null,
    description: null,
    category: null,
    startsAt: new Date(at(from)).toISOString(),
    endsAt: new Date(at(to)).toISOString(),
  });
  const news = programme('News', '18:00', '19:00');
  const film = programme('Film', '19:00', '21:00');

  it('knows how far a programme has run', () => {
    expect(progressOf(news, at('18:00'))).toBe(0);
    expect(progressOf(news, at('18:15'))).toBe(0.25);
    expect(progressOf(news, at('20:00'))).toBe(1);
    expect(progressOf(news, at('17:00'))).toBe(0);
  });

  it('moves on from what was known when the page was made', () => {
    const known = { now: news, next: film };
    expect(onNow(known, at('18:30'))).toEqual({ now: news, next: film });
    // The page is older than the programme: what was next is on now.
    expect(onNow(known, at('19:30'))).toEqual({ now: film, next: null });
    expect(onNow(known, at('22:00'))).toEqual({ now: null, next: null });
    expect(onNow({ now: null, next: film }, at('18:30'))).toEqual({ now: null, next: film });
    expect(onNow({}, at('18:30'))).toEqual({ now: null, next: null });
  });

  it('places a programme in the stretch that is shown, cut at its ends', () => {
    const from = at('18:00');
    const to = at('22:00');
    expect(placeOf(news, from, to)).toEqual({ start: 0, width: 0.25 });
    expect(placeOf(film, from, to)).toEqual({ start: 0.25, width: 0.5 });
    expect(placeOf(programme('Early', '17:00', '18:30'), from, to)).toEqual({
      start: 0,
      width: 0.125,
    });
    expect(placeOf(programme('Gone', '15:00', '16:00'), from, to)).toBeNull();
  });
});

describe('going back in time', () => {
  it('writes how far behind a viewer is as a clock', () => {
    expect(formatBehind(45)).toBe('0:45');
    expect(formatBehind(754)).toBe('12:34');
    expect(formatBehind(3723)).toBe('1:02:03');
    expect(formatBehind(-3)).toBe('0:00');
  });

  it('finds where the running programme began', () => {
    // Position 0 of the video is 18:00:00, and the programme began at 18:10.
    const zeroAt = Date.parse('2026-11-22T18:00:00.000Z');
    const began = '2026-11-22T18:10:00.000Z';
    expect(startOverPosition(began, zeroAt, 0, 1500)).toBe(600);
    // That moment has already been deleted.
    expect(startOverPosition(began, zeroAt, 700, 1500)).toBeNull();
    // The viewer is at the start already.
    expect(startOverPosition(began, zeroAt, 0, 610)).toBeNull();
    // The player cannot say what time its positions stand for.
    expect(startOverPosition(began, null, 0, 1500)).toBeNull();
  });
});

describe('channelByNumber', () => {
  const channels = [{ number: 1 }, { number: 2 }, { number: 12 }, { number: null }];

  it('finds a channel by its whole number', () => {
    expect(channelByNumber(channels, 12)).toEqual({ number: 12 });
  });

  it('does not take 1 for the start of 12', () => {
    expect(channelByNumber(channels, 1)).toEqual({ number: 1 });
  });

  it('gives nothing for a number no channel has', () => {
    expect(channelByNumber(channels, 7)).toBeNull();
  });
});

describe('moreBeginWith', () => {
  const channels = [{ number: 1 }, { number: 2 }, { number: 12 }];

  it('says so while another channel begins with the digits typed', () => {
    expect(moreBeginWith(channels, '1')).toBe(true);
  });

  it('says no once nothing longer could follow', () => {
    expect(moreBeginWith(channels, '2')).toBe(false);
    expect(moreBeginWith(channels, '12')).toBe(false);
  });
});

describe('positionAt', () => {
  const range = { start: 0, end: 600 };
  // Position 0 of the video stands for this moment in the world.
  const zeroAt = Date.parse('2026-11-24T20:00:00.000Z');

  it('turns a moment of the world into a place in the video', () => {
    expect(positionAt(zeroAt + 300_000, zeroAt, range)).toBe(300);
  });

  it('gives nothing without a moment to count from', () => {
    expect(positionAt(zeroAt, null, range)).toBeNull();
    expect(positionAt(zeroAt, zeroAt, null)).toBeNull();
  });

  it('gives nothing for a moment that is no longer kept', () => {
    expect(positionAt(zeroAt - 60_000, zeroAt, range)).toBeNull();
  });

  it('gives nothing for a moment that has not come yet', () => {
    expect(positionAt(zeroAt + 900_000, zeroAt, range)).toBeNull();
  });
});

describe('programmeAt', () => {
  const programmes = [
    {
      title: 'News',
      subtitle: null,
      description: null,
      category: null,
      startsAt: '2026-11-24T20:00:00.000Z',
      endsAt: '2026-11-24T20:30:00.000Z',
    },
    {
      title: 'Film',
      subtitle: null,
      description: null,
      category: null,
      startsAt: '2026-11-24T20:30:00.000Z',
      endsAt: '2026-11-24T22:00:00.000Z',
    },
  ];

  it('names what is on at a moment', () => {
    expect(programmeAt(programmes, Date.parse('2026-11-24T21:00:00.000Z'))?.title).toBe('Film');
  });

  it('gives the next programme at the moment one ends', () => {
    expect(programmeAt(programmes, Date.parse('2026-11-24T20:30:00.000Z'))?.title).toBe('Film');
  });

  it('gives nothing outside what the guide says', () => {
    expect(programmeAt(programmes, Date.parse('2026-11-24T19:00:00.000Z'))).toBeNull();
  });
});
