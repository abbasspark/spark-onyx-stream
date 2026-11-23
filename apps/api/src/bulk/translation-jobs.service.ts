// SPDX-License-Identifier: AGPL-3.0-only
import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type Prisma, PrismaClient, type TranslationJob } from '@onyx/database';
import type { Redis } from 'ioredis';
import { TranslationsService } from '../catalog/translations.service.js';
import { TitleHistoryService } from '../history/title-history.service.js';
import { AppConfig } from '../config/app-config.js';
import { EventPublisher } from '../events/event-publisher.js';
import { MetadataService } from '../metadata/metadata.service.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { mergeTranslation } from './merge-translation.js';

/** How often the runner looks for a job. A new job starts within this time. */
const LOOK_EVERY_MS = 4_000;
export const TRANSLATION_LOCK = 'onyx:translation-jobs:run';
const LOCK_MS = 120_000;
/** Titles gone through per look, so that the lock is held for a short time and a stop is noticed soon. */
const TITLES_PER_LOOK = 15;
/** How many failures a job keeps with their reasons. The rest is only counted. */
const FAILURES_KEPT = 50;
const REASON_KEPT = 300;
/** After this many looks in a row at which the source did not answer, the job gives up. */
const SOURCE_TRIES = 5;

type Outcome = 'translated' | 'unchanged' | 'skipped' | 'failed';

/** True for an error of the source as a whole, not of one title. */
function isSourceDown(error: unknown): boolean {
  return error instanceof BadGatewayException || error instanceof ServiceUnavailableException;
}

export interface JobFailure {
  titleId: string;
  name: string;
  reason: string;
}

