// SPDX-License-Identifier: AGPL-3.0-only
import { redisOptionsFromUrl } from './redis-options.js';

describe('redisOptionsFromUrl', () => {
  it('parses host and port', () => {
    expect(redisOptionsFromUrl('redis://cache.internal:6380')).toEqual({
      host: 'cache.internal',
      port: 6380,
    });
  });

  it('defaults the port', () => {
    expect(redisOptionsFromUrl('redis://localhost')).toEqual({ host: 'localhost', port: 6379 });
  });

  it('parses credentials and the database index', () => {
    expect(redisOptionsFromUrl('redis://user:p%40ss@localhost:6379/2')).toEqual({
      host: 'localhost',
      port: 6379,
      username: 'user',
      password: 'p@ss',
      db: 2,
    });
  });

  it('enables TLS for rediss://', () => {
    expect(redisOptionsFromUrl('rediss://localhost')).toMatchObject({ tls: {} });
  });

  it('rejects other protocols', () => {
    expect(() => redisOptionsFromUrl('http://localhost')).toThrow('redis:// or rediss://');
  });

  it('rejects an invalid database index', () => {
    expect(() => redisOptionsFromUrl('redis://localhost/abc')).toThrow('non-negative integer');
  });
});
