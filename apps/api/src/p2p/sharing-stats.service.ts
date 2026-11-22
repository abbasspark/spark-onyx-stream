// SPDX-License-Identifier: AGPL-3.0-only
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { z } from 'zod';
import { hourOf } from '../delivery/edge-state.js';
import { TRAFFIC_RANGES, type TrafficRange } from '../delivery/edges.schemas.js';

/** How often what players reported is written to the database. */
const FLUSH_EVERY_MS = 30_000;
/** How long the hours are kept. */
const KEPT_DAYS = 90;
/**
 * The most one report may claim, per figure. A player reports about twice a
 * minute, and no connection moves this much in that time.
 */
const MAX_BYTES_PER_REPORT = 4 * 1024 ** 3;

const bytes = z.number().int().min(0).max(MAX_BYTES_PER_REPORT);

/** What a player says it took and gave since its last report. */
export const sharingReportSchema = z.object({
  /** The token the player got for the tracker, which shows it was let watch. */
  token: z.string().min(1).max(200),
  kind: z.enum(['video', 'live']),
  fromServers: bytes,
  fromViewers: bytes,
  toViewers: bytes,
});
export type SharingReport = z.infer<typeof sharingReportSchema>;

interface Amounts {
  fromServers: number;
  fromViewers: number;
  toViewers: number;
  reports: number;
}

/** One hour of one kind: [start in seconds, from servers, from viewers, to viewers, reports]. */
export type SharingPoint = [number, number, number, number, number];

export interface SharingTraffic {
  range: TrafficRange;
  from: Date;
  hours: number;
  video: SharingPoint[];
  live: SharingPoint[];
}

/**
 * Adds up what the players of viewers report: how much of what they played
 * came from servers and how much from other viewers.
 *
 * Reports come often and from everyone who watches, so they are added up in
 * memory and written to the database every half minute. What a process had
 * not yet written when it was killed is lost, which statistics can bear.
 */
@Injectable()
export class SharingStatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SharingStatsService.name);
  private pending = new Map<string, Amounts & { hour: Date; kind: string }>();
  private timer: NodeJS.Timeout | undefined;
  private prunedAt = 0;

  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_EVERY_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  /** Takes one report of a player. */
  add(report: Omit<SharingReport, 'token'>, now: number = Date.now()): void {
    if (report.fromServers + report.fromViewers + report.toViewers === 0) {
      return;
    }
    const hour = hourOf(now);
    const key = `${hour.getTime()}:${report.kind}`;
    const entry = this.pending.get(key) ?? {
      hour,
      kind: report.kind,
      fromServers: 0,
      fromViewers: 0,
      toViewers: 0,
      reports: 0,
    };
    entry.fromServers += report.fromServers;
    entry.fromViewers += report.fromViewers;
    entry.toViewers += report.toViewers;
    entry.reports += 1;
    this.pending.set(key, entry);
  }

  /** Writes what is waiting to the database. */
  async flush(): Promise<void> {
    if (this.pending.size === 0) {
      return;
    }
    const waiting = [...this.pending.values()];
    this.pending = new Map();
    try {
      for (const entry of waiting) {
        const amounts = {
          fromServers: BigInt(entry.fromServers),
          fromViewers: BigInt(entry.fromViewers),
          toViewers: BigInt(entry.toViewers),
        };
        await this.prisma.sharingHour.upsert({
          where: { hour_kind: { hour: entry.hour, kind: entry.kind } },
          create: { hour: entry.hour, kind: entry.kind, ...amounts, reports: entry.reports },
          update: {
            fromServers: { increment: amounts.fromServers },
            fromViewers: { increment: amounts.fromViewers },
            toViewers: { increment: amounts.toViewers },
            reports: { increment: entry.reports },
          },
        });
      }
      await this.prune();
    } catch (error) {
      // Statistics must never take the API down. What could not be written is dropped.
      this.logger.warn(`Could not store what players reported: ${String(error)}`);
    }
  }

  private async prune(): Promise<void> {
    const now = Date.now();
    if (now - this.prunedAt < 3_600_000) {
      return;
    }
    this.prunedAt = now;
    await this.prisma.sharingHour.deleteMany({
      where: { hour: { lt: new Date(now - KEPT_DAYS * 86_400_000) } },
    });
  }

  /** What players reported, hour by hour, for the last day, week or month. */
  async traffic(range: TrafficRange): Promise<SharingTraffic> {
    // What this process still holds belongs to the picture.
    await this.flush();
    const hours = TRAFFIC_RANGES[range];
    const from = new Date(hourOf(Date.now()).getTime() - (hours - 1) * 3_600_000);
    const rows = await this.prisma.sharingHour.findMany({
      where: { hour: { gte: from } },
      orderBy: { hour: 'asc' },
    });
    const of = (kind: string): SharingPoint[] =>
      rows
        .filter((row) => row.kind === kind)
        .map((row) => [
          Math.round(row.hour.getTime() / 1000),
          Number(row.fromServers),
          Number(row.fromViewers),
          Number(row.toViewers),
          row.reports,
        ]);
    return { range, from, hours, video: of('video'), live: of('live') };
  }
}
