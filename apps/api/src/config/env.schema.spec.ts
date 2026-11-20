// SPDX-License-Identifier: AGPL-3.0-only
import { validateEnv } from './env.schema.js';

const validEnv = {
  DATABASE_URL: 'postgresql://onyx:secret@localhost:5432/onyx',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(64),
  PLAYBACK_SIGNING_SECRET: 'b'.repeat(64),
  MASTER_KEY: 'c'.repeat(64),
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(validEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_ROLE).toEqual(['api', 'worker', 'live', 'scheduler']);
    expect(env.API_PORT).toBe(3000);
    expect(env.STORAGE_LOCAL_PATH).toBe('./storage');
  });

  it('parses the port and the role list', () => {
    const env = validateEnv({ ...validEnv, API_PORT: '8080', APP_ROLE: 'api,worker' });

    expect(env.API_PORT).toBe(8080);
    expect(env.APP_ROLE).toEqual(['api', 'worker']);
  });

  it('reports every problem at once', () => {
    const run = () =>
      validateEnv({
        ...validEnv,
        DATABASE_URL: 'mysql://x',
        JWT_SECRET: 'short',
        APP_ROLE: 'nope',
      });

    expect(run).toThrow(/DATABASE_URL must start with postgresql:\/\//);
    expect(run).toThrow(/JWT_SECRET must be at least 32 characters/);
    expect(run).toThrow(/Unknown APP_ROLE value: nope/);
  });

  it('parses the list of allowed origins', () => {
    const env = validateEnv({
      ...validEnv,
      CORS_ORIGINS: 'http://localhost:5173, https://admin.example.com/',
    });

    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://admin.example.com']);
    expect(validateEnv(validEnv).CORS_ORIGINS).toEqual([]);
  });

  it('rejects an origin with a path', () => {
    expect(() => validateEnv({ ...validEnv, CORS_ORIGINS: 'https://example.com/admin' })).toThrow(
      /is not an origin/,
    );
  });

  it('requires the secrets', () => {
    const { MASTER_KEY: _omitted, ...withoutMasterKey } = validEnv;

    expect(() => validateEnv(withoutMasterKey)).toThrow(/MASTER_KEY is required/);
  });

  it('rejects a master key that is not 32 bytes of hex', () => {
    expect(() => validateEnv({ ...validEnv, MASTER_KEY: 'z'.repeat(64) })).toThrow(
      /MASTER_KEY must be 64 hexadecimal characters/,
    );
  });
});
