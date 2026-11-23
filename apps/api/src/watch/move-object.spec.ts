// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { LocalStorageDriver } from '../storage/drivers/local.driver.js';
import type { StorageDriver } from '../storage/storage-driver.js';
import { moveObject } from './watch-runner.service.js';

describe('moveObject', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'onyx-move-'));
  });
  afterEach(() => rm(directory, { recursive: true, force: true }));

  it('renames a file on disk, making the folders it needs', async () => {
    const driver = new LocalStorageDriver(directory);
    await driver.write('in/603_x.mkv', Buffer.from('film'));
    await moveObject(driver, 'in/603_x.mkv', 'imported/in/603_x.mkv');
    expect(await driver.exists('in/603_x.mkv')).toBe(false);
    expect(await readFile(path.join(directory, 'imported/in/603_x.mkv'), 'utf8')).toBe('film');
  });

  it('copies and then deletes where a place has no renaming', async () => {
    const objects = new Map<string, Buffer>([['603_x.mkv', Buffer.from('film')]]);
    const calls: string[] = [];
    // A place like a bucket: no path on this machine.
    const driver = {
      read: async (key: string) => {
        calls.push(`read ${key}`);
        return Readable.from(objects.get(key) as Buffer);
      },
      write: async (key: string, data: Readable | Buffer) => {
        calls.push(`write ${key}`);
        objects.set(key, Buffer.isBuffer(data) ? data : await buffer(data));
      },
      delete: async (key: string) => {
        calls.push(`delete ${key}`);
        objects.delete(key);
      },
    } as unknown as StorageDriver;

    await moveObject(driver, '603_x.mkv', 'imported/603_x.mkv');
    // The original goes last, when its copy is whole.
    expect(calls).toEqual(['read 603_x.mkv', 'write imported/603_x.mkv', 'delete 603_x.mkv']);
    expect([...objects.keys()]).toEqual(['imported/603_x.mkv']);
    expect(objects.get('imported/603_x.mkv')?.toString()).toBe('film');
  });
});
