// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { JobType } from '@onyx/database';
import { JobsService } from '../jobs/jobs.service.js';
import { PipelineService } from './pipeline.service.js';
import { NonRetryableProcessingError, ProcessingSteps } from './processing-steps.js';
import { RunningJobs } from './running-jobs.js';

/** Progress is written to the database at most this often per job. */
const PROGRESS_WRITE_INTERVAL_MS = 2_000;

export interface JobRun {
  jobId: string;
  assetId: string | null;
  type: JobType;
  /** Number of this attempt, starting at 1. */
  attempt: number;
  maxAttempts: number;
  /** Name of the worker process, stored on the job record. */
  workerId: string;
}

/** The job has ended without success and must not be tried again. */
export class JobEndedError extends Error {
  constructor(
    message: string,
    readonly reason: 'failed' | 'cancelled',
  ) {
    super(message);
    this.name = 'JobEndedError';
  }
}

/**
 * Runs one attempt of a job and keeps its record up to date: running,
 * progress, then completed, waiting for a retry, failed or cancelled.
 *
 * It is independent of the queue, so the same logic runs in the worker and in tests.
 */
@Injectable()
export class JobExecutor {
  private readonly logger = new Logger(JobExecutor.name);

  constructor(
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(ProcessingSteps) private readonly steps: ProcessingSteps,
    @Inject(PipelineService) private readonly pipeline: PipelineService,
    @Inject(RunningJobs) private readonly running: RunningJobs,
  ) {}

  /**
   * @returns The job's output when the attempt succeeded.
   * @throws JobEndedError when the job failed for good or was cancelled.
   * @throws The original error when the attempt failed and another attempt is allowed.
   */
  async execute(run: JobRun): Promise<Record<string, unknown>> {
    const { jobId, assetId, type } = run;
    const signal = this.running.register(jobId);

    let lastWrite = 0;
    let lastPercent = -1;
    const onProgress = (percent: number): void => {
      const now = Date.now();
      if (percent === lastPercent || now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) {
        return;
      }
      lastPercent = percent;
      lastWrite = now;
      void this.jobs.setProgress(jobId, percent).catch(() => undefined);
    };

    try {
      await this.jobs.markRunning(jobId, run.workerId, run.attempt);
      if (!assetId) {
        throw new NonRetryableProcessingError('The job names no asset');
      }

      const output = await this.steps.run(type, { jobId, assetId, signal, onProgress });
      await this.jobs.markCompleted(jobId, output);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (signal.aborted) {
        await this.jobs.markCancelled(jobId);
        await this.pipeline.afterJobStopped(type, assetId);
        this.logger.log(`Job ${jobId} (${type}) was cancelled`);
        throw new JobEndedError('Cancelled', 'cancelled');
      }

      if (error instanceof NonRetryableProcessingError || run.attempt >= run.maxAttempts) {
        await this.jobs.markFailed(jobId, message);
        await this.pipeline.afterJobStopped(type, assetId);
        this.logger.error(`Job ${jobId} (${type}) failed: ${message}`);
        throw new JobEndedError(message, 'failed');
      }

      await this.jobs.markRetrying(jobId, message);
      this.logger.warn(
        `Job ${jobId} (${type}) failed on attempt ${run.attempt} and will be retried: ${message}`,
      );
      throw error;
    } finally {
      this.running.release(jobId);
    }
  }
}
