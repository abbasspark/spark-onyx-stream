// SPDX-License-Identifier: AGPL-3.0-only
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';

/**
 * The backup file format.
 *
 * A backup holds the whole database, so it is encrypted before it leaves the
 * process, under a key derived from the platform master key. The file can lie
 * in a bucket or on a laptop without giving anything away.
 *
 *   "ONYXBKP1"            8 bytes
 *   length of the note    2 bytes, big endian
 *   note                  JSON, readable without the key: when, which version
 *   salt                  16 bytes
 *   chunks                each: length (4 bytes) | ciphertext | tag (16 bytes)
 *
 * The data is cut into chunks, each sealed with AES-256-GCM on its own. A
 * reader therefore never passes on a byte it has not checked, however large
 * the file is. The chunk number is the nonce, the last chunk is marked as
 * such, and the key depends on the note: a file that was cut short, had
 * chunks swapped or a note rewritten does not open.
 */
export const BACKUP_MAGIC = Buffer.from('ONYXBKP1', 'ascii');
export const BACKUP_FILE_EXTENSION = '.onyxbackup';

const SALT_BYTES = 16;
const TAG_BYTES = 16;
const NONCE_BYTES = 12;
const CHUNK_BYTES = 64 * 1024;
const MAX_NOTE_BYTES = 4096;
const KEY_INFO = 'onyx-backup-v1';

/** What a backup file says about itself. Not secret, and readable without the key. */
export interface BackupNote {
  /** When the backup was started, as an ISO date. */
  createdAt: string;
  /** The version of the application that wrote it. */
  appVersion: string;
  /** The newest migration the database had, or null when it had none. */
  migration: string | null;
}

/** Thrown when a file is not a backup, is damaged, or was written under another key. */
export class BackupFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFileError';
  }
}

function masterKeyOf(masterKeyHex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(masterKeyHex)) {
    throw new Error('The master key must be 64 hexadecimal characters');
  }
  return Buffer.from(masterKeyHex, 'hex');
}

/** The key of one file. It depends on the salt and on everything written before it. */
function fileKey(masterKey: Buffer, salt: Buffer, head: Buffer): Buffer {
  const info = Buffer.concat([Buffer.from(KEY_INFO), createHash('sha256').update(head).digest()]);
  return Buffer.from(hkdfSync('sha256', masterKey, salt, info, 32));
}

function nonceOf(chunk: number): Buffer {
  const nonce = Buffer.alloc(NONCE_BYTES);
  nonce.writeBigUInt64BE(BigInt(chunk), NONCE_BYTES - 8);
  return nonce;
}

const LAST = Buffer.from([1]);
const NOT_LAST = Buffer.from([0]);

/** Turns the data written to it into a backup file. */
export function createBackupWriter(masterKeyHex: string, note: BackupNote): Transform {
  const masterKey = masterKeyOf(masterKeyHex);
  const noteBytes = Buffer.from(JSON.stringify(note), 'utf8');
  if (noteBytes.length > MAX_NOTE_BYTES) {
    throw new Error('The note of the backup is too long');
  }
  const length = Buffer.alloc(2);
  length.writeUInt16BE(noteBytes.length);
  const head = Buffer.concat([BACKUP_MAGIC, length, noteBytes]);
  const salt = randomBytes(SALT_BYTES);
  const key = fileKey(masterKey, salt, head);

  let pending: Buffer = Buffer.alloc(0);
  let chunk = 0;
  let started = false;

  const seal = (plain: Buffer, last: boolean): Buffer => {
    const cipher = createCipheriv('aes-256-gcm', key, nonceOf(chunk));
    chunk += 1;
    cipher.setAAD(last ? LAST : NOT_LAST);
    const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(sealed.length);
    return Buffer.concat([size, sealed, cipher.getAuthTag()]);
  };

  return new Transform({
    transform(data: Buffer, _encoding, callback: TransformCallback) {
      if (!started) {
        started = true;
        this.push(Buffer.concat([head, salt]));
      }
      pending = pending.length === 0 ? data : Buffer.concat([pending, data]);
      // One chunk is always held back: only the end tells which one is the last.
      while (pending.length > CHUNK_BYTES) {
        this.push(seal(pending.subarray(0, CHUNK_BYTES), false));
        pending = pending.subarray(CHUNK_BYTES);
      }
      callback();
    },
    flush(callback: TransformCallback) {
      if (!started) {
        this.push(Buffer.concat([head, salt]));
      }
      this.push(seal(pending, true));
      callback();
    },
  });
}

