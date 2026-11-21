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

  describe('email', () => {
    const mail = {
      SMTP_URL: 'smtps://user:password@smtp.example.com:465',
      MAIL_FROM: 'Onyx Stream <no-reply@example.com>',
      SITE_URL: 'https://watch.example.com/',
    };

    it('is off by default', () => {
      const env = validateEnv(validEnv);
      expect(env.SMTP_URL).toBe('');
      expect(env.VIEWER_EMAIL_VERIFICATION).toBe('optional');
      expect(env.SITE_NAME).toBe('Onyx Stream');
    });

    it('accepts a mail server with a sender and the address of the site', () => {
      const env = validateEnv({ ...validEnv, ...mail, MAIL_FROM: 'no-reply@example.com' });
      expect(env.SITE_URL).toBe('https://watch.example.com');
      expect(env.MAIL_FROM).toBe('no-reply@example.com');
    });

    it('needs the sender and the address of the site with a mail server', () => {
      expect(() => validateEnv({ ...validEnv, SMTP_URL: mail.SMTP_URL })).toThrow(
        /MAIL_FROM is required when SMTP_URL is set[\s\S]*SITE_URL is required when SMTP_URL is set/,
      );
    });

    it('rejects values of the wrong form', () => {
      expect(() => validateEnv({ ...validEnv, ...mail, SMTP_URL: 'smtp.example.com' })).toThrow(
        /SMTP_URL must start with smtp:\/\/ or smtps:\/\//,
      );
      expect(() => validateEnv({ ...validEnv, ...mail, MAIL_FROM: 'Onyx Stream' })).toThrow(
        /MAIL_FROM must be an address/,
      );
      expect(() =>
        validateEnv({ ...validEnv, ...mail, SITE_URL: 'https://example.com/watch' }),
      ).toThrow(/SITE_URL must be an origin/);
    });

    it('cannot require confirmed addresses without a mail server', () => {
      expect(() => validateEnv({ ...validEnv, VIEWER_EMAIL_VERIFICATION: 'required' })).toThrow(
        /VIEWER_EMAIL_VERIFICATION=required needs SMTP_URL/,
      );
      expect(
        validateEnv({ ...validEnv, ...mail, VIEWER_EMAIL_VERIFICATION: 'required' })
          .VIEWER_EMAIL_VERIFICATION,
      ).toBe('required');
    });
  });
});
