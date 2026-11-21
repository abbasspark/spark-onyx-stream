// SPDX-License-Identifier: AGPL-3.0-only

export interface CspOptions {
  /** A fresh random value for this one response. */
  nonce: string;
  /** Development needs "eval", which React uses to rebuild error stacks. */
  development: boolean;
  /**
   * Origin that serves media and artwork when it is not the site itself, such
   * as a CDN. The value of MEDIA_BASE_URL of the API.
   */
  mediaOrigin?: string;
}

/** Keeps only the scheme, host and port of an address. Empty when it is not one. */
export function originOf(value: string | undefined): string {
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
  } catch {
    return '';
  }
}

/**
 * The content security policy of the website.
 *
 * Scripts run only when they carry this response's nonce, or were loaded by
 * one that does. "blob:" is how the player hands video to the browser. Inline
 * style attributes are allowed because progress bars and previews set them.
 */
export function buildCsp({ nonce, development, mediaOrigin }: CspOptions): string {
  const media = originOf(mediaOrigin);
  const withMedia = (sources: string) => (media ? `${sources} ${media}` : sources);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${withMedia("'self' data: blob:")}`,
    // "data:" is for the empty subtitle file the player gives each text
    // track, which works around a fault in Chrome's captions menu.
    `media-src ${withMedia("'self' blob: data:")}`,
    // Development also talks to the dev server over a websocket.
    `connect-src ${withMedia("'self'")}${development ? ' ws: wss:' : ''}`,
    "font-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}
