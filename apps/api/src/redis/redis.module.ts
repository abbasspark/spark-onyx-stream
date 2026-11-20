// SPDX-License-Identifier: AGPL-3.0-only
import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { redisOptionsFromUrl } from './redis-options.js';

/** Injection token of the application's shared Redis client. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Provides one shared Redis client for cache, pub/sub publishing and health checks.
 * BullMQ manages its own connections (see QueueModule).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Redis => {
        const logger = new Logger('Redis');
        const client = new Redis({
          ...redisOptionsFromUrl(config.redisUrl),
          // Fail commands quickly while disconnected instead of queueing them without limit.
          maxRetriesPerRequest: 2,
        });

        // Without a listener, ioredis prints every connection error itself.
        client.on('error', (error: Error) => logger.warn(`Connection error: ${error.message}`));
        client.on('ready', () => logger.log('Connected'));

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  onApplicationShutdown(): void {
    this.client.disconnect();
  }
}
