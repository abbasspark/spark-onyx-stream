// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';

export const CO_WATCH_SETTINGS_KEY = 'similar.watching';

/**
 * A pair of titles is only kept when this many accounts watched both. One
 * household can then never be read out of the list, and two viewers with an
 * odd taste do not steer what everybody is offered.
 */
export const MIN_SHARED_ACCOUNTS = 3;
/** How many partners are kept per title: more than is ever shown. */
export const KEEP_PER_TITLE = 40;
/** Only what was watched in this time counts: tastes of an audience move. */
export const WINDOW_DAYS = 365;
/** Per profile, only the titles watched last. Stops one profile from weighing on thousands of pairs. */
const MAX_TITLES_PER_PROFILE = 200;
/** How often the scheduler counts again. */
export const REBUILD_EVERY_MS = 6 * 60 * 60 * 1000;

/** What the last count found. */
export interface CoWatchState {
  rebuiltAt: string;
  /** Pairs kept, each counted once. */
  pairs: number;
  /** Titles that have at least one partner. */
  titles: number;
  /** Profiles whose watching was counted. */
  profiles: number;
  tookMs: number;
}

/**
 * Counts which titles are watched by the same people.
 *
 * A profile counts as having watched a title when it finished the film or an
 * episode, or got at least a third into it (ten minutes are enough for long
 * videos). Starting something and leaving says little about taste.
 *
 * The strength of a pair is the overlap divided by the root of the product of
 * both audiences. A title everybody watched is thereby not the partner of
 * everything.
 */
@Injectable()
export class CoWatchService {
  constructor(@Inject(PrismaClient) private readonly prisma: PrismaClient) {}

  /** What the last count found, or null before the first one. */
  async state(): Promise<CoWatchState | null> {
    const stored = await this.prisma.setting.findUnique({ where: { key: CO_WATCH_SETTINGS_KEY } });
    const value = stored?.value as Partial<CoWatchState> | null | undefined;
    return value && typeof value.rebuiltAt === 'string'
      ? {
          rebuiltAt: value.rebuiltAt,
          pairs: Number(value.pairs ?? 0),
          titles: Number(value.titles ?? 0),
          profiles: Number(value.profiles ?? 0),
          tookMs: Number(value.tookMs ?? 0),
        }
      : null;
  }

  /** Counts again when the last count is old enough. For the scheduler. */
  async rebuildIfDue(now = new Date()): Promise<CoWatchState | null> {
    const last = await this.state();
    if (last && now.getTime() - new Date(last.rebuiltAt).getTime() < REBUILD_EVERY_MS) {
      return null;
    }
    return this.rebuild(now);
  }

  /**
   * Counts everything again and replaces what was stored, in one transaction:
   * readers see the old pairs or the new ones, never half of each.
   */
  async rebuild(now = new Date()): Promise<CoWatchState> {
    const started = Date.now();
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const counted = await this.prisma.$transaction(
      async (tx) => {
        await tx.titleCoWatch.deleteMany({});
        await tx.$executeRaw(Prisma.sql`
          WITH watched AS (
            SELECT "profileId", "viewerId", "titleId", max("watchedAt") AS at
            FROM watch_progress
            WHERE "watchedAt" >= ${since}
              AND (
                "completedAt" IS NOT NULL
                OR ("durationSeconds" > 0
                    AND "positionSeconds" >= LEAST(600, "durationSeconds" * 0.3))
              )
            GROUP BY 1, 2, 3
          ),
          recent AS (
            SELECT "profileId", "viewerId", "titleId"
            FROM (
              SELECT *, row_number() OVER (PARTITION BY "profileId" ORDER BY at DESC) AS r
              FROM watched
            ) w
            WHERE r <= ${MAX_TITLES_PER_PROFILE}
          ),
          audience AS (
            SELECT "titleId", count(*)::float AS n FROM recent GROUP BY 1
          ),
          pairs AS (
            SELECT a."titleId" AS t, b."titleId" AS o, count(*)::int AS together
            FROM recent a
            JOIN recent b ON b."profileId" = a."profileId" AND b."titleId" <> a."titleId"
            GROUP BY 1, 2
            HAVING count(DISTINCT a."viewerId") >= ${MIN_SHARED_ACCOUNTS}
          ),
          ranked AS (
            SELECT p.t, p.o, p.together,
                   p.together / sqrt(x.n * y.n) AS strength,
                   row_number() OVER (
                     PARTITION BY p.t ORDER BY p.together / sqrt(x.n * y.n) DESC, p.o
                   ) AS r
            FROM pairs p
            JOIN audience x ON x."titleId" = p.t
            JOIN audience y ON y."titleId" = p.o
          )
          INSERT INTO title_co_watch ("titleId", "otherId", viewers, strength)
          SELECT t, o, together, LEAST(1, strength) FROM ranked WHERE r <= ${KEEP_PER_TITLE}
        `);
        const [row] = await tx.$queryRaw<
          { pairs: number; titles: number; profiles: number }[]
        >(Prisma.sql`
          SELECT
            (SELECT count(DISTINCT (LEAST("titleId", "otherId"), GREATEST("titleId", "otherId")))
               FROM title_co_watch)::int AS pairs,
            (SELECT count(DISTINCT "titleId") FROM title_co_watch)::int AS titles,
            (SELECT count(DISTINCT "profileId") FROM watch_progress
               WHERE "watchedAt" >= ${since})::int AS profiles
        `);
        return row;
      },
      { timeout: 10 * 60 * 1000, maxWait: 30 * 1000 },
    );

    const state: CoWatchState = {
      rebuiltAt: now.toISOString(),
      pairs: counted?.pairs ?? 0,
      titles: counted?.titles ?? 0,
      profiles: counted?.profiles ?? 0,
      tookMs: Date.now() - started,
    };
    await this.prisma.setting.upsert({
      where: { key: CO_WATCH_SETTINGS_KEY },
      create: { key: CO_WATCH_SETTINGS_KEY, value: { ...state } },
      update: { value: { ...state } },
    });
    return state;
  }
}