/** Reads the note at the start of a backup file. Needs no key. */
export function readBackupNote(start: Buffer): { note: BackupNote; headBytes: number } | null {
  if (start.length < BACKUP_MAGIC.length + 2) {
    return null;
  }
  if (!start.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new BackupFileError('This is not a backup file of Spark Onyx Stream');
  }
  const noteLength = start.readUInt16BE(BACKUP_MAGIC.length);
  if (noteLength > MAX_NOTE_BYTES) {
    throw new BackupFileError('The backup file is damaged: its first bytes make no sense');
  }
  const headBytes = BACKUP_MAGIC.length + 2 + noteLength;
  if (start.length < headBytes) {
    return null;
  }
  try {
    const note = JSON.parse(start.subarray(BACKUP_MAGIC.length + 2, headBytes).toString('utf8'));
    return { note: note as BackupNote, headBytes };
  } catch {
    throw new BackupFileError('The backup file is damaged: its first bytes make no sense');
  }
}

/**
 * Turns a backup file back into the data it was made of.
 *
 * @param onNote Called once with the note of the file, before any data.
 */
export function createBackupReader(
  masterKeyHex: string,
  onNote?: (note: BackupNote) => void,
): Transform {
  const masterKey = masterKeyOf(masterKeyHex);
  let pending: Buffer = Buffer.alloc(0);
  let key: Buffer | undefined;
  let chunk = 0;
  /** A chunk that was read but not opened yet: the end decides whether it is the last. */
  let held: Buffer | undefined;

  const open = (sealed: Buffer, last: boolean): Buffer => {
    const decipher = createDecipheriv('aes-256-gcm', key as Buffer, nonceOf(chunk), {
      authTagLength: TAG_BYTES,
    });
    chunk += 1;
    decipher.setAAD(last ? LAST : NOT_LAST);
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES));
    try {
      return Buffer.concat([
        decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)),
        decipher.final(),
      ]);
    } catch {
      throw new BackupFileError(
        chunk === 1
          ? 'The backup does not open. It was written under another MASTER_KEY, or it is damaged'
          : 'The backup is damaged or was cut short',
      );
    }
  };

  return new Transform({
    transform(data: Buffer, _encoding, callback: TransformCallback) {
      try {
        pending = pending.length === 0 ? data : Buffer.concat([pending, data]);
        if (!key) {
          const read = readBackupNote(pending);
          if (!read || pending.length < read.headBytes + SALT_BYTES) {
            callback();
            return;
          }
          const head = pending.subarray(0, read.headBytes);
          const salt = pending.subarray(read.headBytes, read.headBytes + SALT_BYTES);
          key = fileKey(masterKey, salt, head);
          pending = pending.subarray(read.headBytes + SALT_BYTES);
          onNote?.(read.note);
        }
        while (pending.length >= 4) {
          const size = pending.readUInt32BE(0);
          if (size > CHUNK_BYTES) {
            throw new BackupFileError('The backup is damaged or was cut short');
          }
          const total = 4 + size + TAG_BYTES;
          if (pending.length < total) {
            break;
          }
          if (held) {
            this.push(open(held, false));
          }
          // Copied: the buffer it is cut from is let go on the next round.
          held = Buffer.from(pending.subarray(4, total));
          pending = pending.subarray(total);
        }
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
    flush(callback: TransformCallback) {
      try {
        if (!key) {
          throw new BackupFileError('This is not a backup file of Spark Onyx Stream');
        }
        if (!held || pending.length > 0) {
          throw new BackupFileError('The backup is damaged or was cut short');
        }
        this.push(open(held, true));
        callback();
      } catch (error) {
        callback(error as Error);
      }
    },
  });
}
