// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import { type PublicImage, toPublicImage } from '../catalog/public-catalog.views.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import type { SummaryInput, TitleInput, TitlesInput } from './analytics.schemas.js';
import { COMPLETE_SHARE, type PlayDevice, VIEW_SECONDS } from './play-rules.js';

/** A viewer counts as watching now when their player reported this recently. */
const NOW_SECONDS = 90;

/** The figures of a stretch of time. */
export interface Figures {
  /** Plays that counted: at least half a minute watched. */
  views: number;
  /** Different viewers among them. A visitor who is not signed in counts once per day. */
  viewers: number;
  /** Everything that was played, also what did not become a view. */
  watchSeconds: number;
  /** Views watched to the end, of all views, from 0 to 1. */
  completionRate: number;
  /** Seconds watched per view. */
  averageSeconds: number;
}

export interface DayFigures {
  /** "2026-12-24" */
  day: string;
  views: number;
  viewers: number;
  watchSeconds: number;
}

export interface TitleRef {
  id: string;
  name: string;
  type: 'MOVIE' | 'SERIES';
  poster: PublicImage | null;
}

export interface AnalyticsSummary {
  /** False when the installation records nothing: the figures are then empty. */
  recording: boolean;
  totals: Figures;
  /** The same number of days right before, to compare with. */
  previous: Figures;
  days: DayFigures[];
  devices: { device: PlayDevice; views: number; watchSeconds: number }[];
  audience: {
    /** Views by viewers who were signed in, and by visitors who were not. */
    signedIn: number;
    visitors: number;
    /** Views of titles that need a plan or a purchase, and of free ones. */
    paid: number;
    free: number;
  };
  /** Views by the hour of the day they began in, 0 to 23, in the time zone asked for. */
  hours: number[];
}

export interface TitleFigures extends Figures {
  /** Null for plays whose title was deleted since. */
  title: TitleRef | null;
}

export interface TitleAnalytics {
  title: TitleRef;
  totals: Figures;
  previous: Figures;
  days: DayFigures[];
  /** For a series: its episodes that were watched, in their order. */
  episodes: (Figures & {
    id: string;
    seasonNumber: number;
    number: number;
    name: string | null;
  })[];
  /**
   * How far viewers get: the share of views that reached at least 10 %, 20 %
   * ... 100 % of the video, from 0 to 1.
   */
  reach: number[];
  devices: { device: PlayDevice; views: number; watchSeconds: number }[];
  /** Plays of the trailer and of the extras, however short. */
  trailerPlays: number;
  extraPlays: number;
}

export interface WatchingNow {
  watching: number;
  titles: { title: TitleRef; watching: number }[];
}

interface FigureRow {
  views: number;
  viewers: number;
  watch_seconds: bigint | number | null;
  completed: number;
  view_seconds: bigint | number | null;
}

// The rules are constants of the code, so they are written into the query and not sent as values.
const VIEW = Prisma.raw(
  `p."watchedSeconds" >= CASE WHEN p."durationSeconds" > 0 THEN LEAST(${VIEW_SECONDS}, CEIL(p."durationSeconds" / 2.0)) ELSE ${VIEW_SECONDS} END`,
);
const COMPLETE = Prisma.raw(
  `p."durationSeconds" > 0 AND p."watchedSeconds" >= ${COMPLETE_SHARE} * p."durationSeconds"`,
);
const WHO = Prisma.sql`COALESCE(p."viewerId"::text, p."visitorKey", p.id::text)`;
const FIGURES = Prisma.sql`
  (COUNT(*) FILTER (WHERE ${VIEW}))::int AS views,
  (COUNT(DISTINCT ${WHO}) FILTER (WHERE ${VIEW}))::int AS viewers,
  COALESCE(SUM(p."watchedSeconds"), 0) AS watch_seconds,
  (COUNT(*) FILTER (WHERE ${VIEW} AND ${COMPLETE}))::int AS completed,
  COALESCE(SUM(p."watchedSeconds") FILTER (WHERE ${VIEW}), 0) AS view_seconds`;

