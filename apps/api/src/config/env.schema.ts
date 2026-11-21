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
export const envSchema = z
  .object({
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
     * Who may play published titles through the public catalog.
     * "open": anyone who can reach the site. "viewers": only signed-in viewers.
     * "off": nobody. The catalog can be browsed in every case.
     */
    CATALOG_PLAYBACK: z.enum(['open', 'viewers', 'off']).default('open'),
    /**
     * Whether people can create a viewer account themselves.
     * "closed": only admins create viewers, in the panel.
     */
    VIEWER_REGISTRATION: z.enum(['open', 'closed']).default('open'),
    /**
     * Whether a viewer must confirm their email address before they can watch.
     * Only has an effect on playback that needs a viewer (CATALOG_PLAYBACK=viewers).
     * "required" needs email to be set up (SMTP_URL).
     */
    VIEWER_EMAIL_VERIFICATION: z.enum(['optional', 'required']).default('optional'),

    /**
     * Mail server for the emails viewers get: confirming an address and setting
     * a new password. For example "smtps://user:password@smtp.example.com:465"
     * or "smtp://user:password@smtp.example.com:587". Empty turns email off.
     */
    SMTP_URL: z
      .string()
      .default('')
      .transform((value) => value.trim())
      .refine((value) => value === '' || /^smtps?:\/\/[^/]+/.test(value), {
        message: 'SMTP_URL must start with smtp:// or smtps://',
      }),
    /** Sender of those emails, for example "Onyx Stream <no-reply@example.com>". */
    MAIL_FROM: z
      .string()
      .default('')
      .transform((value) => value.trim())
      .refine(
        (value) =>
          value === '' || /^[^<>@\s]+@[^<>@\s]+$|^[^<>]*<[^<>@\s]+@[^<>@\s]+>$/.test(value),
        {
          message: 'MAIL_FROM must be an address, or of the form: Name <address@example.com>',
        },
      ),
    /**
     * Address of the viewer website as people open it, for example
     * "https://watch.example.com". The links in emails lead there.
     */
    SITE_URL: z
      .string()
      .default('')
      .transform((value) => value.trim().replace(/\/$/, ''))
      .refine((value) => value === '' || /^https?:\/\/[^/]+$/.test(value), {
        message: 'SITE_URL must be an origin of the form https://host or http://host:port',
      }),
    /** Name of the site, as emails call it. */
    SITE_NAME: z
      .string()
      .default('Onyx Stream')
      .transform((value) => value.trim() || 'Onyx Stream'),

    /**
     * Access to The Movie Database (TMDB), to import details and artwork of
     * titles. Either the "API Read Access Token" or the shorter "API Key" of a
     * TMDB account. Empty turns the import off.
     */
    TMDB_API_TOKEN: z
      .string()
      .default('')
      .transform((value) => value.trim()),
    /** Language details are imported in when the admin does not choose one. */
    METADATA_LANGUAGE: z
      .string()
      .default('en-US')
      .refine((value) => /^[a-z]{2}(-[A-Z]{2})?$/.test(value), {
        message: 'METADATA_LANGUAGE must be of the form en or en-US',
      }),
    /** Country whose age ratings are imported, as two capital letters. */
    METADATA_REGION: z
      .string()
      .default('US')
      .refine((value) => /^[A-Z]{2}$/.test(value), {
        message: 'METADATA_REGION must be a country code of two capital letters, such as US',
      }),
    /** Where TMDB is reached. Only changed for tests or a mirror. */
    TMDB_API_URL: z
      .string()
      .default('https://api.themoviedb.org/3')
      .transform((value) => value.trim().replace(/\/$/, ''))
      .refine((value) => /^https?:\/\/[^/]+/.test(value), {
        message: 'TMDB_API_URL must start with https:// or http://',
      }),
    TMDB_IMAGE_URL: z
      .string()
      .default('https://image.tmdb.org/t/p')
      .transform((value) => value.trim().replace(/\/$/, ''))
      .refine((value) => /^https?:\/\/[^/]+/.test(value), {
        message: 'TMDB_IMAGE_URL must start with https:// or http://',
      }),

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
     * Number of reverse proxies in front of the API, such as the Nginx gateway.
     * The client address is then taken from the X-Forwarded-For header. Zero
     * means the API is reached directly and the header is ignored.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

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
  })
  .superRefine((env, ctx) => {
    if (env.SMTP_URL !== '') {
      if (env.MAIL_FROM === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['MAIL_FROM'],
          message: 'MAIL_FROM is required when SMTP_URL is set',
        });
      }
      if (env.SITE_URL === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['SITE_URL'],
          message: 'SITE_URL is required when SMTP_URL is set, for the links in emails',
        });
      }
    }
    if (env.VIEWER_EMAIL_VERIFICATION === 'required' && env.SMTP_URL === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['VIEWER_EMAIL_VERIFICATION'],
        message: 'VIEWER_EMAIL_VERIFICATION=required needs SMTP_URL, or nobody could confirm',
      });
    }
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
