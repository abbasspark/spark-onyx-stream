// SPDX-License-Identifier: AGPL-3.0-only
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { isSameSiteRequest, readCookie, viewerCookieOptions } from './cookies.js';

const request = (headers: Record<string, string>, secure = false) =>
  ({ headers, secure }) as unknown as Request;

describe('readCookie', () => {
  it('finds a cookie among others', () => {
    const headers = { cookie: 'theme=dark; onyx_viewer=onyx_view_abc; other=1' };
    expect(readCookie(request(headers), 'onyx_viewer')).toBe('onyx_view_abc');
  });

  it('decodes the value and keeps "=" inside it', () => {
    expect(readCookie(request({ cookie: 'a=x%20y=z' }), 'a')).toBe('x y=z');
  });

  it('does not match a cookie whose name only ends the same way', () => {
    expect(readCookie(request({ cookie: 'not_onyx_viewer=1' }), 'onyx_viewer')).toBeNull();
  });

  it('has nothing for a missing header, a missing cookie and a broken value', () => {
    expect(readCookie(request({}), 'a')).toBeNull();
    expect(readCookie(request({ cookie: 'b=1' }), 'a')).toBeNull();
    expect(readCookie(request({ cookie: 'a=%E0%A4%A' }), 'a')).toBeNull();
  });
});

describe('viewerCookieOptions', () => {
  it('is never readable by scripts and secure whenever the request is', () => {
    expect(viewerCookieOptions(request({}))).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    });
    expect(viewerCookieOptions(request({}, true)).secure).toBe(true);
  });
});

describe('isSameSiteRequest', () => {
  it('accepts requests from the site itself', () => {
    const headers = { host: 'watch.example.org', origin: 'https://watch.example.org' };
    expect(isSameSiteRequest(request(headers), [])).toBe(true);
  });

  it('accepts requests without an origin, which no browser page sends across sites', () => {
    expect(isSameSiteRequest(request({ host: 'watch.example.org' }), [])).toBe(true);
  });

  it('refuses another website', () => {
    const headers = { host: 'watch.example.org', origin: 'https://evil.example' };
    expect(isSameSiteRequest(request(headers), [])).toBe(false);
    expect(isSameSiteRequest(request({ host: 'a', origin: 'null' }), [])).toBe(false);
  });

  it('accepts a trusted website and the address a proxy passed on', () => {
    const cross = { host: 'api.internal:3000', origin: 'https://app.example.org' };
    expect(isSameSiteRequest(request(cross), ['https://app.example.org'])).toBe(true);

    const proxied = {
      host: 'localhost:3000',
      origin: 'http://localhost:3001',
      'x-forwarded-host': 'localhost:3001',
    };
    expect(isSameSiteRequest(request(proxied), [])).toBe(true);
  });
});
