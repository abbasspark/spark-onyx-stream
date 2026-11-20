// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod';
import { parseAppRoles } from '../roles/app-role.js';

const secret = (name: string) =>
  z
    .string({ error: `${name} is required` })
    .min(32, `${name} must be at least 32 characters. Generate one with: openssl rand -hex 32`);

/**
 * Environment variables the application reads, with validation and defaults.
 * The process refuses to start when a value is missing or invalid.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  APP_ROLE: z
    .string()
    .default('all')
    .transform((value, ctx) => {
      try {
        return parseAppRoles(value);
      } catch (error) {
        ctx.addIssue({ code: 'custom', message: (error as Error).message });
        return z.NEVER;
      }
    }),

  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must start with postgresql://'),

  REDIS_URL: z
    .string({ error: 'REDIS_URL is required' })
    .regex(/^rediss?:\/\//, 'REDIS_URL must start with redis:// or rediss://'),

  JWT_SECRET: secret('JWT_SECRET'),
  PLAYBACK_SIGNING_SECRET: secret('PLAYBACK_SIGNING_SECRET'),
  MASTER_KEY: z
    .string({ error: 'MASTER_KEY is required' })
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'MASTER_KEY must be 64 hexadecimal characters (32 bytes). Generate one with: openssl rand -hex 32',
    ),

  STORAGE_LOCAL_PATH: z.string().min(1).default('./storage'),

  /** Directory where uploads are collected before they move into a storage pool. */
  UPLOAD_TEMP_PATH: z.string().min(1).default('./uploads'),
  /** Largest accepted source file, in bytes. The default is 50 GiB. */
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(50 * 1024 ** 3),

  /** How long a playback URL stays valid, in seconds. Long videos get more time automatically. */
  PLAYBACK_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(7 * 24 * 60 * 60)
    .default(6 * 60 * 60),
  /**
   * Origin that serves media files, for example "https://media.example.com".
   * Empty means the API itself, and playback URLs are then relative paths.
   */
  MEDIA_BASE_URL: z
    .string()
    .default('')
    .transform((value) => value.trim().replace(/\/$/, ''))
    .refine((value) => value === '' || /^https?:\/\/[^/]+$/.test(value), {
      message: 'MEDIA_BASE_URL must be an origin of the form https://host or http://host:port',
    }),

  /** Programs used for media processing. A name is looked up on the PATH. */
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  /** Directory for the working files of processing jobs. Needs room for a source file and its outputs. */
  PROCESSING_TEMP_PATH: z.string().min(1).default('./tmp/processing'),
  /** Processing jobs one worker process runs at the same time. Transcoding uses all CPU cores already. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(1),

  /**
   * Web origins allowed to call the API from a browser, separated by commas,
   * for example "https://admin.example.com". Empty allows same-origin requests only.
   */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value, ctx) => {
      const origins = value
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter((origin) => origin.length > 0);

      for (const origin of origins) {
        if (!/^https?:\/\/[^/]+$/.test(origin)) {
          ctx.addIssue({
            code: 'custom',
            message: `"${origin}" is not an origin. Use the form https://host or http://host:port`,
          });
          return z.NEVER;
        }
      }
      return origins;
    }),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates raw environment variables.
 *
 * @throws Error listing every invalid variable, so all problems can be fixed in one pass.
 */
export function validateEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }

  return result.data;
}
