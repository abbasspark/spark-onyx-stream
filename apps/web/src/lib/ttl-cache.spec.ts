// SPDX-License-Identifier: AGPL-3.0-only
import { TtlCache } from './ttl-cache';

function setup(ttlMs = 1000, maxEntries = 3) {
  let time = 0;
  const cache = new TtlCache<string>(ttlMs, maxEntries, () => time);
  const load = vi.fn(async (value: string) => value);
  return { cache, load, advance: (ms: number) => (time += ms) };
}

describe('TtlCache', () => {
  it('loads once and reuses the answer while it is fresh', async () => {
    const { cache, load, advance } = setup();
    expect(await cache.get('a', () => load('first'))).toBe('first');
    advance(999);
    expect(await cache.get('a', () => load('second'))).toBe('first');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never hands out an answer older than its time', async () => {
    const { cache, load, advance } = setup();
    await cache.get('a', () => load('first'));
    advance(1000);
    expect(await cache.get('a', () => load('second'))).toBe('second');
  });

  it('lets everyone wait for the same load', async () => {
    const { cache } = setup();
    let finish: (value: string) => void = () => undefined;
    const load = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));

    const first = cache.get('a', load);
    const second = cache.get('a', load);
    finish('done');

    expect(await Promise.all([first, second])).toEqual(['done', 'done']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failure', async () => {
    const { cache, load } = setup();
    await expect(cache.get('a', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache.get('a', () => load('back'))).toBe('back');
  });

  it('makes room by dropping what was used least recently', async () => {
    const { cache, load } = setup();
    for (const key of ['a', 'b', 'c']) {
      await cache.get(key, () => load(key));
    }
    await cache.get('a', () => load('a again'));
    await cache.get('d', () => load('d'));
    expect(cache.size).toBe(3);

    load.mockClear();
    await cache.get('a', () => load('a'));
    expect(load).not.toHaveBeenCalled();
    await cache.get('b', () => load('b'));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
