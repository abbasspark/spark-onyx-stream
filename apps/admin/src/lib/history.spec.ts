// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import type { TitleChange, TitleRevision } from '@/api/types';
import {
  actionLabel,
  changeLabel,
  changesCount,
  dayHeading,
  formatValue,
  groupByDay,
  listItems,
  wordDiff,
} from './history';

const change = (over: Partial<TitleChange>): TitleChange => ({
  group: 'texts',
  field: 'name',
  label: 'Name',
  kind: 'value',
  ...over,
});

describe('labels', () => {
  it('names what was done, also what it does not know', () => {
    expect(actionLabel('publish')).toBe('Published');
    expect(actionLabel('something_new')).toBe('Something new');
  });

  it('names the language of a translated text', () => {
    expect(changeLabel(change({ field: 'translation:de:synopsis', label: 'de: synopsis' }))).toBe(
      'German: synopsis',
    );
    expect(changeLabel(change({}))).toBe('Name');
    expect(listItems(change({ field: 'languages' }), ['de', 'fr'])).toEqual(['German', 'French']);
    expect(listItems(change({ field: 'genres' }), ['Drama'])).toEqual(['Drama']);
  });
});

describe('formatValue', () => {
  it('shows values the way their kind asks for', () => {
    expect(formatValue(change({ format: 'money' }), '399', 'EUR')).toBe('€3.99');
    expect(formatValue(change({ format: 'status' }), 'PUBLISHED', 'EUR')).toBe('Published');
    expect(formatValue(change({ format: 'yesno' }), 'true', 'EUR')).toBe('Yes');
    expect(formatValue(change({ format: 'yesno' }), 'false', 'EUR')).toBe('No');
    expect(formatValue(change({ format: 'picture' }), 'abc', 'EUR')).toBe('A picture');
    expect(formatValue(change({}), 'Harbour Lights', 'EUR')).toBe('Harbour Lights');
    expect(formatValue(change({}), null, 'EUR')).toBeNull();
  });
});

describe('wordDiff', () => {
  it('keeps what stayed and marks what went and came', () => {
    expect(wordDiff('A port town in winter.', 'A small port town in spring.')).toEqual([
      { kind: 'same', text: 'A ' },
      { kind: 'added', text: 'small ' },
      { kind: 'same', text: 'port town in ' },
      { kind: 'removed', text: 'winter.' },
      { kind: 'added', text: 'spring.' },
    ]);
  });

  it('handles texts that share nothing, and equal ones', () => {
    expect(wordDiff('tbd', 'Done')).toEqual([
      { kind: 'removed', text: 'tbd' },
      { kind: 'added', text: 'Done' },
    ]);
    expect(wordDiff('Same text', 'Same text')).toEqual([{ kind: 'same', text: 'Same text' }]);
  });

  it('does not compare very long texts word by word', () => {
    const long = 'word '.repeat(900);
    expect(wordDiff(long, `${long}more`)).toHaveLength(2);
  });
});

describe('days', () => {
  const revision = (id: string, createdAt: string) =>
    ({
      id,
      createdAt,
      action: 'update',
      admin: null,
      changes: [],
      changeCount: 0,
      first: false,
    }) as TitleRevision;

  it('puts revisions under their day', () => {
    const days = groupByDay([
      revision('c', '2026-11-23T15:00:00'),
      revision('b', '2026-11-23T09:00:00'),
      revision('a', '2026-11-20T09:00:00'),
    ]);
    expect(days.map((day) => [day.day, day.revisions.map((entry) => entry.id)])).toEqual([
      ['2026-11-23', ['c', 'b']],
      ['2026-11-20', ['a']],
    ]);
  });

  it('calls the last two days by name', () => {
    const now = new Date('2026-11-23T12:00:00');
    expect(dayHeading('2026-11-23', now)).toBe('Today');
    expect(dayHeading('2026-11-22', now)).toBe('Yesterday');
    expect(dayHeading('2026-11-20', now)).toContain('2026');
  });

  it('counts changes in words', () => {
    expect(changesCount(1)).toBe('1 change');
    expect(changesCount(12)).toBe('12 changes');
  });
});
