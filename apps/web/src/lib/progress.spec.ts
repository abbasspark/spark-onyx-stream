// SPDX-License-Identifier: AGPL-3.0-only
import { isResumable, MAX_ENTRIES, parseEntries, type WatchEntry, withEntry } from './progress';

function entry(key: string, position = 600, duration = 3600): WatchEntry {
  return {
    key,
    href: `/watch/${key}`,
    name: key,
    detail: null,
    image: null,
    position,
    duration,
    updatedAt: 1,
  };
}

describe('isResumable', () => {
  it('needs a real start and something left to watch', () => {
    expect(isResumable(600, 3600)).toBe(true);
    expect(isResumable(5, 3600)).toBe(false);
    expect(isResumable(3500, 3600)).toBe(false);
    expect(isResumable(600, 0)).toBe(false);
  });
});

describe('withEntry', () => {
  it('puts the newest first and keeps one entry per video', () => {
    const list = withEntry([entry('a'), entry('b')], entry('b', 900));
    expect(list.map((item) => [item.key, item.position])).toEqual([
      ['b', 900],
      ['a', 600],
    ]);
  });

  it('forgets a video that was finished or barely started', () => {
    expect(withEntry([entry('a'), entry('b')], entry('a', 3590)).map((item) => item.key)).toEqual([
      'b',
    ]);
    expect(withEntry([entry('a')], entry('c', 3))).toEqual([entry('a')]);
  });

  it('keeps the list short', () => {
    const many = Array.from({ length: MAX_ENTRIES }, (_, index) => entry(`t${index}`));
    const list = withEntry(many, entry('new'));
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0]?.key).toBe('new');
    expect(list.at(-1)?.key).toBe(`t${MAX_ENTRIES - 2}`);
  });
});

describe('parseEntries', () => {
  it('reads what was stored', () => {
    expect(parseEntries(JSON.stringify([entry('a')]))).toEqual([entry('a')]);
  });

  it('treats anything else as an empty list', () => {
    expect(parseEntries(null)).toEqual([]);
    expect(parseEntries('not json')).toEqual([]);
    expect(parseEntries('{"key":"a"}')).toEqual([]);
    expect(parseEntries(JSON.stringify([{ key: 'a' }, null, 7, entry('b')]))).toEqual([entry('b')]);
  });
});
