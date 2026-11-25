// SPDX-License-Identifier: AGPL-3.0-only
import { adSources, buildCsp, mediaOrigins, originOf, socketOriginOf } from './csp';

describe('ads in the policy', () => {
  it('opens nothing until the operator names the hosts of the ads', () => {
    const policy = buildCsp({ nonce: 'n', development: false });
    expect(policy).toContain("media-src 'self' blob: data:;");
    expect(policy).toContain("img-src 'self' data: blob:;");
  });

  it('lets pictures and video come from the hosts that are named, and from nowhere else', () => {
    const policy = buildCsp({
      nonce: 'n',
      development: false,
      adOrigins: 'https://ads.example.com, https://*.adcdn.example.net/x',
    });
    expect(policy).toContain(
      "media-src 'self' blob: data: https://ads.example.com https://*.adcdn.example.net;",
    );
    expect(policy).toContain(
      "img-src 'self' data: blob: https://ads.example.com https://*.adcdn.example.net;",
    );
    expect(policy).toContain("connect-src 'self';");
    expect(policy).not.toMatch(/script-src[^;]*example/);
  });

  it('takes * for any https address, and only for pictures and video', () => {
    expect(adSources('*')).toEqual(['https:']);
    const policy = buildCsp({ nonce: 'n', development: false, adOrigins: '*' });
    expect(policy).toContain("media-src 'self' blob: data: https:;");
    expect(policy).toContain("connect-src 'self';");
  });
});

describe('buildCsp', () => {
  it('lets scripts run only with the nonce', () => {
    const policy = buildCsp({ nonce: 'abc123', development: false });
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic';");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'self'");
  });

  it('allows what development tools need, and only in development', () => {
    const policy = buildCsp({ nonce: 'n', development: true });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' ws: wss:");
  });

  it('adds a separate media origin where media is loaded from', () => {
    const policy = buildCsp({
      nonce: 'n',
      development: false,
      mediaOrigin: 'https://cdn.example.org/media/',
    });
    expect(policy).toContain("img-src 'self' data: blob: https://cdn.example.org;");
    expect(policy).toContain("media-src 'self' blob: data: https://cdn.example.org;");
    expect(policy).toContain("connect-src 'self' https://cdn.example.org;");
    expect(policy).not.toMatch(/script-src[^;]*cdn\.example\.org/);
  });
});

describe('mediaOrigins', () => {
  it('joins what is configured with the edges, each origin once', () => {
    expect(
      mediaOrigins('https://cdn.example.org, https://*.edge.example.org', [
        'https://edge1.example.net',
        'https://cdn.example.org/',
        'not an address',
      ]),
    ).toEqual([
      'https://cdn.example.org',
      'https://*.edge.example.org',
      'https://edge1.example.net',
    ]);
    expect(mediaOrigins(undefined)).toEqual([]);
  });

  it('puts the edges into the policy for media, pictures and requests only', () => {
    const policy = buildCsp({
      nonce: 'n',
      development: false,
      edgeOrigins: ['https://edge1.example.net', 'https://edge2.example.net'],
    });
    expect(policy).toContain(
      "media-src 'self' blob: data: https://edge1.example.net https://edge2.example.net;",
    );
    expect(policy).toContain(
      "connect-src 'self' https://edge1.example.net https://edge2.example.net;",
    );
    expect(policy).not.toMatch(/script-src[^;]*edge1/);
  });
});

describe('the tracker', () => {
  it('may be connected to, and nothing else is opened by it', () => {
    const policy = buildCsp({
      nonce: 'n',
      development: false,
      trackerOrigin: 'wss://stream.example.com/tracker?token=abc',
    });
    expect(policy).toContain("connect-src 'self' wss://stream.example.com;");
    expect(policy).toContain("media-src 'self' blob: data:;");
  });

  it('is left out when it is not the address of one', () => {
    expect(socketOriginOf('https://stream.example.com')).toBe('');
    expect(socketOriginOf('wss://x; script-src *')).toBe('');
    expect(socketOriginOf(null)).toBe('');
    expect(buildCsp({ nonce: 'n', development: false, trackerOrigin: null })).toContain(
      "connect-src 'self';",
    );
  });
});

describe('originOf', () => {
  it('reduces an address to its origin', () => {
    expect(originOf('https://cdn.example.org:8443/a/b?c=1')).toBe('https://cdn.example.org:8443');
  });

  it('ignores what could smuggle something into the policy', () => {
    expect(originOf(undefined)).toBe('');
    expect(originOf('')).toBe('');
    expect(originOf("'unsafe-inline'; script-src *")).toBe('');
    expect(originOf('javascript:alert(1)')).toBe('');
  });
});
