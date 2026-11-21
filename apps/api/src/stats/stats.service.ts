// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import {
  type AssetStatus,
  type JobStatus,
  type JobType,
  PrismaClient,
  type PublishStatus,
} from '@onyx/database';

/** Days covered by the uploads chart, today included. */
const UPLOAD_HISTORY_DAYS = 14;
const RECENT_FAILURES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface OverviewStats {
  assets: {
    /** Assets that are not deleted. */
    total: number;
    byStatus: Partial<Record<AssetStatus, number>>;
    /** Playing time of all ready assets in milliseconds. */
    readyDurationMs: number;
  };
  catalog: {
    /** Movies and series, whatever their state. */
    titles: number;
    published: number;
    drafts: number;
  };
  viewers: {
    total: number;
    /** Accounts created in the last seven days. */
    newLast7Days: number;
    /** Viewers who signed in during the last thirty days. */
    activeLast30Days: number;
  };
  jobs: {
    queued: number;
    running: number;
    completedLast24h: number;
    failedLast24h: number;
  };
  storage: {
    pools: number;
    /** Bytes as text. */
    usedBytes: string;
    /** Sum of all limits as text. Null when any active pool has no limit. */
    quotaBytes: string | null;
  };
  /** Assets created per day, oldest first, in UTC. Days without uploads are included. */
  uploadsPerDay: { date: string; count: number }[];
  recentFailures: {
    jobId: string;
    type: JobType;
    assetId: string | null;
    assetTitle: string | null;
    error: string | null;
    finishedAt: Date | null;
  }[];
}

/** Figures for the dashboard of the admin panel. */
@Injectable()
export class StatsService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async overview(now: Date = new Date()): Promise<OverviewStats> {
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const historyStart = new Date(today - (UPLOAD_HISTORY_DAYS - 1) * DAY_MS);

    const [assetGroups, duration, jobGroups, pools, uploads, failures, titleGroups] =
      await Promise.all([
        this.prisma.asset.groupBy({
          by: ['status'],
          where: { status: { not: 'DELETED' } },
          _count: { _all: true },
        }),
        this.prisma.asset.aggregate({ where: { status: 'READY' }, _sum: { durationMs: true } }),
        this.prisma.job.groupBy({
          by: ['status'],
          where: {
            OR: [{ status: { in: ['QUEUED', 'RUNNING'] } }, { finishedAt: { gte: dayAgo } }],
          },
          _count: { _all: true },
        }),
        this.prisma.storagePool.findMany({
          where: { isActive: true },
          select: { usedBytes: true, quotaBytes: true },
        }),
        this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day, count(*) AS count
        FROM assets
        WHERE "createdAt" >= ${historyStart} AND status <> 'DELETED'
        GROUP BY 1`,
        this.prisma.job.findMany({
          where: { status: 'FAILED' },
          orderBy: { finishedAt: 'desc' },
          take: RECENT_FAILURES,
          include: { asset: { select: { title: true, status: true } } },
        }),
        this.prisma.title.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
    const [viewers, newViewers, activeViewers] = await Promise.all([
      this.prisma.viewer.count(),
      this.prisma.viewer.count({
        where: { createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
      }),
      this.prisma.viewer.count({
        where: { lastLoginAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      }),
    ]);
    const titleCount = (status: PublishStatus): number =>
      titleGroups.find((group) => group.status === status)?._count._all ?? 0;

    const byStatus = Object.fromEntries(
      assetGroups.map((group) => [group.status, group._count._all]),
    ) as Partial<Record<AssetStatus, number>>;
    const jobCount = (status: JobStatus): number =>
      jobGroups.find((group) => group.status === status)?._count._all ?? 0;

    const perDay = new Map(
      uploads.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]),
    );
    const uploadsPerDay = Array.from({ length: UPLOAD_HISTORY_DAYS }, (_, index) => {
      const date = new Date(historyStart.getTime() + index * DAY_MS).toISOString().slice(0, 10);
      return { date, count: perDay.get(date) ?? 0 };
    });

    const unlimited = pools.some((pool) => pool.quotaBytes === null);
    const sum = (values: (bigint | null)[]): bigint =>
      values.reduce<bigint>((total, value) => total + (value ?? 0n), 0n);

    return {
      assets: {
        total: assetGroups.reduce((total, group) => total + group._count._all, 0),
        byStatus,
        readyDurationMs: duration._sum.durationMs ?? 0,
      },
      catalog: {
        titles: titleGroups.reduce((total, group) => total + group._count._all, 0),
        published: titleCount('PUBLISHED'),
        drafts: titleCount('DRAFT'),
      },
      viewers: { total: viewers, newLast7Days: newViewers, activeLast30Days: activeViewers },
      jobs: {
        queued: jobCount('QUEUED'),
        running: jobCount('RUNNING'),
        completedLast24h: jobCount('COMPLETED'),
        failedLast24h: jobCount('FAILED'),
      },
      storage: {
        pools: pools.length,
        usedBytes: sum(pools.map((pool) => pool.usedBytes)).toString(),
        quotaBytes:
          unlimited || pools.length === 0
            ? null
            : sum(pools.map((pool) => pool.quotaBytes)).toString(),
      },
      uploadsPerDay,
      recentFailures: failures.map((job) => ({
        jobId: job.id,
        type: job.type,
        assetId: job.asset && job.asset.status !== 'DELETED' ? job.assetId : null,
        assetTitle: job.asset?.title ?? null,
        error: job.error,
        finishedAt: job.finishedAt,
      })),
    };
  }
}