export interface TranslationJobView {
  id: string;
  language: string;
  overwrite: boolean;
  status: TranslationJob['status'];
  total: number;
  done: number;
  translated: number;
  /** Titles the source had nothing new for. */
  unchanged: number;
  /** Titles that were not imported, so the source has nothing for them. */
  skipped: number;
  failed: number;
  failures: JobFailure[];
  note: string | null;
  createdBy: { id: string; displayName: string } | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

const INCLUDE = {
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.TranslationJobInclude;
type JobRecord = Prisma.TranslationJobGetPayload<{ include: typeof INCLUDE }>;

function toView(job: JobRecord): TranslationJobView {
  return {
    id: job.id,
    language: job.language,
    overwrite: job.overwrite,
    status: job.status,
    total: job.titleIds.length,
    done: job.done,
    translated: job.translated,
    unchanged: job.unchanged,
    skipped: job.skipped,
    failed: job.failed,
    failures: Array.isArray(job.failures) ? (job.failures as unknown as JobFailure[]) : [],
    note: job.note,
    createdBy: job.createdBy,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, REASON_KEPT);
}

/**
 * Translates many titles into a language, one after the other, from the
 * source their details came from.
 *
 * A job is a list of titles and a place in it. Each title is one step that
 * saves its own result, so a job can stop anywhere, by an admin or by a
 * restart, and go on from where it was. Runs with the API, one process at a
 * time, because it needs the catalog and the import of details.
 */
@Injectable()
export class TranslationJobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TranslationJobsService.name);
  private timer: NodeJS.Timeout | undefined;
  private busy = false;
  /** Looks in a row at which the source did not answer, by job. */
  private readonly sourceDown = new Map<string, number>();

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(EventPublisher) private readonly events: EventPublisher,
    @Inject(MetadataService) private readonly metadata: MetadataService,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
    @Inject(TitleHistoryService) private readonly history: TitleHistoryService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests call look() themselves.
    if (this.config.nodeEnv === 'test') {
      return;
    }
    this.timer = setInterval(() => void this.look(), LOOK_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  // --- For admins -----------------------------------------------------------------

  /**
   * Queues a job. The titles are fixed now: what is added to the catalog while
   * it runs is not part of it.
   *
   * @throws ServiceUnavailableException when the import of details is not set up.
   */
  async create(
    titleIds: readonly string[],
    language: string,
    overwrite: boolean,
    adminId: string | null,
  ): Promise<TranslationJobView> {
    if (!this.metadata.status().enabled) {
      throw new ServiceUnavailableException(
        'Translations are read from TMDB, and the import from TMDB is not set up (TMDB_API_TOKEN)',
      );
    }
    const job = await this.prisma.translationJob.create({
      data: { language, overwrite, titleIds: [...titleIds], createdById: adminId },
      include: INCLUDE,
    });
    this.events.publish({ type: 'translation-job', jobId: job.id });
    return toView(job);
  }

  /** The newest jobs first. With `active`, only those waiting or running. */
  async list(active = false): Promise<TranslationJobView[]> {
    const jobs = await this.prisma.translationJob.findMany({
      where: active ? { status: { in: ['QUEUED', 'RUNNING'] } } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      include: INCLUDE,
    });
    return jobs.map(toView);
  }

  /** Stops a job. What it translated until now stays. */
  async cancel(id: string): Promise<TranslationJobView> {
    const stopped = await this.prisma.translationJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    const job = await this.prisma.translationJob.findUnique({ where: { id }, include: INCLUDE });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (stopped.count === 0) {
      throw new ConflictException('The job has ended already');
    }
    this.events.publish({ type: 'translation-job', jobId: id });
    return toView(job);
  }

  // --- The work -------------------------------------------------------------------

  /** Goes on with the oldest unfinished job for a number of titles. */
  async look(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const acquired = await this.redis.set(
        TRANSLATION_LOCK,
        String(process.pid),
        'PX',
        LOCK_MS,
        'NX',
      );
      if (acquired !== 'OK') {
        return;
      }
      try {
        const job = await this.prisma.translationJob.findFirst({
          where: { status: { in: ['QUEUED', 'RUNNING'] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (job) {
          await this.advance(job);
        }
      } finally {
        await this.redis.del(TRANSLATION_LOCK).catch(() => undefined);
      }
    } catch (error) {
      this.logger.error(`Translating titles failed: ${reasonOf(error)}`);
    } finally {
      this.busy = false;
    }
  }

  private async advance(job: TranslationJob): Promise<void> {
    if (job.status === 'QUEUED') {
      await this.prisma.translationJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
    }
    const end = Math.min(job.titleIds.length, job.done + TITLES_PER_LOOK);
    for (let index = job.done; index < end; index += 1) {
      const titleId = job.titleIds[index] as string;
      let outcome: Outcome;
      let failure: JobFailure | null = null;
      try {
        outcome = await this.translate(titleId, job.language, job.overwrite);
        await this.history.capture(titleId, job.createdById, 'translation');
        this.sourceDown.delete(job.id);
      } catch (error) {
        if (isSourceDown(error)) {
          // Not a matter of this title. It is tried again at the next look, and
          // after some looks without an answer the job stops, with what it has.
          const tries = (this.sourceDown.get(job.id) ?? 0) + 1;
          this.sourceDown.set(job.id, tries);
          if (tries >= SOURCE_TRIES) {
            this.sourceDown.delete(job.id);
            await this.end(job.id, 'FAILED', reasonOf(error));
          }
          return;
        }
        outcome = 'failed';
        const title = await this.prisma.title.findUnique({
          where: { id: titleId },
          select: { name: true },
        });
        failure = { titleId, name: title?.name ?? 'A deleted title', reason: reasonOf(error) };
      }
      // Counted only while the job still runs: a job that was stopped stays as it was stopped.
      const current = await this.prisma.translationJob.findUnique({ where: { id: job.id } });
      if (!current || current.status !== 'RUNNING') {
        return;
      }
      const failures = Array.isArray(current.failures)
        ? (current.failures as unknown as JobFailure[])
        : [];
      await this.prisma.translationJob.update({
        where: { id: job.id },
        data: {
          done: index + 1,
          [outcome]: { increment: 1 },
          ...(failure && failures.length < FAILURES_KEPT
            ? { failures: [...failures, failure] as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });
      this.events.publish({ type: 'translation-job', jobId: job.id });
    }
    if (end >= job.titleIds.length) {
      await this.end(job.id, 'COMPLETED', null);
    }
  }

  private async end(id: string, status: 'COMPLETED' | 'FAILED', note: string | null) {
    await this.prisma.translationJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status, note, finishedAt: new Date() },
    });
    this.events.publish({ type: 'translation-job', jobId: id });
  }

  /** Translates one title. A title deleted since the job was made is passed over. */
  private async translate(
    titleId: string,
    language: string,
    overwrite: boolean,
  ): Promise<Exclude<Outcome, 'failed'>> {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
      select: { metadataId: true },
    });
    if (!title?.metadataId) {
      return 'skipped';
    }
    const source = await this.metadata.sourceTranslation(titleId, language);
    const existing = (await this.translations.list(titleId)).find(
      (translation) => translation.language === language,
    );
    const { input, added } = mergeTranslation(existing, source, overwrite);
    if (added === 0) {
      return 'unchanged';
    }
    await this.translations.put(titleId, language, input);
    return 'translated';
  }
}
