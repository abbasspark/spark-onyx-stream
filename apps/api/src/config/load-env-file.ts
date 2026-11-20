// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads the first .env file found, without overriding variables that are already set.
 *
 * In development the file lives at the repository root, two levels above this app.
 * In production the configuration comes from the container environment and no file is needed.
 *
 * @returns The path of the loaded file, or null when none was found.
 */
export function loadEnvFile(cwd: string = process.cwd()): string | null {
  const candidates = [path.resolve(cwd, '.env'), path.resolve(cwd, '../../.env')];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
  }

  return null;
}
