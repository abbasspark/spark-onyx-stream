// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { isEmptyHome, normalizeHome, type RawRow, rowHref } from './home';
import type { TitleCard } from './types';

const card = (name: string, backdrop = false) =>
  ({
    id: name,
    name,
    backdrop: backdrop ? { url: '/b.jpg', width: 16, height: 9 } : null,
  }) as TitleCard;
const row = (key: string, titles: TitleCard[], extra: Partial<RawRow> = {}): RawRow => ({
  key,
  name: key,
  category: null,
  titles,
  ...extra,
});

describe('normalizeHome', () => {
  it('takes the page as a newer API arranged it', () => {
    const home = normalizeHome({
      hero: { titles: [card('A'), card('B')] },
      rows: [
        row('section:1', [card('A')], { kind: 'titles', layout: 'landscape', browse: null }),
        row('section:2', [], { kind: 'continue', layout: 'poster', browse: null }),
      ],
    });
    expect(home.hero?.titles.map((title) => title.name)).toEqual(['A', 'B']);
    expect(home.rows.map((entry) => [entry.kind, entry.layout, entry.browse])).toEqual([
      ['titles', 'landscape', null],
      ['continue', 'poster', null],
    ]);
  });

  it('has no opening when the API says there is none', () => {
    expect(normalizeHome({ hero: null, rows: [] }).hero).toBeNull();
    expect(normalizeHome({ hero: { titles: [] }, rows: [] }).hero).toBeNull();
  });

  it('draws the page of an older API as it always was', () => {
    const home = normalizeHome({
      rows: [
        row('featured', [card('Only')]),
        row('latest', [card('Only'), card('Pictured', true)]),
        row('category:drama', [card('Only')], { category: { slug: 'drama', name: 'Drama' } }),
      ],
    });
    // The opening comes from the featured row, which is then left out as a row of one.
    expect(home.hero?.titles.map((title) => title.name)).toEqual(['Only']);
    expect(home.rows.map((entry) => [entry.key, entry.kind, entry.browse])).toEqual([
      ['continue', 'continue', null],
      ['latest', 'titles', '/browse'],
      ['category:drama', 'titles', '/browse?category=drama'],
    ]);
  });

  it('prefers a title with a picture for the opening of an older API', () => {
    const home = normalizeHome({ rows: [row('latest', [card('Plain'), card('Pictured', true)])] });
    expect(home.hero?.titles[0]?.name).toBe('Pictured');
  });
});

describe('isEmptyHome', () => {
  it('is true without an opening and without rows of titles', () => {
    expect(isEmptyHome(normalizeHome({ rows: [] }))).toBe(true);
    expect(
      isEmptyHome(normalizeHome({ hero: null, rows: [row('c', [], { kind: 'continue' })] })),
    ).toBe(true);
    expect(
      isEmptyHome(normalizeHome({ hero: null, rows: [row('a', [card('A')], { kind: 'titles' })] })),
    ).toBe(false);
  });
});

describe('rowHref', () => {
  it('follows addresses of the browse page and of collections', () => {
    expect(rowHref({ browse: '/browse' })).toBe('/browse');
    expect(rowHref({ browse: '/browse?genre=drama&sort=rating' })).toBe(
      '/browse?genre=drama&sort=rating',
    );
    expect(rowHref({ browse: '/collection/the-saga' })).toBe('/collection/the-saga');
  });
  it('drops everything else', () => {
    expect(rowHref({ browse: null })).toBeUndefined();
    expect(rowHref({ browse: 'https://elsewhere.example' })).toBeUndefined();
    expect(rowHref({ browse: '//elsewhere.example/browse' })).toBeUndefined();
    expect(rowHref({ browse: '/account' })).toBeUndefined();
    expect(rowHref({ browse: '/collection/a/b' })).toBeUndefined();
  });
});
