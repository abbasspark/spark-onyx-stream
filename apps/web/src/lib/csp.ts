// SPDX-License-Identifier: AGPL-3.0-only

export interface CspOptions {
  /** A fresh random value for this one response. */
  nonce: string;
  /** Development needs "eval", which React uses to rebuild error stacks. */
  development: boolean;
  /**
   * Origins that serve media and artwork when it is not the site itself, such
   * as a CDN: the value of MEDIA_BASE_URL of the API. Several are separated
   * by spaces or commas, and a host may start with "*." for all its subdomains.
   */
  mediaOrigin?: string;
  /** Addresses of the edge servers, as the API tells them. */
  edgeOrigins?: readonly string[];
  /**
   * Address of the tracker players find each other through, such as
   * "wss://stream.example.com". Pages may open a connection to it.
   */
  trackerOrigin?: string | null;
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

/** Keeps only the scheme, host and port of a WebSocket address. Empty when it is not one. */
export function socketOriginOf(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  try {
    const url = new URL(value);
    return url.protocol === 'ws:' || url.protocol === 'wss:' ? `${url.protocol}//${url.host}` : '';
  } catch {
    return '';
  }
}

/** Every origin media may come from besides the site itself, each one once. */
export function mediaOrigins(
  configured: string | undefined,
  edgeOrigins: readonly string[] = [],
): string[] {
  const origins = [...(configured ?? '').split(/[\s,]+/), ...edgeOrigins]
    .map((value) => originOf(value))
    .filter((origin) => origin !== '');
  return [...new Set(origins)];
}

/**
 * The content security policy of the website.
 *
 * Scripts run only when they carry this response's nonce, or were loaded by
 * one that does. "blob:" is how the player hands video to the browser. Inline
 * style attributes are allowed because progress bars and previews set them.
 */
export function buildCsp({
  nonce,
  development,
  mediaOrigin,
  edgeOrigins = [],
  trackerOrigin,
}: CspOptions): string {
  const media = mediaOrigins(mediaOrigin, edgeOrigins).join(' ');
  const withMedia = (sources: string) => (media ? `${sources} ${media}` : sources);
  const tracker = socketOriginOf(trackerOrigin);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${withMedia("'self' data: blob:")}`,
    // "data:" is for the empty subtitle file the player gives each text
    // track, which works around a fault in Chrome's captions menu.
    `media-src ${withMedia("'self' blob: data:")}`,
    // Development also talks to the dev server over a websocket.
    `connect-src ${withMedia("'self'")}${tracker ? ` ${tracker}` : ''}${development ? ' ws: wss:' : ''}`,
    "font-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}
