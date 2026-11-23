// SPDX-License-Identifier: AGPL-3.0-only
import type { Home, HomeRow, TitleCard } from './types';

/** A row as any version of the API sends it: the newer fields may be missing. */
export type RawRow = Pick<HomeRow, 'key' | 'name' | 'category' | 'titles'> &
  Partial<Pick<HomeRow, 'kind' | 'layout' | 'browse'>>;

export interface RawHome {
  hero?: { titles: TitleCard[] } | null;
  rows: RawRow[];
}

/** Where "See all" led before the API said so itself. */
function legacyBrowse(row: RawRow): string {
  if (row.category) {
    return `/browse?category=${row.category.slug}`;
  }
  return row.key === 'featured' ? '/browse?featured=true' : '/browse';
}

/**
 * Brings the home page of the API into the form the website draws.
 *
 * An API from before the page could be arranged sends rows only: then the
 * opening is chosen here as it was then, the viewer's own row comes first,
 * and a featured row of one title is left out because it would only repeat
 * the opening.
 */
export function normalizeHome(raw: RawHome): Home {
  const rows: HomeRow[] = raw.rows.map((row) => ({
    ...row,
    kind: row.kind ?? 'titles',
    layout: row.layout ?? 'poster',
    browse: row.browse === undefined ? legacyBrowse(row) : row.browse,
  }));
  if (raw.hero !== undefined) {
    return { hero: raw.hero && raw.hero.titles.length > 0 ? raw.hero : null, rows };
  }

  const lead = rows.find((row) => row.key === 'featured') ?? rows[0];
  const opening = lead?.titles.find((title) => title.backdrop) ?? lead?.titles[0];
  if (!opening) {
    return { hero: null, rows: [] };
  }
  return {
    hero: { titles: [opening] },
    rows: [
      {
        key: 'continue',
        name: 'Continue watching',
        kind: 'continue',
        layout: 'poster',
        category: null,
        browse: null,
        titles: [],
      },
      ...rows.filter((row) => !(row.key === 'featured' && row.titles.length < 2)),
    ],
  };
}

/** True when the page has nothing to show a visitor: no opening and no row of titles. */
export function isEmptyHome(home: Home): boolean {
  return home.hero === null && !home.rows.some((row) => row.kind === 'titles');
}

/**
 * The address "See all" of a row leads to. Only addresses of this website
 * are followed: anything else an API might send is dropped.
 */
export function rowHref(row: Pick<HomeRow, 'browse'>): string | undefined {
  const path = row.browse;
  return path &&
    /^\/(browse|collection\/)[^/\\]*$/.test(path.split('?')[0] ?? '') &&
    !path.startsWith('//')
    ? path
    : undefined;
}
