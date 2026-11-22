// SPDX-License-Identifier: AGPL-3.0-only
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import {
  BACKUP_MAGIC,
  type BackupNote,
  createBackupReader,
  createBackupWriter,
  readBackupNote,
} from './backup-file.js';

const KEY = 'a'.repeat(64);
const NOTE: BackupNote = {
  createdAt: '2026-11-22T03:00:00.000Z',
  appVersion: '0.1.0',
  migration: '20261124090000_backups',
};

const write = (data: Buffer, key = KEY, pieces = 1) => {
  const size = Math.max(1, Math.ceil(data.length / pieces));
  const parts: Buffer[] = [];
  for (let at = 0; at < data.length; at += size) {
    parts.push(data.subarray(at, at + size));
  }
  return buffer(Readable.from(parts).pipe(createBackupWriter(key, NOTE)));
};
const read = (file: Buffer, key = KEY, pieces = 1) => {
  const size = Math.max(1, Math.ceil(file.length / pieces));
  const parts: Buffer[] = [];
  for (let at = 0; at < file.length; at += size) {
    parts.push(file.subarray(at, at + size));
  }
  return buffer(Readable.from(parts).pipe(createBackupReader(key)));
};

describe('backup file', () => {
  it.each([0, 1, 65_535, 65_536, 65_537, 300_000])('gives %i bytes back as written', async (n) => {
    const data = randomBytes(n);
    const file = await write(data, KEY, 7);
    expect((await read(file, KEY, 13)).equals(data)).toBe(true);
  });

  it('reads the same however the file arrives in pieces', async () => {
    const data = randomBytes(200_000);
    const file = await write(data);
    expect((await read(file, KEY, file.length)).equals(data)).toBe(true);
  });

  it('does not contain what was written', async () => {
    const data = Buffer.from('viewer@example.com '.repeat(500));
    expect((await write(data)).includes('viewer@example.com')).toBe(false);
  });

  it('writes a different file each time', async () => {
    const data = randomBytes(1000);
    expect((await write(data)).equals(await write(data))).toBe(false);
  });

  it('tells its note without the key', async () => {
    const file = await write(randomBytes(10));
    expect(readBackupNote(file)?.note).toEqual(NOTE);
    const notes: BackupNote[] = [];
    await buffer(Readable.from([file]).pipe(createBackupReader(KEY, (note) => notes.push(note))));
    expect(notes).toEqual([NOTE]);
  });

  it('does not open under another key', async () => {
    const file = await write(randomBytes(1000));
    await expect(read(file, 'b'.repeat(64))).rejects.toThrow(/another MASTER_KEY/);
  });

  it('refuses a file that was cut short', async () => {
    const file = await write(randomBytes(200_000));
    await expect(read(file.subarray(0, file.length - 1))).rejects.toThrow(/damaged or was cut/);
    // Cut exactly between two chunks: every chunk left is whole, but none is the last.
    const firstChunkEnd = file.indexOf(BACKUP_MAGIC) + file.length - (200_000 % 65_536) - 20;
    await expect(read(file.subarray(0, firstChunkEnd))).rejects.toThrow(/damaged or was cut/);
  });

  it('refuses a file with a changed byte, wherever it is', async () => {
    const file = await write(randomBytes(100_000));
    for (const at of [3, 12, 40, 80, 70_000, file.length - 1]) {
      const changed = Buffer.from(file);
      changed[at] = (changed[at] as number) ^ 1;
      await expect(read(changed)).rejects.toThrow();
    }
  });

  it('refuses a file with a chunk left out', async () => {
    const data = randomBytes(3 * 65_536);
    const file = await write(data);
    const head = file.length - 3 * (4 + 65_536 + 16);
    const chunk = 4 + 65_536 + 16;
    const without = Buffer.concat([
      file.subarray(0, head + chunk),
      file.subarray(head + 2 * chunk),
    ]);
    await expect(read(without)).rejects.toThrow(/damaged or was cut/);
  });

  it('refuses something that is no backup', async () => {
    await expect(read(Buffer.from('PGDMP and so on, a plain dump'))).rejects.toThrow(
      /not a backup file/,
    );
    await expect(read(Buffer.alloc(0))).rejects.toThrow(/not a backup file/);
  });
});
