// SPDX-License-Identifier: AGPL-3.0-only
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
  readonly storageLocalPath: string;

  constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.roles = env.APP_ROLE;
    this.apiHost = env.API_HOST;
    this.apiPort = env.API_PORT;
    this.databaseUrl = env.DATABASE_URL;
    this.redisUrl = env.REDIS_URL;
    this.jwtSecret = env.JWT_SECRET;
    this.playbackSigningSecret = env.PLAYBACK_SIGNING_SECRET;
    this.masterKey = env.MASTER_KEY;
    this.storageLocalPath = env.STORAGE_LOCAL_PATH;
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  hasRole(role: AppRole): boolean {
    return this.roles.includes(role);
  }
}
