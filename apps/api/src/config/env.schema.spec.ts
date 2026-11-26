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

  it('leaves the metrics endpoint off unless a long enough token is set', () => {
    expect(validateEnv(validEnv).METRICS_TOKEN).toBe('');
    expect(validateEnv({ ...validEnv, METRICS_TOKEN: 'm'.repeat(32) }).METRICS_TOKEN).toBe(
      'm'.repeat(32),
    );
    expect(() => validateEnv({ ...validEnv, METRICS_TOKEN: 'short' })).toThrow(
      /METRICS_TOKEN must be at least 32 characters/,
    );
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

  describe('P2P', () => {
    it('is off by default', () => {
      const env = validateEnv(validEnv);
      expect(env.P2P_TRACKER_URL).toBe('');
      expect(env.P2P_TRACKER_INTERNAL_URL).toBe('http://127.0.0.1:8070');
    });

    it('needs the secret it shares with the tracker', () => {
      const tracker = { P2P_TRACKER_URL: 'wss://stream.example.com/tracker/' };
      expect(() => validateEnv({ ...validEnv, ...tracker })).toThrow(/P2P_TRACKER_SECRET/);
      expect(() => validateEnv({ ...validEnv, ...tracker, P2P_TRACKER_SECRET: 'short' })).toThrow(
        /at least 32 characters/,
      );
      const env = validateEnv({ ...validEnv, ...tracker, P2P_TRACKER_SECRET: 's'.repeat(32) });
      expect(env.P2P_TRACKER_URL).toBe('wss://stream.example.com/tracker');
    });

    it('needs the secret of the TURN server with its address', () => {
      const turn = { P2P_TURN_URLS: 'turn:turn.example.com:3478' };
      expect(() => validateEnv({ ...validEnv, ...turn })).toThrow(/P2P_TURN_SECRET/);
      expect(() => validateEnv({ ...validEnv, P2P_TURN_URLS: 'https://turn.example.com' })).toThrow(
        /P2P_TURN_URLS/,
      );
      const env = validateEnv({ ...validEnv, ...turn, P2P_TURN_SECRET: 's'.repeat(16) });
      expect(env.P2P_TURN_URLS).toEqual(['turn:turn.example.com:3478']);
      expect(validateEnv(validEnv).P2P_TURN_URLS).toEqual([]);
    });

    it('takes only addresses a player can connect to', () => {
      for (const url of ['https://stream.example.com/tracker', 'stream.example.com', 'wss://']) {
        expect(() =>
          validateEnv({ ...validEnv, P2P_TRACKER_URL: url, P2P_TRACKER_SECRET: 's'.repeat(32) }),
        ).toThrow(/P2P_TRACKER_URL/);
      }
      expect(() => validateEnv({ ...validEnv, P2P_TRACKER_INTERNAL_URL: 'tracker:8070' })).toThrow(
        /P2P_TRACKER_INTERNAL_URL/,
      );
    });
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

  describe('billing', () => {
    it('prices are in euros unless told otherwise', () => {
      expect(validateEnv(validEnv).BILLING_CURRENCY).toBe('EUR');
      expect(validateEnv({ ...validEnv, BILLING_CURRENCY: 'USD' }).BILLING_CURRENCY).toBe('USD');
    });

    it('rejects a currency or a contact address of the wrong form', () => {
      expect(() => validateEnv({ ...validEnv, BILLING_CURRENCY: 'euro' })).toThrow(
        /BILLING_CURRENCY must be three capital letters/,
      );
      expect(() => validateEnv({ ...validEnv, BILLING_CONTACT_URL: 'call us' })).toThrow(
        /BILLING_CONTACT_URL must start with/,
      );
      expect(
        validateEnv({ ...validEnv, BILLING_CONTACT_URL: 'mailto:billing@example.com' })
          .BILLING_CONTACT_URL,
      ).toBe('mailto:billing@example.com');
    });
  });
  describe('Stripe', () => {
    const stripe = {
      ...validEnv,
      SITE_URL: 'https://watch.example.com',
      STRIPE_SECRET_KEY: ' sk_test_abc123 ',
      STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
    };

    it('is off unless a key is set', () => {
      const env = validateEnv(validEnv);
      expect(env.STRIPE_SECRET_KEY).toBe('');
      expect(env.STRIPE_API_URL).toBe('https://api.stripe.com');
      expect(env.STRIPE_AUTOMATIC_TAX).toBe('false');
    });

    it('accepts test, live and restricted keys', () => {
      expect(validateEnv(stripe).STRIPE_SECRET_KEY).toBe('sk_test_abc123');
      for (const key of ['sk_live_abc', 'rk_test_abc', 'rk_live_abc']) {
        expect(validateEnv({ ...stripe, STRIPE_SECRET_KEY: key }).STRIPE_SECRET_KEY).toBe(key);
      }
    });

    it('rejects a publishable key and other mix-ups', () => {
      expect(() => validateEnv({ ...stripe, STRIPE_SECRET_KEY: 'pk_test_abc' })).toThrow(
        /STRIPE_SECRET_KEY must start with/,
      );
      expect(() => validateEnv({ ...stripe, STRIPE_WEBHOOK_SECRET: 'sk_test_abc' })).toThrow(
        /STRIPE_WEBHOOK_SECRET must start with whsec_/,
      );
    });

    it('needs the webhook secret and the address of the site with the key', () => {
      expect(() => validateEnv({ ...stripe, STRIPE_WEBHOOK_SECRET: '' })).toThrow(
        /STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set/,
      );
      expect(() => validateEnv({ ...stripe, SITE_URL: '' })).toThrow(
        /SITE_URL is required when STRIPE_SECRET_KEY is set/,
      );
      expect(() => validateEnv({ ...validEnv, STRIPE_WEBHOOK_SECRET: 'whsec_abc' })).toThrow(
        /STRIPE_SECRET_KEY is required when STRIPE_WEBHOOK_SECRET is set/,
      );
    });
  });
});
