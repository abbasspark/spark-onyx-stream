// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { TermField, TermRow } from '@/api/types';
import {
  countOf,
  dirtyCount,
  percent,
  saveItems,
  stateOf,
  teaser,
  valueOf,
  withEdit,
} from './terms';

const FIELDS: TermField[] = [
  { key: 'name', label: 'Name', long: false, maxLength: 200 },
  { key: 'description', label: 'Description', long: true, maxLength: 2000 },
];

function row(over: Partial<TermRow> = {}): TermRow {
  return {
    id: 'c1',
    slug: 'kids',
    original: { name: 'Kids', description: 'For the young.' },
    translation: null,
    titles: 3,
    updatedAt: null,
    ...over,
  };
}

describe('edits', () => {
  it('shows what was typed over what is stored', () => {
    const stored = row({ translation: { name: 'Kinder', description: null } });
    expect(valueOf(stored, {}, 'name')).toBe('Kinder');
    expect(valueOf(stored, { c1: { name: 'Kids DE' } }, 'name')).toBe('Kids DE');
    expect(valueOf(stored, {}, 'description')).toBe('');
  });

  it('forgets an edit that is typed back', () => {
    const stored = row({ translation: { name: 'Kinder', description: null } });
    const edited = withEdit({}, stored, 'name', 'Kinder!');
    expect(dirtyCount(edited)).toBe(1);
    expect(withEdit(edited, stored, 'name', 'Kinder ')).toEqual({});
  });

  it('sends only what changed, with empty texts as none', () => {
    const edits = withEdit(withEdit({}, row(), 'name', ' Kinder '), row(), 'description', ' ');
    // Emptying a field that was empty is no change.
    expect(saveItems(edits)).toEqual([{ id: 'c1', texts: { name: 'Kinder' } }]);
    const stored = row({ translation: { name: 'Kinder', description: 'Alt' } });
    expect(saveItems(withEdit({}, stored, 'description', ''))).toEqual([
      { id: 'c1', texts: { description: null } },
    ]);
  });
});

describe('stateOf', () => {
  it('tells done from partly from missing', () => {
    expect(stateOf(row(), {}, FIELDS)).toBe('missing');
    expect(stateOf(row({ translation: { name: 'Kinder', description: null } }), {}, FIELDS)).toBe(
      'partly',
    );
    expect(
      stateOf(row({ translation: { name: 'Kinder', description: 'Für die Jungen.' } }), {}, FIELDS),
    ).toBe('done');
  });

  it('asks only for texts the term has itself', () => {
    const plain = row({ original: { name: 'Kids', description: null } });
    expect(stateOf(plain, { c1: { name: 'Kinder' } }, FIELDS)).toBe('done');
  });
});

describe('small helpers', () => {
  it('rounds a share and treats nothing as all', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(100);
    expect(percent(5, 4)).toBe(100);
  });

  it('cuts the long text for a line', () => {
    expect(teaser(row(), FIELDS)).toBe('For the young.');
    expect(
      teaser(row({ original: { name: 'Kids', description: 'x'.repeat(200) } }), FIELDS, 10),
    ).toBe(`${'x'.repeat(10)}…`);
    expect(teaser(row({ original: { name: 'Kids', description: null } }), FIELDS)).toBeNull();
  });

  it('counts in words', () => {
    expect(countOf('people', 1)).toBe('1 person');
    expect(countOf('genres', 4)).toBe('4 genres');
  });
});
