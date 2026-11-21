// SPDX-License-Identifier: AGPL-3.0-only
import { type NextRequest, NextResponse } from 'next/server';
import { siteConfig } from '@/lib/config';
import { buildCsp } from '@/lib/csp';

/**
 * Runs before every request the website answers.
 *
 * Requests to /v1 are passed on to the API. In production the gateway sends
 * them there itself and they never get here. Without a gateway, as in
 * development, this makes the browser talk to one origin either way.
 *
 * Pages get a content security policy with a nonce that is new for each
 * response. Next.js reads the policy from the request and puts the nonce on
 * the scripts it writes into the page.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/v1/')) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, siteConfig.apiUrl));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = buildCsp({
    nonce,
    development: process.env.NODE_ENV === 'development',
    mediaOrigin: process.env.WEB_MEDIA_ORIGIN,
  });

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Everything except the built files, which are the same for everyone and carry no page.
  matcher: ['/((?!_next/static|_next/image|icon.svg).*)'],
};
