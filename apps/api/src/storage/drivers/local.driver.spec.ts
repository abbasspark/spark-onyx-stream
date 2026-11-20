// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describeStorageDriverContract } from './driver-contract.js';
import { LocalStorageDriver } from './local.driver.js';

describe('LocalStorageDriver', () => {
  const directories: string[] = [];

  async function createDirectory(): Promise<string> {
    const directory = await mkdtemp(path.join(tmpdir(), 'onyx-storage-'));
    directories.push(directory);
    return directory;
  }

  afterAll(async () => {
    await Promise.all(
      directories.map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  describeStorageDriverContract(async () => new LocalStorageDriver(await createDirectory()));

  it('requires an absolute base path', () => {
    expect(() => new LocalStorageDriver('relative/path')).toThrow(/must be absolute/);
  });

  it('exposes the local path of an object', async () => {
    const directory = await createDirectory();
    const driver = new LocalStorageDriver(directory);

    expect(driver.localPath('assets/abc/master.m3u8')).toBe(
      path.join(directory, 'assets', 'abc', 'master.m3u8'),
    );
  });

  it('leaves no partial or temporary file when a write fails', async () => {
    const directory = await createDirectory();
    const driver = new LocalStorageDriver(directory);
    const failing = new Readable({
      read() {
        this.push(Buffer.from('partial'));
        this.destroy(new Error('source failed'));
      },
    });

    await expect(driver.write('broken/file.bin', failing)).rejects.toThrow('source failed');

    expect(await driver.exists('broken/file.bin')).toBe(false);
    expect(await readdir(path.join(directory, 'broken'))).toEqual([]);
  });
});
