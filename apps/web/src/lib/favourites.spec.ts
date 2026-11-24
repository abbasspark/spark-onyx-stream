// SPDX-License-Identifier: AGPL-3.0-only
import { favouritesFirst, matching, parseFavourites, withFavourite } from './favourites';

const channels = [
  { slug: 'nord-one', name: 'Nord One', number: 1 },
  { slug: 'nord-two', name: 'Nord Two', number: 2 },
  { slug: 'harbour', name: 'Harbour TV', number: 12 },
];

describe('parseFavourites', () => {
  it('gives nothing for nothing, and for anything that is not a list', () => {
    expect(parseFavourites(null)).toEqual([]);
    expect(parseFavourites('not json')).toEqual([]);
    expect(parseFavourites('{"harbour":true}')).toEqual([]);
  });

  it('keeps the names, in the order they were marked', () => {
    expect(parseFavourites('["harbour","nord-one"]')).toEqual(['harbour', 'nord-one']);
  });

  it('drops anything that could not be a name, and repeats', () => {
    expect(parseFavourites('["harbour",3,"",null,"harbour"]')).toEqual(['harbour']);
  });
});

describe('withFavourite', () => {
  it('puts a channel in', () => {
    expect(withFavourite([], 'harbour')).toEqual(['harbour']);
  });

  it('takes it out again', () => {
    expect(withFavourite(['harbour', 'nord-one'], 'harbour')).toEqual(['nord-one']);
  });

  it('adds at the end, so the order a viewer marked them in holds', () => {
    expect(withFavourite(['harbour'], 'nord-one')).toEqual(['harbour', 'nord-one']);
  });
});

describe('favouritesFirst', () => {
  it('puts the marked channels at the top, in the order they were marked', () => {
    const order = favouritesFirst(channels, ['harbour', 'nord-two']);
    expect(order.map((channel) => channel.slug)).toEqual(['harbour', 'nord-two', 'nord-one']);
  });

  it('leaves the list alone when nothing is marked', () => {
    expect(favouritesFirst(channels, []).map((channel) => channel.slug)).toEqual([
      'nord-one',
      'nord-two',
      'harbour',
    ]);
  });

  it('ignores a mark for a channel that is no longer there', () => {
    const order = favouritesFirst(channels, ['gone', 'harbour']);
    expect(order.map((channel) => channel.slug)).toEqual(['harbour', 'nord-one', 'nord-two']);
  });
});

describe('matching', () => {
  it('matches everything on an empty search', () => {
    expect(matching(channels, '  ')).toHaveLength(3);
  });

  it('matches part of a name, whatever the case', () => {
    expect(matching(channels, 'harb').map((channel) => channel.slug)).toEqual(['harbour']);
  });

  it('matches the start of a number', () => {
    expect(matching(channels, '1').map((channel) => channel.slug)).toEqual(['nord-one', 'harbour']);
  });
});
