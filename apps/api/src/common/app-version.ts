// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';

let cached: string | undefined;

/** The version of the application, as its package says. */
export function appVersion(): string {
  if (cached === undefined) {
    try {
      // Two levels up from here is the package, in the source tree and in the build alike.
      const manifest = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
      cached = String((JSON.parse(manifest) as { version?: unknown }).version ?? 'unknown');
    } catch {
      cached = 'unknown';
    }
  }
  return cached;
}
