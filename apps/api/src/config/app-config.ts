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
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  /** Absolute path of the directory for working files of processing jobs. */
  readonly processingTempPath: string;
  readonly workerConcurrency: number;

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
    this.ffmpegPath = env.FFMPEG_PATH;
    this.ffprobePath = env.FFPROBE_PATH;
    this.processingTempPath = path.resolve(baseDirectory, env.PROCESSING_TEMP_PATH);
    this.workerConcurrency = env.WORKER_CONCURRENCY;
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  hasRole(role: AppRole): boolean {
    return this.roles.includes(role);
  }
}
