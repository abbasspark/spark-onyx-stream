// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { LIVE_EVENTS_CHANNEL, type LiveEvent } from './live-events.js';

/**
 * Sends live events to every API process, which pass them on to open admin
 * panels. Any process can publish: the API and the workers.
 */
@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Publishes an event. Never throws and is not awaited by callers: a lost
   * event only delays what the panel shows, and must not fail the work itself.
   */
  publish(event: LiveEvent): void {
    this.redis.publish(LIVE_EVENTS_CHANNEL, JSON.stringify(event)).catch((error: unknown) => {
      this.logger.debug(
        `Event not published: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }
}
