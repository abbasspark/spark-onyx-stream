// SPDX-License-Identifier: AGPL-3.0-only
import path from 'node:path';
import type { AppRole } from '../roles/app-role.js';
import type { Env } from './env.schema.js';

/**
 * Typed, validated application configuration.
 * Inject this class instead of reading process.env.
 */
export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly roles: readonly AppRole[];
  readonly apiHost: string;
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwtSecret: string;
  readonly playbackSigningSecret: string;
  readonly masterKey: string;
  /** Absolute path of the default local storage pool. */
  readonly storageLocalPath: string;

  /** Absolute path of the directory where uploads are collected. */
  readonly uploadTempPath: string;
  readonly uploadMaxBytes: number;
  readonly corsOrigins: readonly string[];
  /** Reverse proxies in front of the API whose X-Forwarded-For entry is trusted. */
  readonly trustProxyHops: number;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  /** Absolute path of the directory for working files of processing jobs. */
  readonly processingTempPath: string;
  /** The ingest server, which receives streams pushed by encoders. */
  readonly ingest: {
    readonly apiUrl: string;
    readonly rtspUrl: string;
    readonly publicRtmpUrl: string | null;
    readonly publicSrtUrl: string | null;
  };
  /** Time after which a guide source is imported again, in milliseconds. */
  readonly guideRefreshMs: number;
  readonly workerConcurrency: number;
  /** Where live channels write their output, and how it is cut. */
  readonly live: {
    readonly path: string;
    readonly segmentSeconds: number;
    readonly playlistSegments: number;
    readonly transcodePreset: string;
  };
  readonly playbackUrlTtlSeconds: number;
  /** Who may play published titles through the public catalog. */
  readonly catalogPlayback: 'open' | 'viewers' | 'off';
  /** Whether people can create a viewer account themselves. */
  readonly viewerRegistrationOpen: boolean;
  /** Origin that serves media files. Empty when the API serves them itself. */
  readonly mediaBaseUrl: string;
  /** Currency of all prices, such as "EUR". */
  readonly billingCurrency: string;
  /** Where viewers ask for a subscription. Empty when not set. */
  readonly billingContactUrl: string;
  /** How long a rented title can be watched. */
  readonly rental: { readonly startDays: number; readonly watchHours: number };
  /** Access to Stripe for selling subscriptions online. Null when there is no online payment. */
  readonly stripe: {
    readonly secretKey: string;
    readonly webhookSecret: string;
    readonly apiUrl: string;
    /** False while the key is one for testing, where no money moves. */
    readonly livemode: boolean;
    readonly automaticTax: boolean;
  } | null;
  /** Access to TMDB for importing details of titles. Null when the import is off. */
  readonly tmdb: {
    readonly token: string;
    readonly apiUrl: string;
    readonly imageUrl: string;
  } | null;
  /** Language and country that imported details default to. */
  readonly metadataLanguage: string;
  readonly metadataRegion: string;
  /** The mail server and the sender. Null when email is off. */
  readonly mail: { readonly smtpUrl: string; readonly from: string } | null;
  /** Address of the viewer website, for links in emails. Empty when not set. */
  readonly siteUrl: string;
  readonly siteName: string;
  /** Whether a viewer must confirm their email address before they can watch. */
  readonly viewerVerificationRequired: boolean;

  /**
   * @param env Validated environment variables.
   * @param baseDirectory Directory that relative paths in the configuration are
   * resolved against: the folder of the loaded .env file, or the working directory.
   */
  constructor(env: Env, baseDirectory: string = process.cwd()) {
    this.nodeEnv = env.NODE_ENV;
    this.roles = env.APP_ROLE;
    this.apiHost = env.API_HOST;
    this.apiPort = env.API_PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.redisUrl = env.REDIS_URL;
    this.jwtSecret = env.JWT_SECRET;
    this.playbackSigningSecret = env.PLAYBACK_SIGNING_SECRET;
    this.masterKey = env.MASTER_KEY;
    this.storageLocalPath = path.resolve(baseDirectory, env.STORAGE_LOCAL_PATH);
    this.uploadTempPath = path.resolve(baseDirectory, env.UPLOAD_TEMP_PATH);
    this.uploadMaxBytes = env.UPLOAD_MAX_BYTES;
    this.corsOrigins = env.CORS_ORIGINS;
    this.trustProxyHops = env.TRUST_PROXY_HOPS;
    this.ffmpegPath = env.FFMPEG_PATH;
    this.ffprobePath = env.FFPROBE_PATH;
    this.processingTempPath = path.resolve(baseDirectory, env.PROCESSING_TEMP_PATH);
    this.ingest = {
      apiUrl: env.INGEST_API_URL.replace(/\/+$/, ''),
      rtspUrl: env.INGEST_RTSP_URL,
      publicRtmpUrl: env.INGEST_PUBLIC_RTMP_URL || null,
      publicSrtUrl: env.INGEST_PUBLIC_SRT_URL || null,
    };
    this.guideRefreshMs = env.GUIDE_REFRESH_HOURS * 60 * 60 * 1000;
    this.workerConcurrency = env.WORKER_CONCURRENCY;
    this.live = {
      path: path.resolve(baseDirectory, env.LIVE_PATH),
      segmentSeconds: env.LIVE_SEGMENT_SECONDS,
      playlistSegments: env.LIVE_PLAYLIST_SEGMENTS,
      transcodePreset: env.LIVE_TRANSCODE_PRESET,
    };
    this.playbackUrlTtlSeconds = env.PLAYBACK_URL_TTL_SECONDS;
    this.catalogPlayback = env.CATALOG_PLAYBACK;
    this.viewerRegistrationOpen = env.VIEWER_REGISTRATION === 'open';
    this.mediaBaseUrl = env.MEDIA_BASE_URL;
    this.billingCurrency = env.BILLING_CURRENCY;
    this.billingContactUrl = env.BILLING_CONTACT_URL;
    this.rental = { startDays: env.RENTAL_START_DAYS, watchHours: env.RENTAL_WATCH_HOURS };
    this.stripe = env.STRIPE_SECRET_KEY
      ? {
          secretKey: env.STRIPE_SECRET_KEY,
          webhookSecret: env.STRIPE_WEBHOOK_SECRET,
          apiUrl: env.STRIPE_API_URL,
          livemode: /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY),
          automaticTax: env.STRIPE_AUTOMATIC_TAX === 'true',
        }
      : null;
    this.tmdb = env.TMDB_API_TOKEN
      ? { token: env.TMDB_API_TOKEN, apiUrl: env.TMDB_API_URL, imageUrl: env.TMDB_IMAGE_URL }
      : null;
    this.metadataLanguage = env.METADATA_LANGUAGE;
    this.metadataRegion = env.METADATA_REGION;
    this.mail = env.SMTP_URL ? { smtpUrl: env.SMTP_URL, from: env.MAIL_FROM } : null;
    this.siteUrl = env.SITE_URL;
    this.siteName = env.SITE_NAME;
    this.viewerVerificationRequired = env.VIEWER_EMAIL_VERIFICATION === 'required';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  hasRole(role: AppRole): boolean {
    return this.roles.includes(role);
  }
}
