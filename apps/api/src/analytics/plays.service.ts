// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@onyx/database';
import { AppConfig } from '../config/app-config.js';
import { applyBeat, type BeatInput, deviceOf, PLAY_OPEN_MS, visitorKeyOf } from './play-rules.js';

export interface PlayStart {
  kind: 'MAIN' | 'TRAILER' | 'EXTRA';
  titleId: string;
  episodeId?: string | null;
  assetId: string;
  /** Whether the title needs a subscription or a purchase. */
  paid: boolean;
  viewerId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Plays that were asked for and never began are deleted after this long. */
const KEEP_UNSTARTED_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Records what is watched: one row when the addresses for playing a video
 * are handed out, filled in by the reports of the player while it plays.
 *
 * Recording never stands in the way of watching: whatever goes wrong here is
 * logged and the video plays.
 */
@Injectable()
export class PlaysService {
  private readonly logger = new Logger(PlaysService.name);

  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /**
   * Notes that a video was asked for.
   *
   * @returns the id the player reports to, or null when nothing is recorded.
   */
  async start(input: PlayStart): Promise<string | null> {
    if (!this.config.viewingStatistics) {
      return null;
    }
    try {
      const now = new Date();
      const asset = await this.prisma.asset.findUnique({
        where: { id: input.assetId },
        select: { durationMs: true },
      });
      const play = await this.prisma.play.create({
        data: {
          kind: input.kind,
          titleId: input.titleId,
          episodeId: input.episodeId ?? null,
          viewerId: input.viewerId,
          // A signed-in viewer is counted by their account, so no mark is needed.
          visitorKey: input.viewerId
            ? null
            : visitorKeyOf(this.config.jwtSecret, now, input.ipAddress, input.userAgent),
          device: deviceOf(input.userAgent),
          paid: input.paid,
          durationSeconds: Math.round((asset?.durationMs ?? 0) / 1000),
          startedAt: now,
          lastBeatAt: now,
        },
        select: { id: true },
      });
      return play.id;
    } catch (error) {
      this.logger.warn(`A play could not be recorded: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Takes a report of the player. Reports for a play that does not exist, or
   * that is older than a day, are dropped without a word: the player has
   * nothing to do about it.
   */
  async beat(id: string, beat: BeatInput): Promise<void> {
    if (!this.config.viewingStatistics) {
      return;
    }
    const now = new Date();
    const play = await this.prisma.play.findUnique({ where: { id } });
    if (!play || now.getTime() - play.startedAt.getTime() > PLAY_OPEN_MS) {
      return;
    }
    await this.prisma.play.update({
      where: { id },
      data: { ...applyBeat(play, beat, now), lastBeatAt: now },
    });
  }

  /**
   * Deletes what is no longer needed: plays that never began, and plays
   * older than the installation keeps them.
   */
  async purge(now: Date = new Date()): Promise<number> {
    const unstarted = await this.prisma.play.deleteMany({
      where: { watchedSeconds: 0, startedAt: { lt: new Date(now.getTime() - KEEP_UNSTARTED_MS) } },
    });
    const days = this.config.viewingStatisticsDays;
    const old =
      days > 0
        ? await this.prisma.play.deleteMany({
            where: { startedAt: { lt: new Date(now.getTime() - days * 24 * 60 * 60 * 1000) } },
          })
        : { count: 0 };
    return unstarted.count + old.count;
  }
}
