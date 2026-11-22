// SPDX-License-Identifier: AGPL-3.0-only
import { siteConfig } from './config';

/** Request header that carries the allowed media origins from the proxy to the layout. */
export const MEDIA_ORIGINS_HEADER = 'x-onyx-media-origins';
/** Name of the meta tag the layout writes them into. */
export const MEDIA_ORIGINS_META = 'onyx-media-origins';

/** How long the answer of the API is used before it is asked again. */
const FRESH_FOR_MS = 10_000;
const TIMEOUT_MS = 2000;

let known: { origins: string[]; at: number } = { origins: [], at: 0 };
let asking: Promise<void> | null = null;

/**
 * Addresses of the edge servers, as the API tells them.
 *
 * Asked at most every few seconds, however many pages are served. When the
 * API cannot be reached, the last answer stays in use: a page must never fail
 * because of this.
 */
export async function knownEdgeOrigins(now: number = Date.now()): Promise<string[]> {
  if (now - known.at < FRESH_FOR_MS) {
    return known.origins;
  }
  asking ??= refresh(now).finally(() => {
    asking = null;
  });
  // The first page after a start waits for the answer. Later ones get the
  // last answer at once while a new one is fetched.
  if (known.at === 0) {
    await asking;
  }
  return known.origins;
}

async function refresh(now: number): Promise<void> {
  try {
    const response = await fetch(`${siteConfig.apiUrl}/v1/catalog/delivery`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`The API answered ${response.status}`);
    }
    const body = (await response.json()) as { origins?: unknown };
    const origins = Array.isArray(body.origins)
      ? body.origins.filter((origin): origin is string => typeof origin === 'string')
      : [];
    known = { origins, at: now };
  } catch {
    // Try again soon, with what was known before.
    known = { origins: known.origins, at: now - FRESH_FOR_MS + 3000 };
  }
}

/** Says whether an address is covered by a list of allowed origins. Entries may start with "*.". */
export function isAllowedOrigin(url: string, allowed: readonly string[], own: string): boolean {
  let target: URL;
  try {
    target = new URL(url, own);
  } catch {
    return false;
  }
  if (target.origin === own) {
    return true;
  }
  return allowed.some((entry) => {
    const wildcard = /^(https?:)\/\/\*\.([^/:]+)(:\d+)?$/.exec(entry);
    if (!wildcard) {
      return entry === target.origin;
    }
    const [, scheme, domain, port = ''] = wildcard;
    return (
      target.protocol === scheme &&
      target.hostname.endsWith(`.${domain}`) &&
      (target.port ? `:${target.port}` : '') === port
    );
  });
}

const RELOADED_KEY = 'onyx-reloaded-for';

/**
 * Makes sure this page may load video from an address.
 *
 * A page allows the media origins that were known when it was loaded. When
 * the API sends a viewer to an edge that was added since, the page is loaded
 * again, once, to get the new list.
 *
 * @returns False when the page is being loaded again and nothing should be played.
 */
export function ensureMediaAllowed(url: string): boolean {
  if (typeof document === 'undefined') {
    return true;
  }
  const meta = document.querySelector(`meta[name="${MEDIA_ORIGINS_META}"]`);
  if (!meta) {
    return true;
  }
  const allowed = (meta.getAttribute('content') ?? '').split(' ').filter(Boolean);
  if (isAllowedOrigin(url, allowed, window.location.origin)) {
    return true;
  }
  try {
    const origin = new URL(url, window.location.origin).origin;
    if (window.sessionStorage.getItem(RELOADED_KEY) === origin) {
      // Loading again did not help. Let the player try and show its own error.
      return true;
    }
    window.sessionStorage.setItem(RELOADED_KEY, origin);
  } catch {
    return true;
  }
  window.location.reload();
  return false;
}
