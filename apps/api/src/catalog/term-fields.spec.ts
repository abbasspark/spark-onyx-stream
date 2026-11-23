// SPDX-License-Identifier: AGPL-3.0-only
import {
  cleanTexts,
  isEmpty,
  isTermKind,
  overlay,
  TERM_FIELDS,
  TERM_KINDS,
} from './term-fields.js';

describe('term fields', () => {
  it('starts every kind with the name', () => {
    for (const kind of TERM_KINDS) {
      expect(TERM_FIELDS[kind][0]?.key).toBe('name');
    }
    expect(isTermKind('genres')).toBe(true);
    expect(isTermKind('titles')).toBe(false);
  });
});

describe('cleanTexts', () => {
  it('trims, and turns empty texts into none', () => {
    expect(cleanTexts('categories', { name: '  Dokumentationen ', description: '  ' })).toEqual({
      texts: { name: 'Dokumentationen', description: null },
    });
  });

  it('leaves out what was not sent', () => {
    expect(cleanTexts('people', { biography: 'Geboren 1970.' })).toEqual({
      texts: { biography: 'Geboren 1970.' },
    });
  });

  it('refuses a text the kind does not have, and one that is too long', () => {
    expect(cleanTexts('genres', { name: 'Drama', synopsis: 'x' })).toEqual({
      problem: 'Genres have no text called synopsis',
    });
    expect(cleanTexts('people', { knownFor: 'x'.repeat(61) })).toEqual({
      problem: 'Known for can be 60 characters long, this one has 61',
    });
  });
});

describe('isEmpty', () => {
  it('is true when nothing is left', () => {
    expect(isEmpty({ name: null, description: null })).toBe(true);
    expect(isEmpty({ name: null, description: 'x' })).toBe(false);
  });
});

describe('overlay', () => {
  const genre = { id: 'g1', slug: 'drama', name: 'Drama' };

  it('puts translated texts over the term and keeps the rest', () => {
    expect(overlay('genres', genre, { name: 'Dramat' })).toEqual({ ...genre, name: 'Dramat' });
  });

  it('keeps the text of the catalog where the translation has none', () => {
    const category = { id: 'c1', name: 'Kids', description: 'For the young.' };
    expect(overlay('categories', category, { name: 'Kinder', description: null })).toEqual({
      id: 'c1',
      name: 'Kinder',
      description: 'For the young.',
    });
    expect(overlay('categories', category, undefined)).toBe(category);
  });

  it('adds no field the term does not carry', () => {
    expect(overlay('people', { id: 'p1', name: 'Ana' }, { name: 'Ана', biography: 'x' })).toEqual({
      id: 'p1',
      name: 'Ана',
    });
  });
});
