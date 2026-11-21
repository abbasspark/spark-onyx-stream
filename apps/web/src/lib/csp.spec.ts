// SPDX-License-Identifier: AGPL-3.0-only
import { buildCsp, originOf } from './csp';

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
    expect(policy).toContain("media-src 'self' blob: https://cdn.example.org;");
    expect(policy).toContain("connect-src 'self' https://cdn.example.org;");
    expect(policy).not.toMatch(/script-src[^;]*cdn\.example\.org/);
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
