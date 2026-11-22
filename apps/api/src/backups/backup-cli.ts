// SPDX-License-Identifier: AGPL-3.0-only
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Writable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { pipeline } from 'node:stream/promises';
import { appVersion } from '../common/app-version.js';
import {
  BackupFileError,
  type BackupNote,
  createBackupReader,
  createBackupWriter,
  readBackupNote,
} from './backup-file.js';
import { connectionEnv, countArchiveEntries, PgToolError, runPgTool } from './pg-tools.js';

/**
 * The backup tool for the command line: what is needed when the admin panel
 * is not there to help, because the installation is being rebuilt or updated.
 *
 * It needs no running application, only the database and the two settings
 * DATABASE_URL and MASTER_KEY.
 */
export const USAGE = `Backups of Spark Onyx Stream

  backup create <file>       Write a backup of the database to a file
  backup info <file>         Show when a backup was made, and by which version
  backup verify <file>       Prove that a backup opens and holds a database
  backup restore <file>      Replace the database with a backup
  backup decrypt <file> <out>
                             Write the plain pg_dump archive, for pg_restore

Options of restore:
  --yes                      Do it. Without this, restore only says what it would do
  --save-current <file>      Back up the database as it is first, to this file
  --force                    Restore although something is still connected to the database

Reads DATABASE_URL and MASTER_KEY from the environment. A backup opens only
under the MASTER_KEY it was made with.`;

export interface CliIo {
  env: Record<string, string | undefined>;
  out: (line: string) => void;
}

/** A problem the person at the keyboard can do something about. Shown without a stack trace. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

function setting(io: CliIo, name: 'DATABASE_URL' | 'MASTER_KEY'): string {
  const value = io.env[name];
  if (!value) {
    throw new CliError(`${name} is not set`);
  }
  if (name === 'MASTER_KEY' && !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new CliError('MASTER_KEY must be 64 hexadecimal characters');
  }
  return value;
}

/** Runs one SQL statement and returns what it printed. */
async function sql(statement: string, databaseEnv: Record<string, string>): Promise<string> {
  const run = runPgTool(
    'psql',
    [
      '--no-psqlrc',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      statement,
    ],
    databaseEnv,
    { output: 'pipe' },
  );
  const printed = text(run.stdout as NodeJS.ReadableStream);
  await run.done;
  return (await printed).trim();
}

async function noteOf(file: string): Promise<BackupNote> {
  const handle = await open(file, 'r').catch(() => {
    throw new CliError(`Cannot read ${file}`);
  });
  try {
    const start = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(start, 0, start.length, 0);
    const read = readBackupNote(start.subarray(0, bytesRead));
    if (!read) {
      throw new BackupFileError('This is not a backup file of Spark Onyx Stream');
    }
    return read.note;
  } finally {
    await handle.close();
  }
}

function describe(note: BackupNote): string[] {
  return [
    `Made:       ${note.createdAt}`,
    `By version: ${note.appVersion}`,
    `Migration:  ${note.migration ?? 'none'}`,
  ];
}

/** Writes a backup of the database to a file only its owner can read. */
async function create(file: string, io: CliIo): Promise<void> {
  const databaseEnv = connectionEnv(setting(io, 'DATABASE_URL'));
  const masterKey = setting(io, 'MASTER_KEY');
  const migration = await sql(
    'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name DESC LIMIT 1',
    databaseEnv,
  ).catch(() => '');
  const note: BackupNote = {
    createdAt: new Date().toISOString(),
    appVersion: appVersion(),
    migration: migration || null,
  };

  const dump = runPgTool('pg_dump', ['--format=custom', '--no-password'], databaseEnv, {
    output: 'pipe',
  });
  try {
    const [dumped, written] = await Promise.allSettled([
      dump.done,
      pipeline(
        dump.stdout as NodeJS.ReadableStream,
        createBackupWriter(masterKey, note),
        createWriteStream(file, { mode: 0o600 }),
      ),
    ]);
    for (const step of [dumped, written]) {
      if (step.status === 'rejected') {
        throw step.reason;
      }
    }
  } catch (error) {
    dump.stop();
    await rm(file, { force: true });
    throw error;
  }
  // Read back like any other backup: a file that does not open is worse than none.
  const entries = await verify(file, io, false);
  io.out(
    `Backup written to ${file}: ${(await stat(file)).size} bytes, ${entries} database objects`,
  );
}

/**
 * Opens every chunk of a backup and lets pg_restore read its table of contents.
 *
 * @param plainFile Where to keep the opened archive. Without it, nothing is kept.
 * @returns How many database objects the backup holds.
 */
