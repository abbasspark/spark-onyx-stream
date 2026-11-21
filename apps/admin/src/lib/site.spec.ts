// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from './site';

describe('resolveSiteUrl', () => {
  it('uses the configured address without its last slash', () => {
    expect(resolveSiteUrl('http://localhost:3001/', '/')).toBe('http://localhost:3001');
    expect(resolveSiteUrl(' https://watch.example.org ', '/admin/')).toBe(
      'https://watch.example.org',
    );
  });

  it('points at the root of the origin when the panel lives in a subfolder', () => {
    expect(resolveSiteUrl(undefined, '/admin/')).toBe('');
    expect(resolveSiteUrl('', '/admin/')).toBe('');
  });

  it('knows no address when the panel has the root for itself', () => {
    expect(resolveSiteUrl(undefined, '/')).toBeNull();
  });
});
