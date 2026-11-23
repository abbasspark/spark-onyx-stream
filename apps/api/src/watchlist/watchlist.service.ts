// SPDX-License-Identifier: AGPL-3.0-only
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import { CARD_INCLUDE } from '../catalog/card-include.js';
import { visibleTitle } from '../catalog/playable.js';
import { toPublicCard, toPublicImage } from '../catalog/public-catalog.views.js';
import { TranslationsService } from '../catalog/translations.service.js';
import { AppConfig } from '../config/app-config.js';
import type { SavedTitles, ViewerList, ViewerListAdminView } from './watchlist.views.js';

/** The most titles one profile keeps. Enough for any person, and an end for a script. */
export const LIST_LIMIT = 500;
/** How many of a viewer's saved titles the admin panel shows. */
export const ADMIN_LIST_LIMIT = 25;
/** How many titles the figures name. */
export const TOP_SAVED = 10;

/** Whose list: a profile, and the account it belongs to. */
export interface ListScope {
  viewerId: string;
  profileId: string;
}

interface TopRow {
  titleId: string;
  saves: number;
  recent: number;
  started: number;
}

/**
 * The titles each profile saved to watch later. A list holds titles, not
 * episodes: a series is saved as a whole.
 */
@Injectable()
export class WatchlistService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(TranslationsService) private readonly translations: TranslationsService,
  ) {}

  /**
   * The list of a profile. A title that was unpublished since stays on the
   * list and is left out here: it returns by itself when it is published again.
   */
  async list({ profileId }: ListScope, language?: string): Promise<ViewerList> {
    const [rows, total] = await Promise.all([
      this.prisma.watchlistItem.findMany({
        where: { profileId, title: visibleTitle() },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: { title: { include: CARD_INCLUDE } },
      }),
      this.prisma.watchlistItem.count({ where: { profileId } }),
    ]);
    const cards = await this.translations.localizeCards(
      rows.map((row) => toPublicCard(row.title, this.config.mediaBaseUrl)),
      language,
    );
    return {
      items: rows.flatMap((row, index) => {
        const title = cards[index];
        return title ? [{ title, addedAt: row.createdAt }] : [];
      }),
      room: Math.max(0, LIST_LIMIT - total),
    };
  }

  /** The ids of the titles on the list, for marking them wherever they are shown. */
  async ids({ profileId }: ListScope): Promise<string[]> {
    const rows = await this.prisma.watchlistItem.findMany({
      where: { profileId, title: visibleTitle() },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { titleId: true },
    });
    return rows.map((row) => row.titleId);
  }

  /**
   * Puts a title on the list. Doing it twice changes nothing.
   *
   * @throws NotFoundException when viewers cannot see the title.
   * @throws ConflictException when the list is full.
   */
  async add(scope: ListScope, slug: string): Promise<{ id: string }> {
    const title = await this.find(slug);
    const where = { profileId_titleId: { profileId: scope.profileId, titleId: title.id } };
    if (await this.prisma.watchlistItem.findUnique({ where, select: { id: true } })) {
      return title;
    }
    if (
      (await this.prisma.watchlistItem.count({ where: { profileId: scope.profileId } })) >=
      LIST_LIMIT
    ) {
      throw new ConflictException(`A list holds ${LIST_LIMIT} titles. Remove one to add another.`);
    }
    // Two devices may add the same title at the same moment: the second one finds it there.
    await this.prisma.watchlistItem.upsert({
      where,
      create: { ...scope, titleId: title.id },
      update: {},
    });
    return title;
  }

  /**
   * Takes a title off the list. Nothing happens when it was not on it.
   *
   * @throws NotFoundException when viewers cannot see the title.
   */
  async remove({ profileId }: ListScope, slug: string): Promise<{ id: string }> {
    const title = await this.find(slug);
    await this.prisma.watchlistItem.deleteMany({ where: { profileId, titleId: title.id } });
    return title;
  }

  /** Empties the list of the profile. @returns the number of titles that were on it. */
  async clear({ profileId }: ListScope): Promise<number> {
    const { count } = await this.prisma.watchlistItem.deleteMany({ where: { profileId } });
    return count;
  }

  /**
   * What the profiles of a viewer saved, for an admin.
   *
   * @throws NotFoundException when there is no such viewer.
   */
  async forAdmin(viewerId: string): Promise<ViewerListAdminView> {
    const viewer = await this.prisma.viewer.findUnique({
      where: { id: viewerId },
      select: { id: true },
    });
    if (!viewer) {
      throw new NotFoundException('Viewer not found');
    }
    const [total, rows] = await Promise.all([
      this.prisma.watchlistItem.count({ where: { viewerId } }),
      this.prisma.watchlistItem.findMany({
        where: { viewerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_LIST_LIMIT,
        include: {
          title: { select: { id: true, name: true, type: true, status: true } },
          profile: { select: { id: true, name: true } },
        },
      }),
    ]);
    const begun = await this.prisma.watchProgress.findMany({
      where: { viewerId, titleId: { in: rows.map((row) => row.titleId) } },
      select: { profileId: true, titleId: true },
    });
    const started = new Set(begun.map((row) => `${row.profileId}:${row.titleId}`));
    return {
      total,
      items: rows.map((row) => ({
        profile: row.profile,
        title: row.title,
        addedAt: row.createdAt,
        started: started.has(`${row.profileId}:${row.titleId}`),
      })),
    };
  }

  /**
   * What stands on lists: how much, and which titles the most. A title many
   * saved and few began is wanted and not yet watched.
   *
   * @param days What counts as added lately.
   */
  async saved(days: number, now = new Date()): Promise<SavedTitles> {
    const since = new Date(now.getTime() - days * 86_400_000);
    const [saves, recent, lists, titles, top] = await Promise.all([
      this.prisma.watchlistItem.count(),
      this.prisma.watchlistItem.count({ where: { createdAt: { gte: since } } }),
      this.prisma.watchlistItem.findMany({ distinct: ['profileId'], select: { profileId: true } }),
      this.prisma.watchlistItem.findMany({ distinct: ['titleId'], select: { titleId: true } }),
      this.prisma.$queryRaw<TopRow[]>(Prisma.sql`
        SELECT w."titleId",
               count(*)::int AS saves,
               (count(*) FILTER (WHERE w."createdAt" >= ${since}))::int AS recent,
               (count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM watch_progress p
                 WHERE p."profileId" = w."profileId" AND p."titleId" = w."titleId"
               )))::int AS started
        FROM watchlist_items w
        GROUP BY w."titleId"
        ORDER BY saves DESC, recent DESC, w."titleId"
        LIMIT ${TOP_SAVED}
      `),
    ]);
    const found = await this.prisma.title.findMany({
      where: { id: { in: top.map((row) => row.titleId) } },
      select: { id: true, name: true, type: true, poster: true },
    });
    const byId = new Map(found.map((title) => [title.id, title]));
    return {
      days,
      saves,
      recent,
      lists: lists.length,
      titles: titles.length,
      top: top.flatMap((row) => {
        const title = byId.get(row.titleId);
        return title
          ? [
              {
                title: {
                  id: title.id,
                  name: title.name,
                  type: title.type,
                  poster: toPublicImage(title.poster, this.config.mediaBaseUrl),
                },
                saves: row.saves,
                recent: row.recent,
                started: row.started,
              },
            ]
          : [];
      }),
    };
  }

  private async find(slug: string): Promise<{ id: string }> {
    const title = await this.prisma.title.findFirst({
      where: { slug, ...visibleTitle() },
      select: { id: true },
    });
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    return title;
  }
}