async function openBackup(file: string, io: CliIo, plainFile?: string): Promise<number> {
  const masterKey = setting(io, 'MASTER_KEY');
  await noteOf(file);

  const list = runPgTool('pg_restore', ['--list'], {}, { input: 'pipe', output: 'pipe' });
  const listing = text(list.stdout as NodeJS.ReadableStream);
  const stdin = list.stdin as Writable;
  const kept = plainFile ? createWriteStream(plainFile, { mode: 0o600 }) : null;

  const reader = createBackupReader(masterKey);
  reader.on('data', (chunk: Buffer) => {
    // pg_restore stops reading after the table of contents. The rest is still checked.
    if (!stdin.destroyed && !stdin.writableEnded) {
      stdin.write(chunk);
    }
  });
  try {
    if (kept) {
      await pipeline(createReadStream(file), reader, kept);
    } else {
      reader.resume();
      await pipeline(createReadStream(file), reader);
    }
  } catch (error) {
    list.stop();
    throw error;
  }
  stdin.end();
  await list.done;
  const entries = countArchiveEntries(await listing);
  if (entries === 0) {
    throw new BackupFileError('The backup holds no database objects');
  }
  return entries;
}

async function verify(file: string, io: CliIo, speak = true): Promise<number> {
  const entries = await openBackup(file, io);
  if (speak) {
    for (const line of describe(await noteOf(file))) {
      io.out(line);
    }
    io.out(`The backup opens and holds ${entries} database objects.`);
  }
  return entries;
}

async function restore(file: string, flags: Set<string>, saveTo: string | null, io: CliIo) {
  const databaseEnv = connectionEnv(setting(io, 'DATABASE_URL'));
  const note = await noteOf(file);
  const scratch = await mkdtemp(path.join(tmpdir(), 'onyx-restore-'));
  const plain = path.join(scratch, 'archive.dump');
  try {
    // Opened in full before anything is touched: a damaged backup must not cost the database.
    const entries = await openBackup(file, io, plain);
    for (const line of describe(note)) {
      io.out(line);
    }
    io.out(`Holds:      ${entries} database objects`);
    io.out(`Target:     database "${databaseEnv.PGDATABASE}" on ${databaseEnv.PGHOST}`);

    const others = Number(
      await sql(
        'SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
        databaseEnv,
      ),
    );
    if (!flags.has('--yes')) {
      io.out('');
      io.out(
        'Nothing was changed. Restoring REPLACES everything in this database with the backup.',
      );
      if (others > 0) {
        io.out(`${others} connections to the database are open: stop the application first.`);
      }
      io.out('Run the command again with --yes to do it.');
      return;
    }
    if (others > 0 && !flags.has('--force')) {
      throw new CliError(
        `${others} connections to the database are open. Stop the application first (api, worker and live), or pass --force.`,
      );
    }
    if (saveTo) {
      await create(saveTo, io);
    }

    io.out('Emptying the database ...');
    await sql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;', databaseEnv);
    io.out('Restoring ...');
    const load = runPgTool(
      'pg_restore',
      [
        '--no-owner',
        '--no-privileges',
        '--exit-on-error',
        '--single-transaction',
        '--no-password',
        `--dbname=${databaseEnv.PGDATABASE}`,
      ],
      databaseEnv,
      { input: 'pipe' },
    );
    try {
      await Promise.all([pipeline(createReadStream(plain), load.stdin as Writable), load.done]);
    } catch (error) {
      await load.done.catch(() => undefined);
      throw new CliError(
        `The restore failed, and the database is empty now. Nothing of the backup was kept half way: fix the cause and run the restore again.\n${(error as Error).message}`,
      );
    }
    io.out('The database is restored.');
    io.out(
      'Now run the migrations and start the application. A backup of an older version is brought up to date by them.',
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function decrypt(file: string, target: string, io: CliIo): Promise<void> {
  const entries = await openBackup(file, io, target).catch(async (error: unknown) => {
    await rm(target, { force: true });
    throw error;
  });
  io.out(`Plain archive written to ${target}: ${entries} database objects. It is NOT encrypted.`);
}

/**
 * Runs the tool.
 *
 * @returns The exit code.
 */
export async function runBackupCli(args: string[], io: CliIo): Promise<number> {
  const flags = new Set<string>();
  const words: string[] = [];
  let saveTo: string | null = null;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] as string;
    if (arg === '--save-current') {
      saveTo = args[at + 1] ?? null;
      at += 1;
    } else if (arg.startsWith('--')) {
      flags.add(arg);
    } else {
      words.push(arg);
    }
  }
  const [command, file, second] = words;

  try {
    if (command === 'create' && file) {
      await create(file, io);
    } else if (command === 'info' && file) {
      for (const line of describe(await noteOf(file))) {
        io.out(line);
      }
    } else if (command === 'verify' && file) {
      await verify(file, io);
    } else if (command === 'restore' && file) {
      await restore(file, flags, saveTo, io);
    } else if (command === 'decrypt' && file && second) {
      await decrypt(file, second, io);
    } else {
      io.out(USAGE);
      return command === undefined || flags.has('--help') ? 0 : 2;
    }
    return 0;
  } catch (error) {
    if (
      error instanceof CliError ||
      error instanceof BackupFileError ||
      error instanceof PgToolError
    ) {
      io.out(`Error: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
