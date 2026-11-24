// SPDX-License-Identifier: AGPL-3.0-only
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@onyx/database';
import type { PlayDevice } from '../analytics/play-rules.js';
import { type Page, toPage, toSkipTake } from '../common/pagination.js';
import { AppConfig } from '../config/app-config.js';
import type { FailuresInput, QualityInput } from './quality.schemas.js';

/** How playback went for a set of playbacks. */
export interface QualityFigures {
  /** Playbacks a player reported on. */
  attempts: number;
  /** Of those, the ones that showed a picture. */
  started: number;
  /** A problem ended it before the first picture. */
  startFailures: number;
  /** The viewer left before the first picture, without a problem being reported. */
  leftBeforeStart: number;
  /** A problem ended it after it had started. */
  playbackFailures: number;
  /** Time to the first picture: half of the starts were faster than this, and 95 of 100. Milliseconds. */
  startupP50Ms: number | null;
  startupP95Ms: number | null;
  /** Started playbacks that stopped to load at least once. */
  stalledSessions: number;
  stallCount: number;
  stallMs: number;
  playedSeconds: number;
  /** The share of the time spent waiting instead of watching, from 0 to 1. */
  rebufferRatio: number;
  /** The average bitrate, weighted by how long each playback played. Kilobits per second. */
  bitrateKbps: number | null;
}

export interface QualityGroup extends QualityFigures {
  key: string;
}

export interface QualityDay extends QualityFigures {
  /** As "2026-12-24". */
  day: string;
}

export interface QualityError {
  code: string;
  sessions: number;
  /** Of those, how many never showed a picture. */
  beforeStart: number;
  /** What players said most often, cleaned of addresses. */
  message: string | null;
  lastAt: Date;
}

export interface QualitySubject extends QualityFigures {
  kind: 'title' | 'channel';
  id: string;
  name: string;
  /** For a title: MOVIE or SERIES. */
  type: string | null;
}

export interface QualitySummary {
  /** False when the installation records nothing: PLAYBACK_REPORTS is off. */
  recording: boolean;
  /** Days a report is kept. 0: for good. */
  keptDays: number;
  totals: QualityFigures;
  /** The same figures for the stretch of the same length right before. */
  previous: QualityFigures;
  days: QualityDay[];
  devices: QualityGroup[];
  /** "origin" is the main server, anything else the host of an edge. */
  servers: QualityGroup[];
  /** Players by name and version, as "web 1.4.0". */
  players: QualityGroup[];
  /** How long was played in which height of picture. */
  heights: { height: number; sessions: number; playedSeconds: number }[];
  errors: QualityError[];
  /** The titles and channels with the most trouble, among those played often enough to say. */
  troubled: QualitySubject[];
  /** Every server playbacks went to in the range, for a filter. */
  knownServers: string[];
}

export interface QualityFailure {
  id: string;
  startedAt: Date;
  kind: 'VIDEO' | 'LIVE';
  /** What was played, in words: a title, "Title · S1 E3", or a channel. Null when it was deleted since. */
  subject: string | null;
  titleId: string | null;
  titleType: string | null;
  channelId: string | null;
  device: PlayDevice;
  server: string;
  player: string | null;
  playerVersion: string | null;
  code: string;
  message: string | null;
  /** Null: it never started. */
  startupMs: number | null;
  /** Where in the video it was, in seconds. */
  atSeconds: number | null;
  playedSeconds: number;
}

interface FigureRow {
  attempts: number;
  started: number;
  start_failures: number;
  left_before: number;
  playback_failures: number;
  startup_p50: number | null;
  startup_p95: number | null;
  stalled: number;
  stall_count: bigint | number;
  stall_ms: bigint | number;
  played_seconds: bigint | number;
  bitrate_weight: bigint | number | null;
  bitrate_seconds: bigint | number | null;
}

/** A subject needs this many playbacks before it is called troubled: one bad evening of one viewer is not the title. */
export const MIN_ATTEMPTS_TO_JUDGE = 5;
const TROUBLED_SHOWN = 8;
const GROUPS_SHOWN = 12;

const STARTED = Prisma.sql`s."startupMs" IS NOT NULL`;
const FAILED = Prisma.sql`s."errorCode" IS NOT NULL`;

