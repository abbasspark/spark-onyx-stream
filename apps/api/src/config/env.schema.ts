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
     * Currency of all prices, as three capital letters such as EUR or USD.
     * Decide before the first plan: prices are stored as numbers and do not
     * convert themselves.
     */
    BILLING_CURRENCY: z
      .string()
      .default('EUR')
      .refine((value) => /^[A-Z]{3}$/.test(value), {
        message: 'BILLING_CURRENCY must be three capital letters, such as EUR',
      }),
    /**
     * Where viewers ask for a subscription while there is no online payment:
     * a web address or "mailto:billing@example.com". Empty shows no link.
     */
    BILLING_CONTACT_URL: z
      .string()
      .default('')
      .transform((value) => value.trim())
      .refine(
        (value) => value === '' || /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/.test(value),
        {
          message: 'BILLING_CONTACT_URL must start with https://, http:// or mailto:',
        },
      ),

    /**
     * Renting a title: how many days a viewer has to start watching, and how
     * many hours to finish once they started.
     */
    RENTAL_START_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    RENTAL_WATCH_HOURS: z.coerce.number().int().min(1).max(720).default(48),

    /**
     * Secret key of a Stripe account, to sell subscriptions online. It starts
     * with "sk_test_" while testing and "sk_live_" for real payments; a
     * restricted key ("rk_") works too. Empty means no online payment: access
     * is then granted by an admin.
     */
    STRIPE_SECRET_KEY: z
      .string()
      .default('')
      .transform((value) => value.trim())
      .refine((value) => value === '' || /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(value), {
        message: 'STRIPE_SECRET_KEY must start with sk_test_, sk_live_, rk_test_ or rk_live_',
      }),
    /**
     * Signing secret of the webhook endpoint at Stripe, which starts with
     * "whsec_". Stripe reports renewals, cancellations and failed payments to
     * that endpoint, and this proves a report is from Stripe.
     */
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .default('')
      .transform((value) => value.trim())
      .refine((value) => value === '' || /^whsec_[A-Za-z0-9+/=_-]+$/.test(value), {
        message: 'STRIPE_WEBHOOK_SECRET must start with whsec_',
      }),
    /**
     * Lets Stripe Tax work out the tax of each payment. Needs Stripe Tax set
     * up in the Stripe account. Prices of plans then include the tax.
     */
    STRIPE_AUTOMATIC_TAX: z.enum(['true', 'false']).default('false'),
    /** Where Stripe is reached. Only changed for tests. */
    STRIPE_API_URL: z
      .string()
      .default('https://api.stripe.com')
      .transform((value) => value.trim().replace(/\/$/, ''))
      .refine((value) => /^https?:\/\/[^/]+/.test(value), {
        message: 'STRIPE_API_URL must start with https:// or http://',
      }),

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
    /** Directory live channels write their playlists and segments to. Temporary files: a few megabytes per channel. */
    LIVE_PATH: z.string().min(1).default('./tmp/live'),
    /** Wanted length of a live segment in seconds. Shorter means less delay and more requests. */
    LIVE_SEGMENT_SECONDS: z.coerce.number().int().min(1).max(10).default(4),
    /** Segments a live playlist lists. Players can go back this far. */
    LIVE_PLAYLIST_SEGMENTS: z.coerce.number().int().min(3).max(60).default(6),
    /**
     * Speed setting of the H.264 encoder for transcoded channels. Faster settings
     * use less CPU and give a slightly worse picture at the same bitrate.
     */
    LIVE_TRANSCODE_PRESET: z
      .enum(['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'])
      .default('veryfast'),
    /** Hours after which the programme guide is imported again from its sources. */
    GUIDE_REFRESH_HOURS: z.coerce.number().int().min(1).max(168).default(6),
    /**
     * Address players reach the tracker at, such as "wss://stream.example.com/tracker".
     * Empty switches P2P between viewers off.
     */
    P2P_TRACKER_URL: z
      .string()
      .default('')
      .transform((value) => value.trim().replace(/\/+$/, ''))
      .refine((value) => value === '' || /^wss?:\/\/[^/?#]+(\/[^?#]*)?$/.test(value), {
        message: 'P2P_TRACKER_URL must be an address of the form wss://host/path',
      }),
    /** Where the API reaches the tracker to read its figures. */
    P2P_TRACKER_INTERNAL_URL: z
      .string()
      .default('http://127.0.0.1:8070')
      .transform((value) => value.trim().replace(/\/+$/, ''))
      .refine((value) => /^https?:\/\/[^/]+$/.test(value), {
        message: 'P2P_TRACKER_INTERNAL_URL must be an address of the form http://host:port',
      }),
    /**
     * STUN servers players ask for their own public address, which two viewers
     * behind home routers need to reach each other. Separated by commas. Empty
     * uses none, and then only viewers in the same network connect.
     */
    P2P_STUN_URLS: z
      .string()
      .default('stun:stun.l.google.com:19302,stun:global.stun.twilio.com:3478')
      .transform((value) =>
        value
          .split(',')
          .map((url) => url.trim())
          .filter((url) => url !== ''),
      )
      .refine((urls) => urls.every((url) => /^stuns?:[A-Za-z0-9.-]+(:\d{1,5})?$/.test(url)), {
        message: 'P2P_STUN_URLS takes addresses of the form stun:host:port, separated by commas',
      }),
    /** Shared with the tracker (its ONYX_TRACKER_SECRET), which lets in only players with a token signed with it. */
    P2P_TRACKER_SECRET: z.string().default(''),
    /** Control API of the ingest server (MediaMTX), as the API and the live processes reach it. */
    INGEST_API_URL: z.url().default('http://127.0.0.1:9997'),
    /** RTSP address of the ingest server, as the live processes reach it. */
    INGEST_RTSP_URL: z
      .string()
      .regex(/^rtsps?:\/\//)
      .default('rtsp://127.0.0.1:8554'),
    /**
     * Addresses encoders reach the ingest server at, as shown to admins:
     * "rtmp://stream.example.com:1935" and "srt://stream.example.com:8890".
     * Empty, the panel shows its own host name with the usual ports.
     */
    INGEST_PUBLIC_RTMP_URL: z
      .string()
      .default('')
      .transform((value) => value.trim().replace(/\/+$/, ''))
      .refine((value) => value === '' || /^rtmps?:\/\/[^/?]+$/.test(value), {
        message: 'INGEST_PUBLIC_RTMP_URL must look like rtmp://stream.example.com:1935',
      }),
    INGEST_PUBLIC_SRT_URL: z
      .string()
      .default('')
      .transform((value) => value.trim().replace(/\/+$/, ''))
      .refine((value) => value === '' || /^srt:\/\/[^/?]+$/.test(value), {
        message: 'INGEST_PUBLIC_SRT_URL must look like srt://stream.example.com:8890',
      }),
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
    if (env.STRIPE_SECRET_KEY !== '') {
      if (env.STRIPE_WEBHOOK_SECRET === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['STRIPE_WEBHOOK_SECRET'],
          message:
            'STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set, or renewals and cancellations would go unnoticed',
        });
      }
      if (env.SITE_URL === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['SITE_URL'],
          message:
            'SITE_URL is required when STRIPE_SECRET_KEY is set: viewers return there after paying',
        });
      }
    } else if (env.STRIPE_WEBHOOK_SECRET !== '') {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'STRIPE_SECRET_KEY is required when STRIPE_WEBHOOK_SECRET is set',
      });
    }
    if (env.P2P_TRACKER_URL !== '' && env.P2P_TRACKER_SECRET.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['P2P_TRACKER_SECRET'],
        message:
          'P2P_TRACKER_URL needs P2P_TRACKER_SECRET with at least 32 characters, the same value the tracker has',
      });
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
