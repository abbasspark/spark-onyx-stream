// SPDX-License-Identifier: AGPL-3.0-only
import { type NextRequest, NextResponse } from 'next/server';
import { siteConfig } from '@/lib/config';
import { buildCsp, mediaOrigins } from '@/lib/csp';
import { knownDelivery, MEDIA_ORIGINS_HEADER } from '@/lib/delivery';

/**
 * Runs before every request the website answers.
 *
 * Requests to /v1 are passed on to the API. In production the gateway sends
 * them there itself and they never get here. Without a gateway, as in
 * development, this makes the browser talk to one origin either way.
 *
 * Video may come from edge servers, which are added in the admin panel, and
 * players find each other through the tracker. The API tells where those
 * are, and the policy of every page allows them.
 *
 * Pages get a content security policy with a nonce that is new for each
 * response. Next.js reads the policy from the request and puts the nonce on
 * the scripts it writes into the page.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/v1/')) {
    // The API checks that a request that changes a viewer's account comes from
    // this site. It compares the browser's Origin with the address the browser
    // used, which it only knows if it is passed on here.
    const headers = new Headers(request.headers);
    const host = request.headers.get('host');
    if (host) {
      headers.set('x-forwarded-host', host);
    }
    return NextResponse.rewrite(new URL(`${pathname}${search}`, siteConfig.apiUrl), {
      request: { headers },
    });
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const { origins: edgeOrigins, tracker } = await knownDelivery();
  const policy = buildCsp({
    nonce,
    development: process.env.NODE_ENV === 'development',
    mediaOrigin: process.env.WEB_MEDIA_ORIGIN,
    adOrigins: process.env.WEB_AD_ORIGINS,
    edgeOrigins,
    trackerOrigin: tracker,
  });

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  // The page carries the list too, so a tab that was opened before an edge
  // was added can tell that it has to be loaded again.
  headers.set(
    MEDIA_ORIGINS_HEADER,
    mediaOrigins(process.env.WEB_MEDIA_ORIGIN, edgeOrigins).join(' '),
  );
  headers.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Everything except the built files, which are the same for everyone and carry no page.
  matcher: ['/((?!_next/static|_next/image|icon.svg).*)'],
};
