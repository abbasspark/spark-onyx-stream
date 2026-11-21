// SPDX-License-Identifier: AGPL-3.0-only
import {
  isResumable,
  MAX_ENTRIES,
  mergeUnsynced,
  parseEntries,
  targetOf,
  toReport,
  type WatchEntry,
  withEntry,
} from './progress';

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

describe('targetOf', () => {
  it('reads the video from the address of the watch page', () => {
    expect(targetOf({ href: '/watch/night-train' })).toEqual({ title: 'night-train' });
    expect(targetOf({ href: '/watch/deep-water/0195-abc' })).toEqual({
      title: 'deep-water',
      episodeId: '0195-abc',
    });
  });

  it('has no video for any other address', () => {
    expect(targetOf({ href: '/title/night-train' })).toBeNull();
    expect(targetOf({ href: '/watch/' })).toBeNull();
    expect(targetOf({ href: '/watch/a/b/c' })).toBeNull();
    expect(targetOf({ href: 'https://elsewhere.example/watch/a' })).toBeNull();
  });
});

describe('toReport', () => {
  it('says when the device noted the position', () => {
    const report = toReport({ ...entry('night-train', 700), updatedAt: Date.UTC(2026, 10, 20) });
    expect(report).toEqual({
      title: 'night-train',
      position: 700,
      duration: 3600,
      watchedAt: '2026-11-20T00:00:00.000Z',
    });
  });

  it('skips an entry that names no video', () => {
    expect(toReport({ ...entry('a'), href: '/somewhere' })).toBeNull();
  });
});

describe('mergeUnsynced', () => {
  const at = (key: string, updatedAt: number, synced = false, position = 600): WatchEntry => ({
    ...entry(key, position),
    updatedAt,
    synced,
  });

  it('takes the list of the account as it is when the device has nothing new', () => {
    const account = [at('a', 30, true), at('b', 20, true)];
    // "c" was in the account when this device last looked and is gone since.
    expect(mergeUnsynced(account, [at('c', 99, true), at('a', 10, true)])).toEqual(account);
  });

  it('keeps what the account has not taken yet, when it is newer', () => {
    const account = [at('a', 30, true, 100), at('b', 20, true)];
    const merged = mergeUnsynced(account, [at('a', 40, false, 900), at('d', 25), at('b', 5)]);
    expect(merged.map((item) => [item.key, item.position, item.synced])).toEqual([
      ['a', 900, false],
      ['d', 600, false],
      ['b', 600, true],
    ]);
  });

  it('stays within the length of the row', () => {
    const local = Array.from({ length: MAX_ENTRIES + 5 }, (_, index) => at(`k${index}`, index));
    expect(mergeUnsynced([], local)).toHaveLength(MAX_ENTRIES);
  });
});
