// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Runs once before the end-to-end suites: brings the test database up to the
 * newest migration, so a new migration never needs a manual step.
 *
 * Does nothing when TEST_DATABASE_URL is not set. The suites are skipped then.
 */
export default function setup(): void {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    return;
  }
  if (testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must not point at the development database');
  }

  try {
    execFileSync('pnpm', ['--filter', '@onyx/database', 'migrate:deploy'], {
      cwd: path.resolve(import.meta.dirname, '../../../..'),
      // The database package reads DATABASE_URL. A value set here wins over the .env file.
      env: { ...process.env, DATABASE_URL: testDatabaseUrl },
      stdio: 'pipe',
      // pnpm is a .cmd file on Windows, which only a shell can start.
      shell: process.platform === 'win32',
    });
  } catch (error) {
    const failure = error as { stdout?: Buffer; stderr?: Buffer; message: string };
    const output = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`.trim();
    throw new Error(
      `The test database could not be migrated. Is PostgreSQL running and TEST_DATABASE_URL right?\n${output || failure.message}`,
      { cause: error },
    );
  }
}
