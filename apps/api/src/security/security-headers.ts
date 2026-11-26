// SPDX-License-Identifier: AGPL-3.0-only
import type { RequestHandler } from 'express';
import helmet from 'helmet';

/** How long a browser keeps using HTTPS for the address after seeing the header. */
const HSTS_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/**
 * Security headers for every response of the API.
 *
 * The API answers with JSON, media and pictures and never with a page, so the
 * content policy forbids loading anything from a response. Media and artwork
 * are opened by players and pages on other sites, so those responses must stay
 * readable across origins: the default `same-origin` resource policy of
 * Helmet would stop them. HSTS does not cover subdomains, because an
 * installation does not own the other names under its domain.
 *
 * The header is only honoured by browsers over HTTPS, so it does no harm on a
 * plain HTTP installation.
 */
export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    frameguard: { action: 'deny' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    strictTransportSecurity: { maxAge: HSTS_MAX_AGE_SECONDS, includeSubDomains: false },
  });
}
