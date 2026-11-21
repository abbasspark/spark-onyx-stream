// SPDX-License-Identifier: AGPL-3.0-only

/** Removes slashes at the end, so paths can be appended with one slash. */
function trimSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Settings of the website, read on the server when a request comes in.
 * A change needs a restart, not a new build.
 */
export const siteConfig = {
  /** Name shown in the header, the browser tab and to search engines. */
  get name(): string {
    return process.env.WEB_SITE_NAME?.trim() || 'Onyx Stream';
  },
  /** One sentence about the site, for search engines and link previews. */
  get description(): string {
    return process.env.WEB_SITE_DESCRIPTION?.trim() || 'Movies and series, streamed to you.';
  },
  /** Public address of the website, used for links that must be absolute. */
  get url(): string {
    return trimSlashes(process.env.WEB_SITE_URL?.trim() || 'http://localhost:3001');
  },
  /** Where the server reaches the API. Never sent to the browser. */
  get apiUrl(): string {
    return trimSlashes(process.env.WEB_API_URL?.trim() || 'http://localhost:3000');
  },
};

/**
 * Makes an address from the API usable in a link preview or a sitemap, where
 * it must be absolute. Addresses that are already absolute stay as they are.
 */
export function absoluteUrl(pathOrUrl: string): string {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${siteConfig.url}${pathOrUrl}`;
}
