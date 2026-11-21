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
  readonly workerConcurrency: number;
  readonly playbackUrlTtlSeconds: number;
  /** Who may play published titles through the public catalog. */
  readonly catalogPlayback: 'open' | 'viewers' | 'off';
  /** Whether people can create a viewer account themselves. */
  readonly viewerRegistrationOpen: boolean;
  /** Origin that serves media files. Empty when the API serves them itself. */
  readonly mediaBaseUrl: string;
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
    this.workerConcurrency = env.WORKER_CONCURRENCY;
    this.playbackUrlTtlSeconds = env.PLAYBACK_URL_TTL_SECONDS;
    this.catalogPlayback = env.CATALOG_PLAYBACK;
    this.viewerRegistrationOpen = env.VIEWER_REGISTRATION === 'open';
    this.mediaBaseUrl = env.MEDIA_BASE_URL;
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
