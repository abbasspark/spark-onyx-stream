// SPDX-License-Identifier: AGPL-3.0-only
import { type ChildProcessByStdio, execFile, spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

/**
 * The PostgreSQL command line tools, which do the actual work of a backup:
 * pg_dump writes the database out, pg_restore reads it back in.
 *
 * The password travels in the environment of the child process, never on its
 * command line, where every user of the machine could read it.
 */
export type PgTool = 'pg_dump' | 'pg_restore' | 'psql';

/** Thrown when a tool is missing or ends with an error. The message is fit for an admin. */
export class PgToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgToolError';
  }
}

/** How the tools find the database: the address of DATABASE_URL as libpq variables. */
export function connectionEnv(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  const env: Record<string, string> = {
    // A unix socket is given as ?host=/path.
    PGHOST: url.searchParams.get('host') ?? decodeURIComponent(url.hostname),
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    PGCONNECT_TIMEOUT: '15',
  };
  if (url.username) {
    env.PGUSER = decodeURIComponent(url.username);
  }
  if (url.password) {
    env.PGPASSWORD = decodeURIComponent(url.password);
  }
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode) {
    env.PGSSLMODE = sslMode;
  }
  return env;
}

/** "17.2" from "pg_dump (PostgreSQL) 17.2 (Debian 17.2-1)". */
export function parseToolVersion(output: string): string | null {
  return /\(PostgreSQL\)\s+(\d+(?:\.\d+)*)/.exec(output)?.[1] ?? null;
}

/** 17 from "17.2", and from 170002 as the server reports it. */
export function majorOf(version: string | number): number {
  return typeof version === 'number'
    ? Math.floor(version / 10_000)
    : Number.parseInt(version.split('.')[0] ?? '', 10);
}

/** The version of a tool on this machine, or null when it is not installed. */
export function toolVersion(tool: PgTool): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(tool, ['--version'], { timeout: 30_000 }, (error, stdout) => {
      resolve(error ? null : parseToolVersion(stdout));
    });
  });
}

/**
 * Says what stands in the way of a backup, or null when nothing does.
 * pg_dump reads servers of its own version and older ones, not newer ones.
 */
export function toolProblem(pgDump: string | null, server: string | null): string | null {
  if (!pgDump) {
    return 'pg_dump is not installed where the scheduler runs. Install the PostgreSQL client tools.';
  }
  if (server && majorOf(pgDump) < majorOf(server)) {
    return `pg_dump ${pgDump} is older than the database server (${server}). Install the PostgreSQL client tools of version ${majorOf(server)} or newer.`;
  }
  return null;
}

const STDERR_KEPT = 4000;

/** The last lines a tool wrote before it failed, without the noise around them. */
function reasonOf(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(' ').slice(0, 500);
}

export interface PgRun {
  /** What the tool writes. Only there when asked for with "output: 'pipe'". */
  stdout: Readable | null;
  stdin: Writable | null;
  /** Settles when the tool has ended: resolves on success, rejects with a PgToolError. */
  done: Promise<void>;
  stop(): void;
}

/**
 * Starts a tool.
 *
 * @param databaseEnv From connectionEnv.
 */
export function runPgTool(
  tool: PgTool,
  args: string[],
  databaseEnv: Record<string, string>,
  options: { input?: 'pipe'; output?: 'pipe' } = {},
): PgRun {
  const child = spawn(tool, args, {
    env: { ...process.env, ...databaseEnv },
    stdio: [options.input ?? 'ignore', options.output ?? 'ignore', 'pipe'],
  }) as ChildProcessByStdio<Writable | null, Readable | null, Readable>;

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (text: string) => {
    stderr = (stderr + text).slice(-STDERR_KEPT);
  });
  // A tool that ends early closes its input. The exit code tells the story, not this.
  child.stdin?.on('error', () => undefined);

  const done = new Promise<void>((resolve, reject) => {
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        new PgToolError(
          error.code === 'ENOENT'
            ? `${tool} is not installed. Install the PostgreSQL client tools.`
            : `${tool} could not be started: ${error.message}`,
        ),
      );
    });
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        const reason = reasonOf(stderr) || (signal ? `stopped by ${signal}` : `exit code ${code}`);
        reject(new PgToolError(`${tool} failed: ${reason}`));
      }
    });
  });
  // Whoever started the tool decides when to look. Until then a failure must not end the process.
  done.catch(() => undefined);

  return { stdout: child.stdout, stdin: child.stdin, done, stop: () => void child.kill('SIGTERM') };
}

/** Counts what "pg_restore --list" names: the tables, indexes and so on of an archive. */
export function countArchiveEntries(listing: string): number {
  return listing.split('\n').filter((line) => /^\d+;/.test(line)).length;
}
