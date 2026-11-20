// SPDX-License-Identifier: AGPL-3.0-only
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { JOB_CANCEL_CHANNEL } from '../jobs/jobs.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { RunningJobs } from './running-jobs.js';

/**
 * Lets the API stop a job that is running in any worker process.
 *
 * Every worker listens on a Redis channel. When a job id arrives and that job
 * runs here, its abort signal fires, which ends the FFmpeg process.
 */
@Injectable()
export class CancellationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CancellationService.name);
  private subscriber: Redis | null = null;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(RunningJobs) private readonly running: RunningJobs,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // A connection in subscriber mode cannot run other commands, so it needs its own.
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('error', (error: Error) =>
      this.logger.warn(`Cancellation channel error: ${error.message}`),
    );
    this.subscriber.on('message', (_channel: string, jobId: string) => {
      this.running.abort(jobId);
    });
    await this.subscriber.subscribe(JOB_CANCEL_CHANNEL);
  }

  onApplicationShutdown(): void {
    this.subscriber?.disconnect();
    this.running.abortAll();
  }
}
