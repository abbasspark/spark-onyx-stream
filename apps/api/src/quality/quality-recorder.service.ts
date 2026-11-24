// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { deviceOf } from '../analytics/play-rules.js';
import { AppConfig } from '../config/app-config.js';
import { applyReport, type ReportInput, serverOf, SESSION_OPEN_MS } from './report-rules.js';

export interface SessionStart {
  kind: 'VIDEO' | 'LIVE';
  titleId?: string | null;
  episodeId?: string | null;
  channelId?: string | null;
  userAgent: string | null;
  /** The address the player was given, to know which server it was sent to. */
  playbackUrl: string;
}

/** A playback that never reported is deleted after this long. */
const KEEP_SILENT_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Keeps how playbacks went: one row when addresses for playing are handed
 * out, filled in by what the player reports.
 *
 * Nothing here stands in the way of watching: whatever goes wrong is logged
 * and the video plays. A row says what was played and on what kind of device,
 * never who watched.
 */
@Injectable()
export class QualityRecorder {
  private readonly logger = new Logger(QualityRecorder.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /**
   * Notes that addresses for playing were handed out.
   *
   * @returns the id the player reports to, or null when nothing is recorded.
   */
  async start(input: SessionStart): Promise<string | null> {
    if (!this.config.playbackReports) {
      return null;
    }
    try {
      const session = await this.prisma.playbackSession.create({
        data: {
          kind: input.kind,
          titleId: input.titleId ?? null,
          episodeId: input.episodeId ?? null,
          channelId: input.channelId ?? null,
          device: deviceOf(input.userAgent),
          server: serverOf(input.playbackUrl, this.config.mediaBaseUrl),
        },
        select: { id: true },
      });
      return session.id;
    } catch (error) {
      this.logger.warn(`A playback could not be noted: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Takes a report of a player. A report for a playback that does not
   * exist, or that is older than a day, is dropped without a word: the
   * player has nothing to do about it.
   */
  async report(id: string, report: ReportInput): Promise<void> {
    if (!this.config.playbackReports) {
      return;
    }
    const now = new Date();
    const session = await this.prisma.playbackSession.findUnique({ where: { id } });
    if (!session || now.getTime() - session.startedAt.getTime() > SESSION_OPEN_MS) {
      return;
    }
    await this.prisma.playbackSession.update({
      where: { id },
      data: { ...applyReport(session, report, now), reportedAt: now },
    });
  }

  /**
   * Deletes what is no longer needed: playbacks no player reported on, and
   * reports older than the installation keeps them.
   */
  async purge(now: Date = new Date()): Promise<number> {
    const silent = await this.prisma.playbackSession.deleteMany({
      where: { reportedAt: null, startedAt: { lt: new Date(now.getTime() - KEEP_SILENT_MS) } },
    });
    const days = this.config.playbackReportsDays;
    const old =
      days > 0
        ? await this.prisma.playbackSession.deleteMany({
            where: { startedAt: { lt: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) } },
          })
        : { count: 0 };
    return silent.count + old.count;
  }
}
