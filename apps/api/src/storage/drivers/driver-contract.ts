// SPDX-License-Identifier: AGPL-3.0-only
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { type StorageDriver, StorageObjectNotFoundError } from '../storage-driver.js';
import { InvalidStorageKeyError } from '../storage-key.js';

/**
 * Tests every storage driver has to pass, so the rest of the code can rely on
 * identical behavior whichever backend is used. Call it from a driver's own
 * test file inside a `describe` block.
 *
 * @param createDriver Returns a driver pointing at an empty location.
 */
export function describeStorageDriverContract(createDriver: () => Promise<StorageDriver>): void {
  let driver: StorageDriver;

  async function keysUnder(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for await (const entry of driver.list(prefix)) {
      keys.push(entry.key);
    }
    return keys.sort();
  }

  beforeEach(async () => {
    driver = await createDriver();
  });

  afterEach(async () => {
    await driver.close?.();
  });

  it('writes a buffer and reads it back', async () => {
    await driver.write('a/b/file.txt', Buffer.from('hello'));

    expect((await buffer(await driver.read('a/b/file.txt'))).toString()).toBe('hello');
  });

  it('writes a stream and reads it back', async () => {
    const content = Buffer.alloc(300_000, 'x');
    await driver.write(
      'stream.bin',
      Readable.from([content.subarray(0, 100_000), content.subarray(100_000)]),
    );

    expect((await buffer(await driver.read('stream.bin'))).equals(content)).toBe(true);
  });

  it('replaces an existing object', async () => {
    await driver.write('file.txt', Buffer.from('first version'));
    await driver.write('file.txt', Buffer.from('second'));

    expect((await buffer(await driver.read('file.txt'))).toString()).toBe('second');
  });

  it('reads a byte range with inclusive ends', async () => {
    await driver.write('range.txt', Buffer.from('0123456789'));

    expect((await buffer(await driver.read('range.txt', { start: 2, end: 5 }))).toString()).toBe(
      '2345',
    );
    expect((await buffer(await driver.read('range.txt', { start: 7 }))).toString()).toBe('789');
  });

  it('reports size and existence', async () => {
    await driver.write('info.txt', Buffer.from('12345'));

    const info = await driver.stat('info.txt');
    expect(info?.size).toBe(5);
    expect(info?.modifiedAt).toBeInstanceOf(Date);
    expect(await driver.exists('info.txt')).toBe(true);
    expect(await driver.exists('missing.txt')).toBe(false);
    expect(await driver.stat('missing.txt')).toBeNull();
  });

  it('throws StorageObjectNotFoundError when reading a missing object', async () => {
    await expect(driver.read('missing.txt')).rejects.toBeInstanceOf(StorageObjectNotFoundError);
  });

  it('deletes an object and tolerates deleting it again', async () => {
    await driver.write('gone.txt', Buffer.from('x'));

    await driver.delete('gone.txt');
    await driver.delete('gone.txt');

    expect(await driver.exists('gone.txt')).toBe(false);
  });

  it('lists objects under a prefix, treating the prefix as a directory', async () => {
    await driver.write('assets/abc/master.m3u8', Buffer.from('1'));
    await driver.write('assets/abc/v/720p/seg-1.m4s', Buffer.from('22'));
    await driver.write('assets/abcd/master.m3u8', Buffer.from('333'));

    expect(await keysUnder('assets/abc')).toEqual([
      'assets/abc/master.m3u8',
      'assets/abc/v/720p/seg-1.m4s',
    ]);
    expect(await keysUnder('assets/none')).toEqual([]);
  });

  it('deletes everything under a prefix and nothing else', async () => {
    await driver.write('assets/abc/master.m3u8', Buffer.from('1'));
    await driver.write('assets/abc/v/720p/seg-1.m4s', Buffer.from('2'));
    await driver.write('assets/abcd/master.m3u8', Buffer.from('3'));

    expect(await driver.deletePrefix('assets/abc')).toBe(2);

    expect(await keysUnder('assets/abc')).toEqual([]);
    expect(await driver.exists('assets/abcd/master.m3u8')).toBe(true);
    expect(await driver.deletePrefix('assets/abc')).toBe(0);
  });

  it('rejects keys that could leave the pool', async () => {
    await expect(driver.write('../escape.txt', Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    await expect(driver.read('/etc/passwd')).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(driver.delete('a/../../b')).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });
}
