// SPDX-License-Identifier: AGPL-3.0-only
import { SecretBox } from '../crypto/secret-box.js';
import {
  encryptS3Config,
  localConfigSchema,
  mergeS3Config,
  pointsElsewhere,
  s3ConfigInputSchema,
  toPublicConfig,
} from './storage-pool.config.js';

const secretBox = new SecretBox('a1'.repeat(32));

const s3Input = s3ConfigInputSchema.parse({
  bucket: 'media',
  endpoint: 'https://s3.example.com',
  forcePathStyle: true,
  keyPrefix: 'onyx/',
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'super-secret-value',
});

describe('storage pool config', () => {
  it('requires an absolute local path', () => {
    expect(localConfigSchema.safeParse({ basePath: 'relative/dir' }).success).toBe(false);
    expect(localConfigSchema.safeParse({ basePath: '/var/lib/onyx' }).success).toBe(true);
  });

  it('applies S3 defaults and normalizes the key prefix', () => {
    expect(s3Input.region).toBe('us-east-1');
    expect(s3Input.keyPrefix).toBe('onyx');
  });

  it('rejects an unsafe key prefix and a non-http endpoint', () => {
    const base = { bucket: 'b', accessKeyId: 'a', secretAccessKey: 's' };

    expect(s3ConfigInputSchema.safeParse({ ...base, keyPrefix: '../other' }).success).toBe(false);
    expect(s3ConfigInputSchema.safeParse({ ...base, endpoint: 'ftp://host' }).success).toBe(false);
  });

  it('stores the secret key encrypted and never exposes it publicly', () => {
    const stored = encryptS3Config(s3Input, secretBox);

    expect(stored.secretAccessKey).not.toContain('super-secret-value');
    expect(secretBox.decrypt(stored.secretAccessKey)).toBe('super-secret-value');

    const shown = toPublicConfig('S3', stored);
    expect(shown).toMatchObject({
      bucket: 'media',
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKeySet: true,
    });
    expect(JSON.stringify(shown)).not.toContain(stored.secretAccessKey);
    expect(shown).not.toHaveProperty('secretAccessKey');
  });

  it('keeps the stored secret when an update omits it', () => {
    const stored = encryptS3Config(s3Input, secretBox);
    const merged = mergeS3Config(stored, { region: 'eu-central-1' }, secretBox);

    expect(merged.region).toBe('eu-central-1');
    expect(merged.secretAccessKey).toBe(stored.secretAccessKey);
  });

  it('replaces the secret and removes optional settings on request', () => {
    const stored = encryptS3Config(s3Input, secretBox);
    const merged = mergeS3Config(
      stored,
      { secretAccessKey: 'rotated', endpoint: null, keyPrefix: null },
      secretBox,
    );

    expect(secretBox.decrypt(merged.secretAccessKey)).toBe('rotated');
    expect(merged).not.toHaveProperty('endpoint');
    expect(merged).not.toHaveProperty('keyPrefix');
  });

  it('detects when a change points the pool at another location', () => {
    const stored = encryptS3Config(s3Input, secretBox);

    expect(pointsElsewhere('S3', stored, { ...stored, bucket: 'other' })).toBe(true);
    expect(pointsElsewhere('S3', stored, { ...stored, keyPrefix: 'elsewhere' })).toBe(true);
    expect(
      pointsElsewhere('S3', stored, { ...stored, region: 'eu-west-1', accessKeyId: 'NEW' }),
    ).toBe(false);
    expect(pointsElsewhere('LOCAL', { basePath: '/a' }, { basePath: '/b' })).toBe(true);
    expect(pointsElsewhere('LOCAL', { basePath: '/a' }, { basePath: '/a' })).toBe(false);
  });
});
