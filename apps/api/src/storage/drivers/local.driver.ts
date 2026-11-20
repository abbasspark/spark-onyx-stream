// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  type ReadRange,
  type StorageDriver,
  type StorageListEntry,
  type StorageObjectInfo,
  StorageObjectNotFoundError,
} from '../storage-driver.js';
import { InvalidStorageKeyError, normalizeStorageKey } from '../storage-key.js';

const TEMP_MARKER = '.tmp-';

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/** Stores objects as files under one base directory. */
export class LocalStorageDriver implements StorageDriver {
  private readonly basePath: string;

  /** @param basePath Absolute path of the pool's root directory. It is created on first write. */
  constructor(basePath: string) {
    if (!path.isAbsolute(basePath)) {
      throw new Error('The base path of a local storage pool must be absolute');
    }
    this.basePath = path.resolve(basePath);
  }

  localPath(key: string): string {
    const normalized = normalizeStorageKey(key);
    const resolved = path.resolve(this.basePath, ...normalized.split('/'));

    // Second line of defense after normalizeStorageKey.
    if (!resolved.startsWith(this.basePath + path.sep)) {
      throw new InvalidStorageKeyError(key, 'it resolves outside the storage pool');
    }
    return resolved;
  }

  async write(key: string, data: Readable | Buffer): Promise<void> {
    const target = this.localPath(key);
    await mkdir(path.dirname(target), { recursive: true });

    // Write beside the target and rename, so readers never see a partial file.
    const temporary = `${target}${TEMP_MARKER}${randomBytes(6).toString('hex')}`;
    try {
      if (Buffer.isBuffer(data)) {
        await writeFile(temporary, data);
      } else {
        await pipeline(data, createWriteStream(temporary));
      }
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async read(key: string, range?: ReadRange): Promise<Readable> {
    const target = this.localPath(key);

    // Check first: createReadStream reports a missing file only later, through an event.
    if (!(await this.stat(key))) {
      throw new StorageObjectNotFoundError(key);
    }
    return createReadStream(target, range ? { start: range.start, end: range.end } : undefined);
  }

  async stat(key: string): Promise<StorageObjectInfo | null> {
    try {
      const info = await stat(this.localPath(key));
      if (!info.isFile()) {
        return null;
      }
      return { size: info.size, modifiedAt: info.mtime };
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    await rm(this.localPath(key), { force: true });
  }

  async deletePrefix(prefix: string): Promise<number> {
    let count = 0;
    for await (const _entry of this.list(prefix)) {
      count += 1;
    }
    await rm(this.localPath(prefix), { recursive: true, force: true });
    return count;
  }

  async *list(prefix: string): AsyncIterable<StorageListEntry> {
    const normalized = normalizeStorageKey(prefix);
    yield* this.walk(this.localPath(normalized), normalized);
  }

  private async *walk(directory: string, keyPrefix: string): AsyncIterable<StorageListEntry> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error) || (error as NodeJS.ErrnoException).code === 'ENOTDIR') {
        return;
      }
      throw error;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const key = `${keyPrefix}/${entry.name}`;
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        yield* this.walk(fullPath, key);
      } else if (entry.isFile() && !entry.name.includes(TEMP_MARKER)) {
        const info = await stat(fullPath);
        yield { key, size: info.size, modifiedAt: info.mtime };
      }
    }
  }
}
