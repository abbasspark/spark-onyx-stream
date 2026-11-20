// SPDX-License-Identifier: AGPL-3.0-only
import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type Job, type JobStatus, type JobType, Prisma, PrismaClient } from '@onyx/database';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { type Page, type PaginationInput, toPage, toSkipTake } from '../common/pagination.js';
import { PROCESSING_QUEUE } from '../queue/queue.constants.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

/** Redis channel on which the API tells workers to stop a running job. */
export const JOB_CANCEL_CHANNEL = 'onyx:jobs:cancel';

/** What travels through the queue. Everything else is read from the database by id. */
export interface QueuedJobData {
  jobId: string;
  assetId: string | null;
}

export interface EnqueueInput {
  type: JobType;
  assetId?: string;
  /** Extra settings for the job, stored on the job record. */
  input?: Record<string, unknown>;
  /** Higher numbers run first. */
  priority?: number;
}

export interface JobFilter {
  assetId?: string;
  status?: JobStatus;
  type?: JobType;
}

/** A job as returned by the API. */
export interface JobView {
  id: string;
  type: JobType;
  status: JobStatus;
  assetId: string | null;
  progress: number;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  output: Prisma.JsonValue | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export function toJobView(job: Job): JobView {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    assetId: job.assetId,
    progress: job.progress,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    error: job.error,
    output: job.output,
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

const MAX_ERROR_LENGTH = 2_000;

/**
 * Keeps the durable record of processing jobs and places them on the queue.
 *
 * BullMQ in Redis decides when and where a job runs. The jobs table records
 * what happened, so history survives a Redis restart and can be shown in the panel.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @InjectQueue(PROCESSING_QUEUE) private readonly queue: Queue<QueuedJobData>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async enqueue(input: EnqueueInput): Promise<Job> {
    const job = await this.prisma.job.create({
      data: {
        type: input.type,
        assetId: input.assetId ?? null,
        input: (input.input as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        priority: input.priority ?? 0,
      },
    });

    await this.queue.add(
      job.type,
      { jobId: job.id, assetId: job.assetId },
      {
        // The record id doubles as the queue id, so both sides name the same job.
        jobId: job.id,
        attempts: job.maxAttempts,
        // BullMQ runs lower numbers first, the record uses higher-first.
        priority: job.priority > 0 ? Math.max(1, 1_000 - job.priority) : undefined,
      },
    );

    return job;
  }

  async list(filter: JobFilter, pagination: PaginationInput): Promise<Page<JobView>> {
    const where: Prisma.JobWhereInput = {
      assetId: filter.assetId,
      status: filter.status,
      type: filter.type,
    };
    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({ where, orderBy: { queuedAt: 'desc' }, ...toSkipTake(pagination) }),
      this.prisma.job.count({ where }),
    ]);
    return toPage(jobs.map(toJobView), total, pagination);
  }

  async get(id: string): Promise<Job> {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  /**
   * Cancels a job. A waiting job is taken off the queue at once. A running job
   * is signalled to stop, and the worker records the cancellation when it has.
   */
  async cancel(id: string): Promise<Job> {
    const job = await this.get(id);

    if (job.status === 'RUNNING') {
      await this.redis.publish(JOB_CANCEL_CHANNEL, id);
      return job;
    }
    if (job.status !== 'QUEUED') {
      throw new ConflictException(`A job that is ${job.status.toLowerCase()} cannot be cancelled`);
    }

    try {
      const queued = await this.queue.getJob(id);
      await queued?.remove();
    } catch (error) {
      // A worker picked it up in this instant. Signal it instead.
      this.logger.warn(`Job ${id} could not be removed from the queue: ${String(error)}`);
      await this.redis.publish(JOB_CANCEL_CHANNEL, id);
      return job;
    }
    return this.markCancelled(id);
  }

  // --- State changes reported by the worker --------------------------------

  markRunning(id: string, workerId: string, attempt: number): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'RUNNING', workerId, attempts: attempt, startedAt: new Date(), error: null },
    });
  }

  async setProgress(id: string, progress: number): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id, status: 'RUNNING' },
      data: { progress: Math.max(0, Math.min(100, Math.round(progress))) },
    });
  }

  markCompleted(id: string, output?: Record<string, unknown>): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        progress: 100,
        output: (output as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull,
        finishedAt: new Date(),
      },
    });
  }

  /** The attempt failed and the queue will run the job again. */
  markRetrying(id: string, error: string): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'QUEUED', progress: 0, error: error.slice(0, MAX_ERROR_LENGTH) },
    });
  }

  markFailed(id: string, error: string): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'FAILED', error: error.slice(0, MAX_ERROR_LENGTH), finishedAt: new Date() },
    });
  }

  markCancelled(id: string): Promise<Job> {
    return this.prisma.job.update({
      where: { id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
  }
}