const FIGURES = Prisma.sql`
  COUNT(*)::int AS attempts,
  (COUNT(*) FILTER (WHERE ${STARTED}))::int AS started,
  (COUNT(*) FILTER (WHERE NOT ${STARTED} AND ${FAILED}))::int AS start_failures,
  (COUNT(*) FILTER (WHERE NOT ${STARTED} AND NOT ${FAILED}))::int AS left_before,
  (COUNT(*) FILTER (WHERE ${STARTED} AND ${FAILED}))::int AS playback_failures,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY s."startupMs"))::float AS startup_p50,
  (percentile_cont(0.95) WITHIN GROUP (ORDER BY s."startupMs"))::float AS startup_p95,
  (COUNT(*) FILTER (WHERE s."stallCount" > 0))::int AS stalled,
  COALESCE(SUM(s."stallCount"), 0) AS stall_count,
  COALESCE(SUM(s."stallMs"), 0) AS stall_ms,
  COALESCE(SUM(s."playedSeconds"), 0) AS played_seconds,
  SUM(s."bitrateKbps"::bigint * s."playedSeconds") FILTER (WHERE s."bitrateKbps" IS NOT NULL)
    AS bitrate_weight,
  SUM(s."playedSeconds") FILTER (WHERE s."bitrateKbps" IS NOT NULL) AS bitrate_seconds`;

export function toFigures(row: FigureRow | undefined): QualityFigures {
  const stallMs = Number(row?.stall_ms ?? 0);
  const playedSeconds = Number(row?.played_seconds ?? 0);
  const total = playedSeconds * 1000 + stallMs;
  const bitrateSeconds = Number(row?.bitrate_seconds ?? 0);
  return {
    attempts: row?.attempts ?? 0,
    started: row?.started ?? 0,
    startFailures: row?.start_failures ?? 0,
    leftBeforeStart: row?.left_before ?? 0,
    playbackFailures: row?.playback_failures ?? 0,
    startupP50Ms: row?.startup_p50 == null ? null : Math.round(row.startup_p50),
    startupP95Ms: row?.startup_p95 == null ? null : Math.round(row.startup_p95),
    stalledSessions: row?.stalled ?? 0,
    stallCount: Number(row?.stall_count ?? 0),
    stallMs,
    playedSeconds,
    rebufferRatio: total > 0 ? stallMs / total : 0,
    bitrateKbps:
      bitrateSeconds > 0 ? Math.round(Number(row?.bitrate_weight ?? 0) / bitrateSeconds) : null,
  };
}

function shiftDay(day: string, by: number): string {
  return new Date(Date.parse(day) + by * 86_400_000).toISOString().slice(0, 10);
}

interface Range {
  from: string;
  to: string;
  timezone: string;
}

/** The moment a playback began, as the clock of a time zone showed it. */
function local(timezone: string): Prisma.Sql {
  return Prisma.sql`((s."startedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})`;
}

function within(range: Range): Prisma.Sql {
  return Prisma.sql`s."startedAt" >= ((${range.from}::date::timestamp AT TIME ZONE ${range.timezone}) AT TIME ZONE 'UTC')
    AND s."startedAt" < (((${range.to}::date + 1)::timestamp AT TIME ZONE ${range.timezone}) AT TIME ZONE 'UTC')`;
}

function before(range: Range): Range {
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 + 1;
  return { ...range, from: shiftDay(range.from, -days), to: shiftDay(range.from, -1) };
}

/**
 * How playback goes: the figures the panel shows, counted from what players
 * reported. Only playbacks a player reported on are counted. One that was
 * asked for and never heard of again says nothing either way.
 */
@Injectable()
export class QualityService {
  constructor(
    @Inject(PrismaClient) private readonly prisma: PrismaClient,
    @Inject(AppConfig) private readonly config: AppConfig,
  ) {}

