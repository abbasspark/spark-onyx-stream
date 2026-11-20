// SPDX-License-Identifier: AGPL-3.0-only
import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import type { QueueOptions } from 'bullmq';
import { AppConfig } from '../config/app-config.js';
import { PROCESSING_QUEUE, QUEUE_PREFIX } from './queue.constants.js';

/**
 * Configures BullMQ and registers the queues.
 *
 * Producers inject a queue with `@InjectQueue(PROCESSING_QUEUE)`.
 * Consumers are added in the worker role.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig): QueueOptions => ({
        prefix: QUEUE_PREFIX,
        connection: {
          url: config.redisUrl,
          // Required by BullMQ for the blocking connections used by workers.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
          removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
      }),
    }),
    BullModule.registerQueue({ name: PROCESSING_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
