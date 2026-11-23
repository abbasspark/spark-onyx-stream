// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { VISIBLE_EPISODE, visibleTitle } from '../catalog/playable.js';
import { toPublicImage } from '../catalog/public-catalog.views.js';
import { AppConfig } from '../config/app-config.js';
import { clampWatchedAt, judgePosition } from './watch-rules.js';
import type { WatchPositionInput } from './watching.schemas.js';
import type { TitleWatchState, ViewerWatchingAdminView, WatchingItem } from './watching.views.js';

/** Length of the "Continue watching" row. */
export const WATCHING_LIMIT = 30;
/** How many of a viewer's videos the admin panel shows. */
export const ADMIN_WATCHING_LIMIT = 25;

/** Rows a viewer can go on with: begun, and still there to be watched. */
const resumable = () =>
  ({
    positionSeconds: { gt: 0 },
    title: visibleTitle(),
    OR: [{ episodeId: null }, { episode: VISIBLE_EPISODE }],
  }) satisfies Prisma.WatchProgressWhereInput;

/** Whose history: a profile, and the account it belongs to. */
export interface WatchScope {
  viewerId: string;
  profileId: string;
}

interface Target {
  titleId: string;
  episodeId: string | null;
  itemId: string;
}

/**
 * Where each profile of each viewer is in each video. Positions come from the player; the
 * rules for "begun" and "finished" are applied here, so every device agrees.
 */