function toFigures(row: FigureRow | undefined): Figures {
  const views = row?.views ?? 0;
  return {
    views,
    viewers: row?.viewers ?? 0,
    watchSeconds: Number(row?.watch_seconds ?? 0),
    completionRate: views > 0 ? (row?.completed ?? 0) / views : 0,
    averageSeconds: views > 0 ? Math.round(Number(row?.view_seconds ?? 0) / views) : 0,
  };
}

/** The day so many days before or after another, as "2026-12-24". */
function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(day) + by * 86_400_000).toISOString().slice(0, 10);
}

interface Range {
  from: string;
  to: string;
  timezone: string;
}

/**
 * The moment a play began, as the clock of a time zone showed it. The table
 * holds moments in UTC without saying so, hence the two steps.
 */
function local(timezone: string): Prisma.Sql {
  return Prisma.sql`((p."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`;
}

/** The plays that began on the days of a range, as the time zone counts days. */
function within(range: Range): Prisma.Sql {
  return Prisma.sql`p."startedAt" >= ((${range.from}::date::timestamp AT TIME ZONE ${range.timezone}) AT TIME ZONE 'UTC')
    AND p."startedAt" < (((${range.to}::date + 1)::timestamp AT TIME ZONE ${range.timezone}) AT TIME ZONE 'UTC')`;
}

/** The stretch of the same length right before a range. */
function before(range: Range): Range {
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  return { ...range, from: shiftDay(range.from, -days), to: shiftDay(range.from, -1) };
}

