// SPDX-License-Identifier: AGPL-3.0-only
import { hostname } from 'node:os';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { JobType } from '@onyx/database';
import { type Job as QueueJob, UnrecoverableError } from 'bullmq';
import { AppConfig } from '../config/app-config.js';
import type { QueuedJobData } from '../jobs/jobs.service.js';
import { PROCESSING_QUEUE } from '../queue/queue.constants.js';
import { FfmpegRunner } from './ffmpeg/ffmpeg-runner.js';
import { JobEndedError, JobExecutor } from './job-executor.js';

/**
 * Connects the processing queue to JobExecutor. BullMQ decides when a job
 * runs and when a failed attempt is repeated. The executor does the rest.
 */
@Processor(PROCESSING_QUEUE)
export class ProcessingConsumer extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProcessingConsumer.name);
  private readonly workerId = `${hostname()}:${process.pid}`;

  constructor(
    @Inject(JobExecutor) private readonly executor: JobExecutor,
    @Inject(FfmpegRunner) private readonly ffmpeg: FfmpegRunner,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    this.worker.concurrency = this.config.workerConcurrency;

    try {
      this.logger.log(`Worker ${this.workerId} ready, using ${await this.ffmpeg.version()}`);
    } catch (error) {
      // Every job would fail with this same message. Say it once, clearly, at startup.
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  async process(queueJob: QueueJob<QueuedJobData>): Promise<Record<string, unknown>> {
    try {
      return await this.executor.execute({
        jobId: queueJob.data.jobId,
        assetId: queueJob.data.assetId,
        type: queueJob.name as JobType,
        attempt: queueJob.attemptsMade + 1,
        maxAttempts: queueJob.opts.attempts ?? 1,
        workerId: this.workerId,
      });
    } catch (error) {
      if (error instanceof JobEndedError) {
        // Tells BullMQ not to run the job again.
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