@Injectable()
export class WatchingService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  /** What the profile began and did not finish, the latest first. */
  async list({ profileId }: WatchScope): Promise<WatchingItem[]> {
    const rows = await this.prisma.watchProgress.findMany({
      where: { profileId, ...resumable() },
      orderBy: [{ watchedAt: 'desc' }, { id: 'desc' }],
      take: WATCHING_LIMIT,
      include: {
        title: { include: { backdrop: true, poster: true } },
        episode: { include: { still: true, season: { select: { number: true } } } },
      },
    });
    const base = this.config.mediaBaseUrl;
    return rows.map((row) => ({
      id: row.itemId,
      title: { slug: row.title.slug, name: row.title.name, type: row.title.type },
      episode: row.episode
        ? {
            id: row.episode.id,
            seasonNumber: row.episode.season.number,
            number: row.episode.number,
            name: row.episode.name,
          }
        : null,
      image: toPublicImage(row.episode?.still ?? row.title.backdrop ?? row.title.poster, base),
      position: row.positionSeconds,
      duration: row.durationSeconds,
      watchedAt: row.watchedAt,
    }));
  }

  /**
   * How far the viewer is in the videos of one title, finished ones included.
   *
   * @throws NotFoundException when viewers cannot see the title.
   */
  async forTitle({ profileId }: WatchScope, slug: string): Promise<TitleWatchState[]> {
    const title = await this.prisma.title.findFirst({
      where: { slug, ...visibleTitle() },
      select: { id: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const rows = await this.prisma.watchProgress.findMany({
      where: { profileId, titleId: title.id },
      orderBy: [{ watchedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.itemId,
      position: row.positionSeconds,
      duration: row.durationSeconds,
      completed: row.completedAt !== null,
      watchedAt: row.watchedAt,
    }));
  }

  /**
   * Takes over positions from a player. A position for something viewers
   * cannot watch is left out without an error: a device may still hold one for
   * a title that was unpublished since. Of two reports for one video the later
   * one counts, whichever arrives first.
   *
   * @returns how many positions were taken over.
   */
  async save(scope: WatchScope, items: readonly WatchPositionInput[]): Promise<number> {
    const { viewerId, profileId } = scope;
    const targets = await this.resolve(items);
    const now = new Date();

    const reports = new Map<string, { target: Target; item: WatchPositionInput; at: Date }>();
    items.forEach((item, index) => {
      const target = targets[index];
      if (!target) {
        return;
      }
      const at = clampWatchedAt(item.watchedAt, now);
      const earlier = reports.get(target.itemId);
      if (!earlier || earlier.at.getTime() <= at.getTime()) {
        reports.set(target.itemId, { target, item, at });
      }
    });
    if (reports.size === 0) {
      return 0;
    }

    const existing = new Map(
      (
        await this.prisma.watchProgress.findMany({
          where: { profileId, itemId: { in: [...reports.keys()] } },
          select: { itemId: true, watchedAt: true, completedAt: true },
        })
      ).map((row) => [row.itemId, row]),
    );

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const { target, item, at } of reports.values()) {
      const stored = existing.get(target.itemId);
      if (stored && stored.watchedAt.getTime() > at.getTime()) {
        continue;
      }
      const outcome = judgePosition(item.position, item.duration);
      const where = { profileId_itemId: { profileId, itemId: target.itemId } };

      if (outcome.kind === 'not-started') {
        // Back at the beginning. That the video was once finished stays known.
        if (stored?.completedAt) {
          writes.push(
            this.prisma.watchProgress.update({
              where,
              data: { positionSeconds: 0, watchedAt: at },
            }),
          );
        } else if (stored) {
          writes.push(this.prisma.watchProgress.deleteMany({ where: { profileId, ...target } }));
        }
        continue;
      }

      const data =
        outcome.kind === 'finished'
          ? { positionSeconds: 0, durationSeconds: outcome.durationSeconds, completedAt: at }
          : {
              positionSeconds: outcome.positionSeconds,
              durationSeconds: outcome.durationSeconds,
            };
      writes.push(
        this.prisma.watchProgress.upsert({
          where,
          create: { viewerId, profileId, ...target, ...data, watchedAt: at },
          update: { ...data, watchedAt: at },
        }),
      );
    }
    if (writes.length > 0) {
      await this.prisma.$transaction(writes);
    }
    return reports.size;
  }

  /** Forgets one video. @returns false when there was nothing to forget. */
  async remove({ profileId }: WatchScope, itemId: string): Promise<boolean> {
    const { count } = await this.prisma.watchProgress.deleteMany({ where: { profileId, itemId } });
    return count > 0;
  }

  /** Forgets everything the profile watched. @returns the number of videos. */
  async clear({ profileId }: WatchScope): Promise<number> {
    const { count } = await this.prisma.watchProgress.deleteMany({ where: { profileId } });
    return count;
  }

  /**
   * What a viewer watched, for an admin.
   *
   * @throws NotFoundException when there is no such viewer.
   */
  async forAdmin(viewerId: string): Promise<ViewerWatchingAdminView> {
    const viewer = await this.prisma.viewer.findUnique({
      where: { id: viewerId },
      select: { id: true },
    });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
    const [total, completed, rows] = await Promise.all([
      this.prisma.watchProgress.count({ where: { viewerId } }),
      this.prisma.watchProgress.count({ where: { viewerId, completedAt: { not: null } } }),
      this.prisma.watchProgress.findMany({
        where: { viewerId },
        orderBy: [{ watchedAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_WATCHING_LIMIT,
        include: {
          title: { select: { id: true, name: true, type: true } },
          profile: { select: { id: true, name: true } },
          episode: {
            select: { id: true, number: true, name: true, season: { select: { number: true } } },
          },
        },
      }),
    ]);
    return {
      total,
      completed,
      items: rows.map((row) => ({
        id: row.itemId,
        profile: row.profile,
        title: row.title,
        episode: row.episode
          ? {
              id: row.episode.id,
              seasonNumber: row.episode.season.number,
              number: row.episode.number,
              name: row.episode.name,
            }
          : null,
        position: row.positionSeconds,
        duration: row.durationSeconds,
        completedAt: row.completedAt,
        watchedAt: row.watchedAt,
      })),
    };
  }

  /** Finds the video each position is about. Undefined for what viewers cannot watch. */
  private async resolve(items: readonly WatchPositionInput[]): Promise<(Target | undefined)[]> {
    const slugs = [...new Set(items.map((item) => item.title))];
    const episodeIds = [...new Set(items.flatMap((item) => item.episodeId ?? []))];

    const [titles, episodes] = await Promise.all([
      this.prisma.title.findMany({
        where: { slug: { in: slugs }, ...visibleTitle() },
        select: { id: true, slug: true, type: true },
      }),
      episodeIds.length > 0
        ? this.prisma.episode.findMany({
            where: { id: { in: episodeIds }, ...VISIBLE_EPISODE },
            select: { id: true, season: { select: { titleId: true } } },
          })
        : [],
    ]);
    const titleBySlug = new Map(titles.map((title) => [title.slug, title]));
    const titleOfEpisode = new Map(episodes.map((episode) => [episode.id, episode.season.titleId]));

    return items.map((item) => {
      const title = titleBySlug.get(item.title);
      if (!title) {
        return undefined;
      }
      if (title.type === 'MOVIE') {
        return item.episodeId
          ? undefined
          : { titleId: title.id, episodeId: null, itemId: title.id };
      }
      if (!item.episodeId || titleOfEpisode.get(item.episodeId) !== title.id) {
        return undefined;
      }
      return { titleId: title.id, episodeId: item.episodeId, itemId: item.episodeId };
    });
  }
}
