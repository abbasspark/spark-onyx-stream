// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import type { StorageDriver as StorageDriverKind } from '@onyx/database';
import { z } from 'zod';
import type { SecretBox } from '../crypto/secret-box.js';
import { normalizeStorageKey } from './storage-key.js';

/**
 * Settings of a storage pool, per driver.
 *
 * Three shapes exist for S3:
 *   input   what the API accepts, with the secret key in plain text
 *   stored  what the database holds, with the secret key encrypted
 *   public  what the API returns, without the secret key
 */

export const localConfigSchema = z.object({
  basePath: z
    .string()
    .min(1)
    .max(1024)
    .refine(
      (value) => path.isAbsolute(value),
      'Enter an absolute path, for example /var/lib/onyx/storage',
    ),
});
export type LocalConfig = z.infer<typeof localConfigSchema>;

const keyPrefixSchema = z
  .string()
  .max(512)
  .transform((value, ctx) => {
    try {
      return normalizeStorageKey(value);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message });
      return z.NEVER;
    }
  });

const s3SharedShape = {
  bucket: z.string().min(1).max(255),
  region: z.string().min(1).max(64).default('us-east-1'),
  /** Custom endpoint for S3-compatible services. Leave out for AWS. */
  endpoint: z.url({ protocol: /^https?$/, error: 'Enter an http or https URL' }).optional(),
  forcePathStyle: z.boolean().default(false),
  keyPrefix: keyPrefixSchema.optional(),
  accessKeyId: z.string().min(1).max(255),
};

export const s3ConfigInputSchema = z.object({
  ...s3SharedShape,
  secretAccessKey: z.string().min(1).max(1024),
});
export type S3ConfigInput = z.infer<typeof s3ConfigInputSchema>;

/** On update every field is optional. An omitted secret key keeps the stored one. */
export const s3ConfigUpdateSchema = z.object({
  bucket: s3SharedShape.bucket.optional(),
  region: z.string().min(1).max(64).optional(),
  endpoint: s3SharedShape.endpoint.nullable(),
  forcePathStyle: z.boolean().optional(),
  keyPrefix: keyPrefixSchema.nullable().optional(),
  accessKeyId: s3SharedShape.accessKeyId.optional(),
  secretAccessKey: z.string().min(1).max(1024).optional(),
});
export type S3ConfigUpdate = z.infer<typeof s3ConfigUpdateSchema>;

export const s3StoredConfigSchema = z.object({
  bucket: z.string(),
  region: z.string(),
  endpoint: z.string().optional(),
  forcePathStyle: z.boolean(),
  keyPrefix: z.string().optional(),
  accessKeyId: z.string(),
  /** Encrypted with SecretBox. */
  secretAccessKey: z.string(),
});
export type S3StoredConfig = z.infer<typeof s3StoredConfigSchema>;

export type S3PublicConfig = Omit<S3StoredConfig, 'secretAccessKey'> & {
  /** Always true. Tells the panel a secret is stored without revealing it. */
  secretAccessKeySet: true;
};

export type PublicPoolConfig = LocalConfig | S3PublicConfig;

export function encryptS3Config(input: S3ConfigInput, secretBox: SecretBox): S3StoredConfig {
  return { ...input, secretAccessKey: secretBox.encrypt(input.secretAccessKey) };
}

/** Applies an update to a stored S3 configuration, encrypting a new secret key if one is given. */
export function mergeS3Config(
  stored: S3StoredConfig,
  update: S3ConfigUpdate,
  secretBox: SecretBox,
): S3StoredConfig {
  const merged: S3StoredConfig = {
    ...stored,
    ...(update.bucket !== undefined ? { bucket: update.bucket } : {}),
    ...(update.region !== undefined ? { region: update.region } : {}),
    ...(update.forcePathStyle !== undefined ? { forcePathStyle: update.forcePathStyle } : {}),
    ...(update.accessKeyId !== undefined ? { accessKeyId: update.accessKeyId } : {}),
    ...(update.secretAccessKey !== undefined
      ? { secretAccessKey: secretBox.encrypt(update.secretAccessKey) }
      : {}),
  };

  // null removes an optional setting, undefined leaves it unchanged.
  if (update.endpoint === null) {
    delete merged.endpoint;
  } else if (update.endpoint !== undefined) {
    merged.endpoint = update.endpoint;
  }
  if (update.keyPrefix === null) {
    delete merged.keyPrefix;
  } else if (update.keyPrefix !== undefined) {
    merged.keyPrefix = update.keyPrefix;
  }

  return merged;
}

/** Parses the config column of a pool. Throws when it does not match its driver. */
export function parseStoredConfig(driver: 'LOCAL', config: unknown): LocalConfig;
export function parseStoredConfig(driver: 'S3', config: unknown): S3StoredConfig;
export function parseStoredConfig(
  driver: StorageDriverKind,
  config: unknown,
): LocalConfig | S3StoredConfig;
export function parseStoredConfig(
  driver: StorageDriverKind,
  config: unknown,
): LocalConfig | S3StoredConfig {
  return driver === 'LOCAL' ? localConfigSchema.parse(config) : s3StoredConfigSchema.parse(config);
}

export function toPublicConfig(driver: StorageDriverKind, config: unknown): PublicPoolConfig {
  if (driver === 'LOCAL') {
    return parseStoredConfig('LOCAL', config);
  }
  const { secretAccessKey: _secret, ...rest } = parseStoredConfig('S3', config);
  return { ...rest, secretAccessKeySet: true };
}

/**
 * True when two configurations of the same driver point at different places,
 * so that files written under one cannot be found under the other.
 */
export function pointsElsewhere(
  driver: StorageDriverKind,
  before: LocalConfig | S3StoredConfig,
  after: LocalConfig | S3StoredConfig,
): boolean {
  if (driver === 'LOCAL') {
    return (before as LocalConfig).basePath !== (after as LocalConfig).basePath;
  }
  const a = before as S3StoredConfig;
  const b = after as S3StoredConfig;
  return a.bucket !== b.bucket || (a.keyPrefix ?? '') !== (b.keyPrefix ?? '');
}
