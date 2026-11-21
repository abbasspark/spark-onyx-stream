// SPDX-License-Identifier: AGPL-3.0-only
import { browseHref, parseBrowseParams } from './browse';

describe('parseBrowseParams', () => {
  it('reads a full address', () => {
    expect(
      parseBrowseParams({ type: 'SERIES', category: 'drama', sort: 'name', page: '3' }),
    ).toEqual({ type: 'SERIES', category: 'drama', featured: false, sort: 'name', page: 3 });
  });

  it('falls back to defaults for anything it does not know', () => {
    expect(
      parseBrowseParams({ type: 'GAME', sort: 'secret', page: '-2', featured: 'yes' }),
    ).toEqual({ type: undefined, category: undefined, featured: false, sort: 'newest', page: 1 });
    expect(parseBrowseParams({ page: '1.5' }).page).toBe(1);
    expect(parseBrowseParams({ page: 'abc' }).page).toBe(1);
  });

  it('takes the first value when one is given twice', () => {
    expect(parseBrowseParams({ type: ['MOVIE', 'SERIES'] }).type).toBe('MOVIE');
  });
});

describe('browseHref', () => {
  const state = parseBrowseParams({ type: 'MOVIE', category: 'drama', page: '4' });

  it('leaves defaults out of the address', () => {
    expect(browseHref(parseBrowseParams({}))).toBe('/browse');
    expect(browseHref(parseBrowseParams({ sort: 'newest', page: '1' }))).toBe('/browse');
  });

  it('goes back to the first page when a filter changes', () => {
    expect(browseHref(state, { sort: 'year' })).toBe('/browse?type=MOVIE&category=drama&sort=year');
    expect(browseHref(state, { type: undefined })).toBe('/browse?category=drama');
  });

  it('keeps the filters when only the page changes', () => {
    expect(browseHref(state, { page: 5 })).toBe('/browse?type=MOVIE&category=drama&page=5');
    expect(browseHref(state, { page: 1 })).toBe('/browse?type=MOVIE&category=drama');
  });
});