  async summary(input: QualityInput): Promise<QualitySummary> {
    const range: Range = { from: input.from, to: input.to, timezone: input.timezone };
    const where = this.scope(input);
    const [totals, previous, days, devices, servers, players, heights, errors, troubled, known] =
      await Promise.all([
        this.figures(range, where),
        this.figures(before(range), where),
        this.days(range, where),
        this.groups(range, where, Prisma.sql`s.device::text`),
        this.groups(range, where, Prisma.sql`s.server`),
        this.groups(
          range,
          where,
          Prisma.sql`COALESCE(s.player || COALESCE(' ' || s."playerVersion", ''), 'unknown')`,
        ),
        this.heights(range, where),
        this.errors(range, where),
        this.troubled(range, where),
        // The filter offers every server of the range, whatever else is filtered by.
        this.prisma.$queryRaw<{ server: string }[]>`
          SELECT DISTINCT s.server FROM playback_sessions s
          WHERE s."reportedAt" IS NOT NULL AND ${within(range)}
          ORDER BY 1 LIMIT 50`,
      ]);
    return {
      recording: this.config.playbackReports,
      keptDays: this.config.playbackReportsDays,
      totals,
      previous,
      days,
      devices,
      servers,
      players,
      heights,
      errors,
      troubled,
      knownServers: known.map((row) => row.server),
    };
  }

  /** The playbacks that a problem ended, the newest first. */
  async failures(input: FailuresInput): Promise<Page<QualityFailure>> {
    const range: Range = { from: input.from, to: input.to, timezone: input.timezone };
    const where = Prisma.sql`${this.scope(input)} AND ${FAILED} ${
      input.code ? Prisma.sql`AND s."errorCode" = ${input.code}` : Prisma.empty
    }`;
    const { skip, take } = toSkipTake(input);
    const [rows, [count]] = await Promise.all([
      this.prisma.$queryRaw<
        (Omit<QualityFailure, 'subject'> & {
          titleName: string | null;
          channelName: string | null;
          seasonNumber: number | null;
          episodeNumber: number | null;
        })[]
      >`
        SELECT s.id, s."startedAt", s.kind::text AS kind, s.device::text AS device, s.server,
               s.player, s."playerVersion", s."errorCode" AS code, s."errorMessage" AS message,
               s."startupMs", s."errorAtSeconds" AS "atSeconds", s."playedSeconds",
               s."titleId", t.type::text AS "titleType", s."channelId",
               t.name AS "titleName", c.name AS "channelName",
               n.number AS "seasonNumber", e.number AS "episodeNumber"
        FROM playback_sessions s
        LEFT JOIN titles t ON t.id = s."titleId"
        LEFT JOIN episodes e ON e.id = s."episodeId"
        LEFT JOIN seasons n ON n.id = e."seasonId"
        LEFT JOIN channels c ON c.id = s."channelId"
        WHERE s."reportedAt" IS NOT NULL AND ${within(range)} ${where}
        ORDER BY s."startedAt" DESC, s.id DESC
        LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM playback_sessions s
        WHERE s."reportedAt" IS NOT NULL AND ${within(range)} ${where}`,
    ]);
    return toPage(
      rows.map(({ titleName, channelName, seasonNumber, episodeNumber, ...row }) => ({
        ...row,
        subject:
          channelName ??
          (titleName && seasonNumber !== null && episodeNumber !== null
            ? `${titleName} · S${seasonNumber} E${episodeNumber}`
            : titleName),
      })),
      count?.total ?? 0,
      input,
    );
  }

  /** What narrows every figure of a question: videos or channels, a kind of device, a server. */
  private scope(input: Pick<QualityInput, 'kind' | 'device' | 'server'>): Prisma.Sql {
    return Prisma.sql`${
      input.kind ? Prisma.sql`AND s.kind = ${input.kind}::"PlaybackSessionKind"` : Prisma.empty
    } ${input.device ? Prisma.sql`AND s.device = ${input.device}::"PlayDevice"` : Prisma.empty} ${
      input.server ? Prisma.sql`AND s.server = ${input.server}` : Prisma.empty
    }`;
  }

  private async figures(range: Range, where: Prisma.Sql): Promise<QualityFigures> {
    const rows = await this.prisma.$queryRaw<FigureRow[]>`
      SELECT ${FIGURES}
      FROM playback_sessions s
      WHERE s."reportedAt" IS NOT NULL AND ${within(range)} ${where}`;
    return toFigures(rows[0]);
  }

