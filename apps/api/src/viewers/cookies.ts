// SPDX-License-Identifier: AGPL-3.0-only
import type { CookieOptions, Request } from 'express';

/** Name of the cookie that holds a viewer's session token. */
export const VIEWER_COOKIE = 'onyx_viewer';

/** Reads one cookie from the request. Null when it is not there or cannot be read. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) {
      continue;
    }
    const raw = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * How the session cookie is set.
 *
 * - httpOnly: scripts on the page cannot read the token, so injected script cannot steal it.
 * - sameSite "lax": other websites cannot make the browser send it with their requests.
 * - secure: only over HTTPS, whenever the request itself came over HTTPS.
 */
export function viewerCookieOptions(request: Request, expiresAt?: Date): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.secure,
    path: '/',
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

/**
 * Whether a request that changes something may rely on the cookie.
 *
 * A browser names the website a request comes from in the Origin header.
 * The cookie counts only when that is this site itself or a website the
 * installation trusts. Requests without the header come from apps and
 * scripts, which cannot be tricked the way a browser can.
 *
 * @param trustedOrigins Origins from CORS_ORIGINS.
 */
export function isSameSiteRequest(request: Request, trustedOrigins: readonly string[]): boolean {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  if (trustedOrigins.includes(origin)) {
    return true;
  }
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // A proxy in front, such as the website in development, passes the
  // address the browser used in X-Forwarded-Host. Another website cannot
  // add that header to a request it makes a browser send.
  const forwarded = request.headers['x-forwarded-host'];
  const hosts = [request.headers.host, Array.isArray(forwarded) ? forwarded[0] : forwarded];
  return hosts.some((host) => host !== undefined && host.split(',')[0]?.trim() === originHost);
}
