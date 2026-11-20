// SPDX-License-Identifier: AGPL-3.0-only
import { MAX_SLUG_LENGTH, SLUG_PATTERN, slugify, uniqueSlug } from './slug.js';

describe('slugify', () => {
  it('makes readable slugs from names', () => {
    expect(slugify('The Long Road (2024)')).toBe('the-long-road-2024');
    expect(slugify('  Hello,   World!  ')).toBe('hello-world');
    expect(slugify("Don't Look Up")).toBe('dont-look-up');
    expect(slugify('Season 1: Episode 2')).toBe('season-1-episode-2');
  });

  it('removes accents from Latin letters', () => {
    expect(slugify('Amélie à Zürich')).toBe('amelie-a-zurich');
    expect(slugify('Señorita Ñandú')).toBe('senorita-nandu');
  });

  it('keeps letters of other scripts', () => {
    expect(slugify('الطريق الطويل')).toBe('الطريق-الطويل');
    expect(slugify('東京 物語')).toBe('東京-物語');
  });

  it('returns nothing for names without letters or digits', () => {
    expect(slugify('!!! ???')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('limits the length without ending on a dash', () => {
    const slug = slugify(`${'word '.repeat(40)}`);

    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('always produces slugs that match the pattern', () => {
    for (const name of [
      'The Long Road',
      'Amélie',
      'الطريق الطويل',
      'A--B__C',
      '2001: A Space Odyssey',
    ]) {
      expect(slugify(name)).toMatch(SLUG_PATTERN);
    }
    expect('Not A Slug').not.toMatch(SLUG_PATTERN);
    expect('double--dash').not.toMatch(SLUG_PATTERN);
    expect('-leading').not.toMatch(SLUG_PATTERN);
  });
});

describe('uniqueSlug', () => {
  const taken = (used: string[]) => async (slug: string) => used.includes(slug);

  it('keeps a free slug', async () => {
    expect(await uniqueSlug('the-film', taken([]))).toBe('the-film');
  });

  it('adds a number when the slug is in use', async () => {
    expect(await uniqueSlug('the-film', taken(['the-film']))).toBe('the-film-2');
    expect(await uniqueSlug('the-film', taken(['the-film', 'the-film-2']))).toBe('the-film-3');
  });

  it('uses a placeholder for an empty slug', async () => {
    expect(await uniqueSlug('', taken([]))).toBe('untitled');
    expect(await uniqueSlug('', taken(['untitled']))).toBe('untitled-2');
  });

  it('stays within the length limit when adding a number', async () => {
    const long = 'a'.repeat(MAX_SLUG_LENGTH);

    const slug = await uniqueSlug(long, taken([long]));

    expect(slug).toHaveLength(MAX_SLUG_LENGTH);
    expect(slug.endsWith('-2')).toBe(true);
  });
});