  /** One entry per day of the range, also for days on which nothing was played. */
  private async days(range: Range, where: Prisma.Sql): Promise<QualityDay[]> {
    const rows = await this.prisma.$queryRaw<(FigureRow & { day: string })[]>`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, f.*
      FROM generate_series(${range.from}::date, ${range.to}::date, interval '1 day') AS d(day)
      LEFT JOIN (
        SELECT ${local(range.timezone)}::date AS on_day, ${FIGURES}
        FROM playback_sessions s
        WHERE s."reportedAt" IS NOT NULL AND ${within(range)} ${where}
        GROUP BY 1
      ) f ON f.on_day = d.day::date
      ORDER BY d.day`;
    return rows.map((row) => ({ day: row.day, ...toFigures(row) }));
  }

  private async groups(range: Range, where: Prisma.Sql, by: Prisma.Sql): Promise<QualityGroup[]> {
    const rows = await this.prisma.$queryRaw<(FigureRow & { key: string })[]>`
      SELECT ${by} AS key, ${FIGURES}
      FROM playback_sessions s
      WHERE s."reportedAt" IS NOT NULL AND ${within(range)} ${where}
      GROUP BY 1
      ORDER BY attempts DESC, key
      LIMIT ${GROUPS_SHOWN}`;
    return rows.map((row) => ({ key: row.key, ...toFigures(row) }));
  }

  private async heights(range: Range, where: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<
      { height: number; sessions: number; played_seconds: bigint | number }[]
    >`
      SELECT s.height::int AS height, COUNT(*)::int AS sessions,
             COALESCE(SUM(s."playedSeconds"), 0) AS played_seconds
      FROM playback_sessions s
      WHERE s."reportedAt" IS NOT NULL AND s.height IS NOT NULL AND ${STARTED}
        AND ${within(range)} ${where}
      GROUP BY 1
      ORDER BY 1 DESC`;
    return rows.map((row) => ({
      height: row.height,
      sessions: row.sessions,
      playedSeconds: Number(row.played_seconds),
    }));
  }

  private errors(range: Range, where: Prisma.Sql): Promise<QualityError[]> {
    return this.prisma.$queryRaw<QualityError[]>`
      SELECT s."errorCode" AS code, COUNT(*)::int AS sessions,
             (COUNT(*) FILTER (WHERE NOT ${STARTED}))::int AS "beforeStart",
             mode() WITHIN GROUP (ORDER BY s."errorMessage") AS message,
             MAX(s."startedAt") AS "lastAt"
      FROM playback_sessions s
      WHERE s."reportedAt" IS NOT NULL AND ${FAILED} AND ${within(range)} ${where}
      GROUP BY 1
      ORDER BY sessions DESC, code
      LIMIT ${GROUPS_SHOWN}`;
  }

  /**
   * The titles and channels where the most goes wrong: by the share of
   * playbacks that failed, then by the share of time spent waiting. Only
   * those with enough playbacks to say, and only those with any trouble.
   */
  private async troubled(range: Range, where: Prisma.Sql): Promise<QualitySubject[]> {
    const rows = await this.prisma.$queryRaw<
      (FigureRow & { kind: 'title' | 'channel'; id: string; name: string; type: string | null })[]
    >`
      SELECT g.*, COALESCE(t.name, c.name) AS name, t.type::text AS type
      FROM (
        SELECT CASE WHEN s."channelId" IS NOT NULL THEN 'channel' ELSE 'title' END AS kind,
               COALESCE(s."channelId", s."titleId") AS id, ${FIGURES}
        FROM playback_sessions s
        WHERE s."reportedAt" IS NOT NULL AND COALESCE(s."channelId", s."titleId") IS NOT NULL
          AND ${within(range)} ${where}
        GROUP BY 1, 2
        HAVING COUNT(*) >= ${MIN_ATTEMPTS_TO_JUDGE}
           AND (COUNT(*) FILTER (WHERE ${FAILED}) > 0 OR SUM(s."stallMs") > 0)
      ) g
      LEFT JOIN titles t ON g.kind = 'title' AND t.id = g.id
      LEFT JOIN channels c ON g.kind = 'channel' AND c.id = g.id
      WHERE COALESCE(t.name, c.name) IS NOT NULL
      ORDER BY (g.start_failures + g.playback_failures)::float / g.attempts DESC,
               g.stall_ms::float / GREATEST(g.played_seconds * 1000 + g.stall_ms, 1) DESC,
               g.attempts DESC, g.id
      LIMIT ${TROUBLED_SHOWN}`;
    return rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      name: row.name,
      type: row.type,
      ...toFigures(row),
    }));
  }
}
