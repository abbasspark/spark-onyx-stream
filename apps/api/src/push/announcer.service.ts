// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@onyx/database';
import { toImageView } from '../catalog/catalog.views.js';
import { VISIBLE_EPISODE, visibleTitle } from '../catalog/playable.js';
import { NotificationsService } from './notifications.service.js';
import {
  DIGEST_FROM,
  newEpisodesText,
  newTitlesDigestText,
  newTitleText,
} from './notification-texts.js';
import { PushSettingsService } from './push-settings.service.js';

/**
 * What was published has to stand this long before viewers are told. An
 * editor who publishes a season episode by episode gets one notification for
 * it, and one who publishes by mistake has a moment to take it back.
 */
export const SETTLE_MS = 2 * 60 * 1000;
/** Whoever watched a series within this time follows it. */
const FOLLOWING_DAYS = 180;
/** Viewers told in one go. */
const BATCH = 2000;

export interface Announced {
  /** Series whose followers were told of new episodes, and titles everybody was told of. */
  series: number;
  titles: number;
  notifications: number;
}

/**
 * Tells viewers what is new by itself: followers of a series when episodes
 * arrive, and everybody when titles arrive.
 *
 * It looks at what viewers can see now and nobody was told of yet. That
 * covers a title that waits for its start date and an episode whose video
 * finishes processing after it was published: both are told when they can
 * be watched, not before. What is found is marked as told whether or not
 * the installation tells, so that switching this on later does not announce
 * everything published until then.
 */
@Injectable()
export class AnnouncerService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(PushSettingsService) private readonly settings: PushSettingsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async announce(now: Date = new Date()): Promise<Announced> {
    const settled = new Date(now.getTime() - SETTLE_MS);
    const automatic = await this.settings.automatic();
    const result: Announced = { series: 0, titles: 0, notifications: 0 };

    // --- New titles -----------------------------------------------------------
    const titles = await this.prisma.title.findMany({
      where: { ...visibleTitle(now), announcedAt: null, publishedAt: { lte: settled } },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        tagline: true,
        backdrop: true,
        poster: true,
      },
    });
    if (titles.length > 0) {
      const ids = titles.map((title) => title.id);
      // Marked first: a failure afterwards costs a notification, never a second one.
      await this.prisma.$transaction([
        this.prisma.title.updateMany({ where: { id: { in: ids } }, data: { announcedAt: now } }),
        // The episodes a new series comes with are part of that news.
        this.prisma.episode.updateMany({
          where: { announcedAt: null, season: { titleId: { in: ids } } },
          data: { announcedAt: now },
        }),
      ]);
      if (automatic.newTitles) {
        const everybody = {
          status: 'ACTIVE' as const,
          NOT: { mutedTopics: { has: 'NEW_TITLES' as const } },
        };
        if (titles.length >= DIGEST_FROM) {
          result.notifications += await this.tell(everybody, {
            topic: 'NEW_TITLES',
            ...newTitlesDigestText(titles.map((title) => title.name)),
            link: '/browse',
            data: { type: 'link', path: '/browse' },
            dedupeKey: `titles:${titles[titles.length - 1]?.id}`,
          });
        } else {
          for (const title of titles) {
            const image = title.backdrop ?? title.poster;
            result.notifications += await this.tell(everybody, {
              topic: 'NEW_TITLES',
              ...newTitleText(title),
              imageUrl: image ? toImageView(image, '').url : null,
              link: `/title/${title.slug}`,
              data: { type: 'title', slug: title.slug },
              dedupeKey: `title:${title.id}`,
            });
          }
        }
        result.titles = titles.length;
      }
    }

    // --- New episodes of series viewers know already ------------------------------
    const episodes = await this.prisma.episode.findMany({
      where: {
        ...VISIBLE_EPISODE,
        announcedAt: null,
        publishedAt: { lte: settled },
        season: { title: { ...visibleTitle(now), announcedAt: { not: null } } },
      },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
      take: 500,
      select: {
        id: true,
        number: true,
        name: true,
        season: {
          select: {
            number: true,
            title: { select: { id: true, slug: true, name: true, backdrop: true, poster: true } },
          },
        },
      },
    });
    if (episodes.length > 0) {
      await this.prisma.episode.updateMany({
        where: { id: { in: episodes.map((episode) => episode.id) } },
        data: { announcedAt: now },
      });
      if (automatic.newEpisodes) {
        const bySeries = new Map<string, typeof episodes>();
        for (const episode of episodes) {
          const key = episode.season.title.id;
          bySeries.set(key, [...(bySeries.get(key) ?? []), episode]);
        }
        const since = new Date(now.getTime() - FOLLOWING_DAYS * 24 * 60 * 60 * 1000);
        for (const group of bySeries.values()) {
          const series = (group[0] as (typeof group)[number]).season.title;
          const image = series.backdrop ?? series.poster;
          const first = [...group].sort(
            (a, b) => a.season.number - b.season.number || a.number - b.number,
          )[0] as (typeof group)[number];
          result.notifications += await this.tell(
            {
              status: 'ACTIVE',
              NOT: { mutedTopics: { has: 'NEW_EPISODES' } },
              OR: [
                { saved: { some: { titleId: series.id } } },
                { watching: { some: { titleId: series.id, watchedAt: { gte: since } } } },
              ],
            },
            {
              topic: 'NEW_EPISODES',
              ...newEpisodesText(
                series.name,
                group.map((episode) => ({
                  season: episode.season.number,
                  number: episode.number,
                  name: episode.name,
                })),
              ),
              imageUrl: image ? toImageView(image, '').url : null,
              link: `/title/${series.slug}`,
              data: { type: 'episode', slug: series.slug, episodeId: first.id },
              dedupeKey: `episodes:${first.id}`,
            },
          );
          result.series += 1;
        }
      }
    }
    return result;
  }

  /** Makes a notification for every viewer a filter finds, a batch at a time. */
  private async tell(
    where: Prisma.ViewerWhereInput,
    content: Parameters<NotificationsService['create']>[1],
  ): Promise<number> {
    let made = 0;
    let after: string | undefined;
    for (;;) {
      const viewers = await this.prisma.viewer.findMany({
        where: { ...where, ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: 'asc' },
        take: BATCH,
        select: { id: true },
      });
      if (viewers.length === 0) {
        return made;
      }
      made += await this.notifications.create(
        viewers.map((viewer) => viewer.id),
        content,
      );
      after = viewers[viewers.length - 1]?.id;
    }
  }
}
