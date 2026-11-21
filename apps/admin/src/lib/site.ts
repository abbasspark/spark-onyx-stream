// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Address of the viewer website, without a slash at the end, or null when the
 * panel does not know it.
 *
 * Behind the gateway the panel lives under /admin/ and the website at the
 * root of the same origin. Elsewhere, such as in development, the address
 * comes from VITE_SITE_URL.
 */
export function resolveSiteUrl(configured: string | undefined, basePath: string): string | null {
  const explicit = configured?.trim().replace(/\/+$/, '');
  if (explicit) {
    return explicit;
  }
  // An empty text is the root of this origin: "" + "/title/x" is "/title/x".
  return basePath !== '/' ? '' : null;
}

export const SITE_URL = resolveSiteUrl(
  import.meta.env.VITE_SITE_URL as string | undefined,
  import.meta.env.BASE_URL,
);