/**
 * What is watched: the figures the panel shows, counted from the plays.
 *
 * Only the movie or episode itself counts, not trailers and extras, and only
 * plays that lasted: half a minute, or half of a video shorter than a minute.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async summary(input: SummaryInput): Promise<AnalyticsSummary> {
    const scope = this.scope(input.type);
    const [totals, previous, days, devices, audience, hours] = await Promise.all([
      this.figures(input, scope),
      this.figures(before(input), scope),
      this.days(input, scope),
      this.devices(input, scope),
      this.prisma.$queryRaw<{ signed_in: number; visitors: number; paid: number; free: number }[]>`
        SELECT
          (COUNT(*) FILTER (WHERE p."viewerId" IS NOT NULL))::int AS signed_in,
          (COUNT(*) FILTER (WHERE p."viewerId" IS NULL))::int AS visitors,
          (COUNT(*) FILTER (WHERE p.paid))::int AS paid,
          (COUNT(*) FILTER (WHERE NOT p.paid))::int AS free
        FROM plays p ${scope.join}
        WHERE p.kind = 'MAIN' AND ${VIEW} AND ${within(input)} ${scope.where}`,
      this.prisma.$queryRaw<{ hour: number; views: number }[]>`
        SELECT EXTRACT(HOUR FROM ${local(input.timezone)})::int AS hour,
               COUNT(*)::int AS views
        FROM plays p ${scope.join}
        WHERE p.kind = 'MAIN' AND ${VIEW} AND ${within(input)} ${scope.where}
        GROUP BY 1`,
    ]);
    const byHour = new Map(hours.map((row) => [row.hour, row.views]));
    return {
      recording: this.config.viewingStatistics,
      totals,
      previous,
      days,
      devices,
      audience: {
        signedIn: audience[0]?.signed_in ?? 0,
        visitors: audience[0]?.visitors ?? 0,
        paid: audience[0]?.paid ?? 0,
        free: audience[0]?.free ?? 0,
      },
      hours: Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? 0),
    };
  }

  /** The titles that were watched, the most watched first. */
  async titles(input: TitlesInput): Promise<Page<TitleFigures>> {
    const scope = this.scope(input.type);
    const { skip, take } = toSkipTake(input);
    const order = {
      views: Prisma.sql`views DESC, watch_seconds DESC`,
      viewers: Prisma.sql`viewers DESC, views DESC`,
      watchSeconds: Prisma.sql`watch_seconds DESC, views DESC`,
      completion: Prisma.sql`(completed::float / NULLIF(views, 0)) DESC NULLS LAST, views DESC`,
    }[input.sort];
    const rows = await this.prisma.$queryRaw<(FigureRow & { title_id: string | null })[]>`
      SELECT * FROM (
        SELECT p."titleId" AS title_id, ${FIGURES}
        FROM plays p ${scope.join}
        WHERE p.kind = 'MAIN' AND ${within(input)} ${scope.where}
        GROUP BY p."titleId"
        HAVING COUNT(*) FILTER (WHERE ${VIEW}) > 0
      ) ranked
      ORDER BY ${order}, title_id
      LIMIT ${take} OFFSET ${skip}`;
    const total = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM (
        SELECT p."titleId" FROM plays p ${scope.join}
        WHERE p.kind = 'MAIN' AND ${within(input)} ${scope.where}
        GROUP BY p."titleId"
        HAVING COUNT(*) FILTER (WHERE ${VIEW}) > 0
      ) counted`;
    const refs = await this.refs(rows.flatMap((row) => row.title_id ?? []));
    return toPage(
      rows.map((row) => ({
        title: row.title_id ? (refs.get(row.title_id) ?? null) : null,
        ...toFigures(row),
      })),
      total[0]?.count ?? 0,
      input,
    );
  }

  /** @throws NotFoundException when the title does not exist. */
  async title(id: string, input: TitleInput): Promise<TitleAnalytics> {
    const title = (await this.refs([id])).get(id);
    if (!title) {
      throw new NotFoundException('Title not found');
    }
    const scope = { join: Prisma.empty, where: Prisma.sql`AND p."titleId" = ${id}::uuid` };
    const [totals, previous, days, devices, episodes, reach, others] = await Promise.all([
      this.figures(input, scope),
      this.figures(before(input), scope),
      this.days(input, scope),
      this.devices(input, scope),
      this.prisma.$queryRaw<
        (FigureRow & { id: string; season_number: number; number: number; name: string | null })[]
      >`
        SELECT e.id, s.number AS season_number, e.number, e.name, ${FIGURES}
        FROM plays p
        JOIN episodes e ON e.id = p."episodeId"
        JOIN seasons s ON s.id = e."seasonId"
        WHERE p.kind = 'MAIN' AND ${within(input)} ${scope.where}
        GROUP BY e.id, s.number, e.number, e.name
        HAVING COUNT(*) FILTER (WHERE ${VIEW}) > 0
        ORDER BY s.number, e.number`,
      this.prisma.$queryRaw<{ step: number; views: number }[]>`
        SELECT LEAST(10, FLOOR(10.0 * p."positionSeconds" / p."durationSeconds"))::int AS step,
               COUNT(*)::int AS views
        FROM plays p
        WHERE p.kind = 'MAIN' AND p."durationSeconds" > 0 AND ${VIEW} AND ${within(input)} ${scope.where}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ kind: string; plays: number }[]>`
        SELECT p.kind::text AS kind, COUNT(*)::int AS plays
        FROM plays p
        WHERE p.kind <> 'MAIN' AND p."watchedSeconds" > 0 AND ${within(input)} ${scope.where}
        GROUP BY 1`,
    ]);

    // A view that got to 70 % also got to 10 %, 20 % and so on.
    const measured = reach.reduce((sum, row) => sum + row.views, 0);
    const reached = Array.from({ length: 10 }, (_, index) => {
      const atLeast = reach
        .filter((row) => row.step >= index + 1)
        .reduce((sum, row) => sum + row.views, 0);
      return measured > 0 ? atLeast / measured : 0;
    });
    const plays = (kind: string) => others.find((row) => row.kind === kind)?.plays ?? 0;

    return {
      title,
      totals,
      previous,
      days,
      episodes: episodes.map((row) => ({
        id: row.id,
        seasonNumber: row.season_number,
        number: row.number,
        name: row.name,
        ...toFigures(row),
      })),
      reach: reached,
      devices,
      trailerPlays: plays('TRAILER'),
      extraPlays: plays('EXTRA'),
    };
  }

  /** Who is watching at this moment, and what. */
  async now(): Promise<WatchingNow> {
    const rows = await this.prisma.$queryRaw<{ title_id: string | null; watching: number }[]>`
      SELECT p."titleId" AS title_id, COUNT(*)::int AS watching
      FROM plays p
      WHERE p.kind = 'MAIN' AND p."watchedSeconds" > 0
        AND p."lastBeatAt" > (NOW() AT TIME ZONE 'UTC') - make_interval(secs => ${NOW_SECONDS}::int)
        AND p."lastBeatAt" <= (NOW() AT TIME ZONE 'UTC') + interval '1 minute'
      GROUP BY p."titleId"
      ORDER BY watching DESC
      LIMIT 20`;
    const refs = await this.refs(rows.flatMap((row) => row.title_id ?? []));
    return {
      watching: rows.reduce((sum, row) => sum + row.watching, 0),
      titles: rows.flatMap((row) => {
        const title = row.title_id ? refs.get(row.title_id) : undefined;
        return title ? [{ title, watching: row.watching }] : [];
      }),
    };
  }

  // --- Inside --------------------------------------------------------------------

  /** Narrows a question to movies or to series. */
  private scope(type: 'MOVIE' | 'SERIES' | undefined): { join: Prisma.Sql; where: Prisma.Sql } {
    return type
      ? {
          join: Prisma.sql`JOIN titles t ON t.id = p."titleId"`,
          where: Prisma.sql`AND t.type = ${type}::"TitleType"`,
        }
      : { join: Prisma.empty, where: Prisma.empty };
  }

  private async figures(
    range: Range,
    scope: { join: Prisma.Sql; where: Prisma.Sql },
  ): Promise<Figures> {
    const rows = await this.prisma.$queryRaw<FigureRow[]>`
      SELECT ${FIGURES}
      FROM plays p ${scope.join}
      WHERE p.kind = 'MAIN' AND ${within(range)} ${scope.where}`;
    return toFigures(rows[0]);
  }

  /** One entry per day of the range, also for days on which nothing was watched. */
  private async days(
    range: Range,
    scope: { join: Prisma.Sql; where: Prisma.Sql },
  ): Promise<DayFigures[]> {
    const rows = await this.prisma.$queryRaw<
      { day: string; views: number; viewers: number; watch_seconds: bigint | number }[]
    >`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
             COALESCE(f.views, 0)::int AS views,
             COALESCE(f.viewers, 0)::int AS viewers,
             COALESCE(f.watch_seconds, 0) AS watch_seconds
      FROM generate_series(${range.from}::date, ${range.to}::date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT ${local(range.timezone)}::date AS day,
               COUNT(*) FILTER (WHERE ${VIEW}) AS views,
               COUNT(DISTINCT ${WHO}) FILTER (WHERE ${VIEW}) AS viewers,
               SUM(p."watchedSeconds") AS watch_seconds
        FROM plays p ${scope.join}
        WHERE p.kind = 'MAIN' AND ${within(range)} ${scope.where}
        GROUP BY 1
      ) f ON f.day = d.day::date
      ORDER BY d.day`;
    return rows.map((row) => ({
      day: row.day,
      views: row.views,
      viewers: row.viewers,
      watchSeconds: Number(row.watch_seconds),
    }));
  }

  private async devices(range: Range, scope: { join: Prisma.Sql; where: Prisma.Sql }) {
    const rows = await this.prisma.$queryRaw<
      { device: PlayDevice; views: number; watch_seconds: bigint | number }[]
    >`
      SELECT p.device::text AS device, COUNT(*)::int AS views,
             COALESCE(SUM(p."watchedSeconds"), 0) AS watch_seconds
      FROM plays p ${scope.join}
      WHERE p.kind = 'MAIN' AND ${VIEW} AND ${within(range)} ${scope.where}
      GROUP BY 1
      ORDER BY views DESC, watch_seconds DESC, device`;
    return rows.map((row) => ({
      device: row.device,
      views: row.views,
      watchSeconds: Number(row.watch_seconds),
    }));
  }

  private async refs(ids: readonly string[]): Promise<Map<string, TitleRef>> {
    if (ids.length === 0) {
      return new Map();
    }
    const titles = await this.prisma.title.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, type: true, poster: true },
    });
    return new Map(
      titles.map((title) => [
        title.id,
        {
          id: title.id,
          name: title.name,
          type: title.type,
          poster: toPublicImage(title.poster, this.config.mediaBaseUrl),
        },
      ]),
    );
  }
}
