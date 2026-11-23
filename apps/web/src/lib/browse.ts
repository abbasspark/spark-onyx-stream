// SPDX-License-Identifier: AGPL-3.0-only
import { TITLE_SORTS, type TitleSort, type TitleType } from './types';

/** What the browse page shows, as read from its address. */
export interface BrowseState {
  type?: TitleType;
  category?: string;
  genre?: string;
  featured: boolean;
  sort: TitleSort;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the address. Anything unknown falls back to the default, never to an error. */
export function parseBrowseParams(params: RawParams): BrowseState {
  const type = first(params.type);
  const sort = first(params.sort);
  const page = Number(first(params.page));
  const category = first(params.category)?.trim();
  const genre = first(params.genre)?.trim();

  return {
    type: type === 'MOVIE' || type === 'SERIES' ? type : undefined,
    category: category || undefined,
    genre: genre || undefined,
    featured: first(params.featured) === 'true',
    sort: (TITLE_SORTS as readonly string[]).includes(sort ?? '') ? (sort as TitleSort) : 'newest',
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}

/**
 * The address for a state with some of it changed. Defaults are left out, so
 * every view has exactly one address. Changing a filter goes back to page 1.
 */
export function browseHref(state: BrowseState, changes: Partial<BrowseState> = {}): string {
  const next = { ...state, ...changes };
  if (!('page' in changes)) {
    next.page = 1;
  }

  const params = new URLSearchParams();
  if (next.type) {
    params.set('type', next.type);
  }
  if (next.category) {
    params.set('category', next.category);
  }
  if (next.genre) {
    params.set('genre', next.genre);
  }
  if (next.featured) {
    params.set('featured', 'true');
  }
  if (next.sort !== 'newest') {
    params.set('sort', next.sort);
  }
  if (next.page > 1) {
    params.set('page', String(next.page));
  }
  const search = params.toString();
  return search ? `/browse?${search}` : '/browse';
}
