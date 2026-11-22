// SPDX-License-Identifier: AGPL-3.0-only
import { isAllowedOrigin, otherServerOf, withAvoid } from './delivery';

describe('isAllowedOrigin', () => {
  const own = 'https://stream.example.com';
  const allowed = [
    'https://edge1.example.net',
    'https://*.cdn.example.org',
    'http://*.lab.test:8080',
  ];

  it('allows the site itself, also for addresses without a host', () => {
    expect(isAllowedOrigin('/v1/media/a/t/hls/master.m3u8', [], own)).toBe(true);
    expect(isAllowedOrigin('https://stream.example.com/v1/live/x', [], own)).toBe(true);
  });

  it('allows the listed origins and nothing near them', () => {
    expect(isAllowedOrigin('https://edge1.example.net/v1/media/a', allowed, own)).toBe(true);
    expect(isAllowedOrigin('https://edge2.example.net/v1/media/a', allowed, own)).toBe(false);
    expect(isAllowedOrigin('http://edge1.example.net/v1/media/a', allowed, own)).toBe(false);
    expect(isAllowedOrigin('https://edge1.example.net:8443/v1/media/a', allowed, own)).toBe(false);
  });

  it('understands an entry for all subdomains', () => {
    expect(isAllowedOrigin('https://fra1.cdn.example.org/x', allowed, own)).toBe(true);
    expect(isAllowedOrigin('https://cdn.example.org/x', allowed, own)).toBe(false);
    expect(isAllowedOrigin('https://evilcdn.example.org.attacker.net/x', allowed, own)).toBe(false);
    expect(isAllowedOrigin('http://a.lab.test:8080/x', allowed, own)).toBe(true);
    expect(isAllowedOrigin('http://a.lab.test/x', allowed, own)).toBe(false);
  });
});

describe('asking for another server', () => {
  const own = 'https://stream.example.com';

  it('names the server of an address, unless it is the site itself', () => {
    expect(otherServerOf('https://edge1.example.net/v1/media/a/t/hls/master.m3u8', own)).toBe(
      'https://edge1.example.net',
    );
    expect(otherServerOf('/v1/media/a/t/hls/master.m3u8', own)).toBeNull();
    expect(otherServerOf('https://stream.example.com/v1/live/x', own)).toBeNull();
  });

  it('adds the server to avoid to the request', () => {
    expect(withAvoid('/v1/catalog/titles/film/playback', null)).toBe(
      '/v1/catalog/titles/film/playback',
    );
    expect(withAvoid('/v1/catalog/titles/film/playback', 'https://edge1.example.net')).toBe(
      '/v1/catalog/titles/film/playback?avoid=https%3A%2F%2Fedge1.example.net',
    );
  });
});
